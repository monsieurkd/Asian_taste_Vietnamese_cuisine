using System.Text;
using System.Text.Json;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Lightspeed;

namespace AsianTaste.API.Services.Lightspeed;

/// <summary>
/// Lightspeed K-Series OAuth authentication service implementation.
/// Handles OAuth flow, token storage, and token refresh.
/// </summary>
public class LightspeedAuthService : ILightspeedAuthService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly ILogger<LightspeedAuthService> _logger;
    private readonly ILightspeedRepository _repository;
    private readonly IEncryptionService _encryption;

    private const string TokenUrl = "https://cloud.lightspeedapp.com/oauth/access_token.php";
    private const string AuthUrl = "https://cloud.lightspeedapp.com/oauth/authorize.php";

    // Required OAuth scopes
    private const string DefaultScopes = "employee:all,order:read,order:write,product:read,payment:read,payment:write,register:read";

    public LightspeedAuthService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<LightspeedAuthService> logger,
        ILightspeedRepository repository,
        IEncryptionService encryption)
    {
        _httpClient = httpClientFactory.CreateClient("Lightspeed");
        _config = config;
        _logger = logger;
        _repository = repository;
        _encryption = encryption;
    }

    public async Task<LightspeedTokenResponse> ExchangeCodeForTokenAsync(string code, string state)
    {
        try
        {
            var clientId = _config["Lightspeed:ClientId"];
            var clientSecret = _config["Lightspeed:ClientSecret"];

            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
            {
                _logger.LogError("Lightspeed OAuth credentials not configured");
                return new LightspeedTokenResponse
                {
                    Error = "configuration_error",
                    ErrorDescription = "OAuth credentials not configured"
                };
            }

            var requestBody = new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["code"] = code,
                ["grant_type"] = "authorization_code"
            };

            var response = await _httpClient.PostAsync(TokenUrl,
                new FormUrlEncodedContent(requestBody));

            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Token exchange failed: {StatusCode} - {Content}",
                    response.StatusCode, content);
                return new LightspeedTokenResponse
                {
                    Error = "exchange_failed",
                    ErrorDescription = $"HTTP {response.StatusCode}"
                };
            }

            // Parse JSON response
            var tokenData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(content);

            if (tokenData == null)
            {
                return new LightspeedTokenResponse
                {
                    Error = "parse_error",
                    ErrorDescription = "Failed to parse token response"
                };
            }

            // Check for error in response
            if (tokenData.TryGetValue("error", out var errorElement))
            {
                return new LightspeedTokenResponse
                {
                    Error = errorElement.GetString() ?? "unknown_error",
                    ErrorDescription = tokenData.TryGetValue("error_description", out var descElement)
                        ? descElement.GetString()
                        : null
                };
            }

            var result = new LightspeedTokenResponse
            {
                AccessToken = tokenData.TryGetValue("access_token", out var atElement)
                    ? atElement.GetString() ?? string.Empty
                    : string.Empty,
                RefreshToken = tokenData.TryGetValue("refresh_token", out var rtElement)
                    ? rtElement.GetString() ?? string.Empty
                    : string.Empty,
                TokenType = tokenData.TryGetValue("token_type", out var ttElement)
                    ? ttElement.GetString() ?? "Bearer"
                    : "Bearer",
                ExpiresIn = tokenData.TryGetValue("expires_in", out var eiElement)
                    ? eiElement.GetInt32()
                    : 3600,
                Scope = tokenData.TryGetValue("scope", out var sElement)
                    ? sElement.GetString()
                    : null
            };

            // Lightspeed may include account_id in the token response
            // Or we need to fetch it from the API
            if (tokenData.TryGetValue("account_id", out var accElement))
            {
                result.AccountId = accElement.ToString();
            }

            _logger.LogInformation("Successfully exchanged code for access token");

            return result;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error during token exchange");
            return new LightspeedTokenResponse
            {
                Error = "network_error",
                ErrorDescription = ex.Message
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during token exchange");
            return new LightspeedTokenResponse
            {
                Error = "unexpected_error",
                ErrorDescription = ex.Message
            };
        }
    }

    public async Task<LightspeedTokenResponse> RefreshTokenAsync(string refreshToken)
    {
        try
        {
            var clientId = _config["Lightspeed:ClientId"];
            var clientSecret = _config["Lightspeed:ClientSecret"];

            // Decrypt the refresh token first
            var decryptedRefreshToken = _encryption.Decrypt(refreshToken);

            var requestBody = new Dictionary<string, string>
            {
                ["client_id"] = clientId ?? string.Empty,
                ["client_secret"] = clientSecret ?? string.Empty,
                ["refresh_token"] = decryptedRefreshToken,
                ["grant_type"] = "refresh_token"
            };

            var response = await _httpClient.PostAsync(TokenUrl,
                new FormUrlEncodedContent(requestBody));

            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Token refresh failed: {StatusCode} - {Content}",
                    response.StatusCode, content);
                return new LightspeedTokenResponse
                {
                    Error = "refresh_failed",
                    ErrorDescription = $"HTTP {response.StatusCode}"
                };
            }

            var tokenData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(content);

            if (tokenData?.TryGetValue("error", out var errorElement) == true)
            {
                return new LightspeedTokenResponse
                {
                    Error = errorElement.GetString() ?? "unknown_error",
                    ErrorDescription = tokenData.TryGetValue("error_description", out var descElement)
                        ? descElement.GetString()
                        : null
                };
            }

            if (tokenData == null)
            {
                return new LightspeedTokenResponse
                {
                    Error = "parse_error",
                    ErrorDescription = "Failed to parse token response"
                };
            }

            return new LightspeedTokenResponse
            {
                AccessToken = tokenData.TryGetValue("access_token", out var atElement)
                    ? atElement.GetString() ?? string.Empty
                    : string.Empty,
                RefreshToken = tokenData.TryGetValue("refresh_token", out var rtElement)
                    ? rtElement.GetString() ?? string.Empty
                    : string.Empty,
                TokenType = tokenData.TryGetValue("token_type", out var ttElement)
                    ? ttElement.GetString() ?? "Bearer"
                    : "Bearer",
                ExpiresIn = tokenData.TryGetValue("expires_in", out var eiElement)
                    ? eiElement.GetInt32()
                    : 3600,
                Scope = tokenData.TryGetValue("scope", out var sElement)
                    ? sElement.GetString()
                    : null
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing token");
            return new LightspeedTokenResponse
            {
                Error = "refresh_error",
                ErrorDescription = ex.Message
            };
        }
    }

    public async Task<string> GetValidAccessTokenAsync(int? restaurantId = null)
    {
        var token = await _repository.GetActiveTokenAsync(restaurantId);

        if (token == null)
        {
            throw new InvalidOperationException(
                "No active Lightspeed token found. Please complete OAuth flow.");
        }

        if (!IsTokenValid(token))
        {
            _logger.LogInformation("Token expired, refreshing...");

            var newTokenResponse = await RefreshTokenAsync(token.RefreshToken);

            if (!newTokenResponse.IsSuccess)
            {
                throw new InvalidOperationException(
                    $"Failed to refresh token: {newTokenResponse.Error}");
            }

            // Update existing token
            token.AccessToken = _encryption.Encrypt(newTokenResponse.AccessToken);
            if (!string.IsNullOrEmpty(newTokenResponse.RefreshToken))
            {
                token.RefreshToken = _encryption.Encrypt(newTokenResponse.RefreshToken);
            }
            token.ExpiresAt = DateTime.UtcNow.AddSeconds(newTokenResponse.ExpiresIn);
            token.UpdatedAt = DateTime.UtcNow;

            await _repository.UpdateTokenAsync(token);

            return newTokenResponse.AccessToken;
        }

        return _encryption.Decrypt(token.AccessToken);
    }

    public async Task<Models.Entities.LightspeedToken?> GetTokenAsync(int? restaurantId = null)
    {
        return await _repository.GetActiveTokenAsync(restaurantId);
    }

    public bool IsTokenValid(Models.Entities.LightspeedToken token, int bufferMinutes = 5)
    {
        return token.ExpiresAt > DateTime.UtcNow.AddMinutes(bufferMinutes);
    }

    public string GetAuthorizationUrl(string state)
    {
        var clientId = _config["Lightspeed:ClientId"];
        var redirectUri = _config["Lightspeed:RedirectUri"];

        if (string.IsNullOrEmpty(clientId))
        {
            throw new InvalidOperationException("Lightspeed:ClientId is not configured");
        }

        if (string.IsNullOrEmpty(redirectUri))
        {
            throw new InvalidOperationException("Lightspeed:RedirectUri is not configured");
        }

        var url = $"{AuthUrl}?" +
                  $"client_id={Uri.EscapeDataString(clientId)}&" +
                  $"response_type=code&" +
                  $"scope={Uri.EscapeDataString(DefaultScopes)}&" +
                  $"state={Uri.EscapeDataString(state)}&" +
                  $"redirect_uri={Uri.EscapeDataString(redirectUri)}";

        _logger.LogDebug("Generated authorization URL: {Url}", url);

        return url;
    }

    public async Task StoreTokenAsync(Models.Entities.LightspeedToken token)
    {
        // Encrypt sensitive data before storing
        token.AccessToken = _encryption.Encrypt(token.AccessToken);
        token.RefreshToken = _encryption.Encrypt(token.RefreshToken);

        // Deactivate any existing tokens for this restaurant
        await _repository.DeactivateAllTokensAsync(token.RestaurantId);

        // Store the new token
        var tokenId = await _repository.SaveTokenAsync(token);
        token.Id = tokenId;

        _logger.LogInformation("Stored new Lightspeed token with ID {TokenId}", tokenId);
    }

    public async Task<string?> GetAccountIdAsync(int? restaurantId = null)
    {
        var token = await _repository.GetActiveTokenAsync(restaurantId);
        return token?.AccountId;
    }
}
