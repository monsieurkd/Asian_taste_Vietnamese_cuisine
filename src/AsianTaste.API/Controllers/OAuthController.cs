using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Services.Lightspeed;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for Lightspeed OAuth authentication flow.
/// </summary>
[ApiController]
[Route("api/oauth")]
public class OAuthController : ControllerBase
{
    private readonly ILightspeedAuthService _authService;
    private readonly ILogger<OAuthController> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;

    // Simple in-memory state storage (in production, use Redis or a database)
    private static readonly Dictionary<string, OAuthStateData> States = new();
    private static readonly System.Timers.Timer StateCleanupTimer;

    static OAuthController()
    {
        // Clean up expired states every 5 minutes
        StateCleanupTimer = new System.Timers.Timer(300000);
        StateCleanupTimer.Elapsed += (s, e) =>
        {
            var expired = States.Where(kvp =>
                kvp.Value.CreatedAt < DateTime.UtcNow.AddMinutes(-10)).ToList();
            foreach (var entry in expired)
            {
                States.Remove(entry.Key);
            }
        };
        StateCleanupTimer.Start();
    }

    public OAuthController(
        ILightspeedAuthService authService,
        ILogger<OAuthController> logger,
        IHttpContextAccessor httpContextAccessor)
    {
        _authService = authService;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>
    /// Initiates OAuth flow - redirect user to Lightspeed authorization page.
    /// GET: /api/oauth/authorize
    /// </summary>
    /// <param name="redirectUrl">Optional URL to redirect to after successful connection.</param>
    /// <returns>Redirect to Lightspeed or JSON with authorization URL.</returns>
    [HttpGet("authorize")]
    [ProducesResponseType(typeof(AuthorizationUrlResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult Authorize([FromQuery] string? redirectUrl)
    {
        try
        {
            // Generate a secure random state for CSRF protection
            var state = Guid.NewGuid().ToString("N");

            // Store state with metadata
            States[state] = new OAuthStateData
            {
                State = state,
                CreatedAt = DateTime.UtcNow,
                RedirectUrl = redirectUrl ?? "/"
            };

            // Generate authorization URL
            var authUrl = _authService.GetAuthorizationUrl(state);

            _logger.LogInformation("Initiating OAuth flow with state {State}", state);

            // If request is from browser, redirect directly
            if (IsBrowserRequest())
            {
                return Redirect(authUrl);
            }

            // Otherwise return the URL for handling by frontend
            return Ok(new AuthorizationUrlResponse
            {
                AuthorizationUrl = authUrl,
                State = state
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "OAuth configuration error");
            return BadRequest(new ErrorResponse
            {
                Error = "configuration_error",
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// OAuth callback endpoint - Lightspeed redirects here after user authorization.
    /// GET: /api/oauth/callback?code=xxx&state=xxx
    /// </summary>
    /// <param name="code">Authorization code from Lightspeed.</param>
    /// <param name="state">State parameter for CSRF verification.</param>
    /// <param name="error">Error code if authorization failed.</param>
    /// <param name="error_description">Error description if authorization failed.</param>
    /// <returns>Success or error response.</returns>
    [HttpGet("callback")]
    [ProducesResponseType(typeof(CallbackSuccessResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery] string? error_description)
    {
        // Handle authorization error from Lightspeed
        if (!string.IsNullOrEmpty(error))
        {
            _logger.LogWarning("OAuth authorization failed: {Error} - {Description}",
                error, error_description);

            return BadRequest(new ErrorResponse
            {
                Error = error,
                Message = error_description ?? "Authorization failed"
            });
        }

        // Validate required parameters
        if (string.IsNullOrEmpty(code))
        {
            return BadRequest(new ErrorResponse
            {
                Error = "invalid_request",
                Message = "Authorization code is required"
            });
        }

        if (string.IsNullOrEmpty(state))
        {
            return BadRequest(new ErrorResponse
            {
                Error = "invalid_request",
                Message = "State parameter is required"
            });
        }

        // Verify state for CSRF protection
        if (!States.TryGetValue(state, out var stateData))
        {
            _logger.LogWarning("Invalid or expired state parameter: {State}", state);
            return BadRequest(new ErrorResponse
            {
                Error = "invalid_state",
                Message = "Invalid or expired state parameter"
            });
        }

        // Remove used state
        States.Remove(state);

        // Exchange code for token
        var tokenResponse = await _authService.ExchangeCodeForTokenAsync(code, state);

        if (!tokenResponse.IsSuccess)
        {
            _logger.LogError("Token exchange failed: {Error} - {Description}",
                tokenResponse.Error, tokenResponse.ErrorDescription);

            return BadRequest(new ErrorResponse
            {
                Error = tokenResponse.Error ?? "exchange_failed",
                Message = tokenResponse.ErrorDescription ?? "Failed to exchange authorization code"
            });
        }

        // Store the token
        var token = new LightspeedToken
        {
            AccountId = tokenResponse.AccountId ?? string.Empty,
            AccessToken = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken,
            ExpiresAt = DateTime.UtcNow.AddSeconds(tokenResponse.ExpiresIn),
            TokenType = tokenResponse.TokenType,
            Scope = tokenResponse.Scope ?? string.Empty,
            IsActive = true
        };

        await _authService.StoreTokenAsync(token);

        _logger.LogInformation("Successfully connected to Lightspeed account {AccountId}",
            token.AccountId);

        // If browser request, redirect to success page
        if (IsBrowserRequest())
        {
            var redirectUrl = stateData.RedirectUrl;
            return Redirect($"{redirectUrl}?connected=true&account={Uri.EscapeDataString(token.AccountId)}");
        }

        return Ok(new CallbackSuccessResponse
        {
            Success = true,
            AccountId = token.AccountId,
            ConnectedAt = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Gets the current connection status.
    /// GET: /api/oauth/status
    /// </summary>
    /// <param name="restaurantId">Optional restaurant ID.</param>
    /// <returns>Connection status information.</returns>
    [HttpGet("status")]
    [ProducesResponseType(typeof(ConnectionStatusResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ConnectionStatusResponse>> GetStatus(
        [FromQuery] int? restaurantId)
    {
        var token = await _authService.GetTokenAsync(restaurantId);

        if (token == null)
        {
            return Ok(new ConnectionStatusResponse
            {
                IsConnected = false,
                AccountId = null,
                TokenValidUntil = null
            });
        }

        var isValid = _authService.IsTokenValid(token);

        return Ok(new ConnectionStatusResponse
        {
            IsConnected = token.IsActive && isValid,
            AccountId = token.AccountId,
            TokenValidUntil = token.ExpiresAt
        });
    }

    /// <summary>
    /// Disconnects from Lightspeed by deactivating the token.
    /// POST: /api/oauth/disconnect
    /// </summary>
    /// <param name="restaurantId">Optional restaurant ID.</param>
    [HttpPost("disconnect")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Disconnect([FromQuery] int? restaurantId)
    {
        var token = await _authService.GetTokenAsync(restaurantId);

        if (token != null)
        {
            token.IsActive = false;
            await _authService.StoreTokenAsync(token); // This updates the token
        }

        _logger.LogInformation("Disconnected from Lightspeed");

        return NoContent();
    }

    private bool IsBrowserRequest()
    {
        var accept = _httpContextAccessor.HttpContext?.Request.Headers["Accept"].ToString();
        return string.IsNullOrEmpty(accept) || accept.Contains("text/html");
    }
}

#region Response DTOs

public class AuthorizationUrlResponse
{
    public string AuthorizationUrl { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
}

public class CallbackSuccessResponse
{
    public bool Success { get; set; }
    public string AccountId { get; set; } = string.Empty;
    public DateTime ConnectedAt { get; set; }
}

public class ConnectionStatusResponse
{
    public bool IsConnected { get; set; }
    public string? AccountId { get; set; }
    public DateTime? TokenValidUntil { get; set; }
}

public class ErrorResponse
{
    public string Error { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public class OAuthStateData
{
    public string State { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string RedirectUrl { get; set; } = "/";
}

#endregion
