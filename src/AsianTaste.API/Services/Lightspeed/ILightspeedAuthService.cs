namespace AsianTaste.API.Services.Lightspeed;

/// <summary>
/// Service for managing Lightspeed K-Series OAuth authentication.
/// RESPONSIBLE FOR:
/// - Token storage and retrieval
/// - Token refresh when expired
/// - Encryption of sensitive token data
/// - OAuth flow initiation
/// </summary>
public interface ILightspeedAuthService
{
    /// <summary>
    /// Exchanges authorization code for access token.
    /// </summary>
    /// <param name="code">Authorization code from Lightspeed OAuth callback.</param>
    /// <param name="state">State parameter for CSRF protection.</param>
    /// <returns>Token response with access token, refresh token, and expiry.</returns>
    Task<LightspeedTokenResponse> ExchangeCodeForTokenAsync(string code, string state);

    /// <summary>
    /// Refreshes an expired access token using refresh token.
    /// </summary>
    /// <param name="refreshToken">Encrypted refresh token from storage.</param>
    /// <returns>New token response.</returns>
    Task<LightspeedTokenResponse> RefreshTokenAsync(string refreshToken);

    /// <summary>
    /// Gets a valid access token, refreshing if necessary.
    /// </summary>
    /// <param name="restaurantId">Optional restaurant ID for multi-tenant setups.</param>
    /// <returns>Valid access token.</returns>
    Task<string> GetValidAccessTokenAsync(int? restaurantId = null);

    /// <summary>
    /// Stores encrypted tokens in database.
    /// </summary>
    /// <param name="token">Token entity to store.</param>
    Task StoreTokenAsync(Models.Entities.LightspeedToken token);

    /// <summary>
    /// Retrieves the current active token from storage.
    /// </summary>
    /// <param name="restaurantId">Optional restaurant ID for multi-tenant setups.</param>
    /// <returns>Token entity or null if not found.</returns>
    Task<Models.Entities.LightspeedToken?> GetTokenAsync(int? restaurantId = null);

    /// <summary>
    /// Validates if current token is still valid (with buffer).
    /// </summary>
    /// <param name="token">Token to validate.</param>
    /// <param name="bufferMinutes">Buffer time in minutes before actual expiry (default: 5).</param>
    /// <returns>True if token is valid.</returns>
    bool IsTokenValid(Models.Entities.LightspeedToken token, int bufferMinutes = 5);

    /// <summary>
    /// Generates OAuth authorization URL for initiating the flow.
    /// </summary>
    /// <param name="state">Random state parameter for CSRF protection.</param>
    /// <returns>Full authorization URL.</returns>
    string GetAuthorizationUrl(string state);

    /// <summary>
    /// Gets the associated Lightspeed Account ID.
    /// </summary>
    /// <param name="restaurantId">Optional restaurant ID for multi-tenant setups.</param>
    /// <returns>Account ID or null.</returns>
    Task<string?> GetAccountIdAsync(int? restaurantId = null);
}

/// <summary>
/// Response from Lightspeed OAuth token endpoint.
/// </summary>
public class LightspeedTokenResponse
{
    /// <summary>Bearer access token for API calls.</summary>
    public string AccessToken { get; set; } = string.Empty;

    /// <summary>Token for obtaining new access tokens.</summary>
    public string RefreshToken { get; set; } = string.Empty;

    /// <summary>Token lifetime in seconds (typically 3600).</summary>
    public int ExpiresIn { get; set; }

    /// <summary>Token type (should be "Bearer").</summary>
    public string TokenType { get; set; } = string.Empty;

    /// <summary>Lightspeed Account ID (included in token response).</summary>
    public string? AccountId { get; set; }

    /// <summary>OAuth scope granted.</summary>
    public string? Scope { get; set; }

    /// <summary>Error code if request failed.</summary>
    public string? Error { get; set; }

    /// <summary>Error description if request failed.</summary>
    public string? ErrorDescription { get; set; }

    /// <summary>Whether the token request was successful.</summary>
    public bool IsSuccess => string.IsNullOrEmpty(Error);
}
