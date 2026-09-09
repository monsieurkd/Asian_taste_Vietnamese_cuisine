namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Stores OAuth tokens for Lightspeed K-Series API integration.
/// SECURITY: AccessToken and RefreshToken must be encrypted at rest.
/// </summary>
public class LightspeedToken
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Lightspeed Account ID (from API response).</summary>
    public string AccountId { get; set; } = string.Empty;

    /// <summary>Encrypted OAuth access token.</summary>
    public string AccessToken { get; set; } = string.Empty;

    /// <summary>Encrypted OAuth refresh token.</summary>
    public string RefreshToken { get; set; } = string.Empty;

    /// <summary>Token expiration time (UTC).</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>When the token was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the token was last updated.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Whether this token is currently active.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Optional: Associate with a specific restaurant location.</summary>
    public int? RestaurantId { get; set; }

    /// <summary>Token type (should be "Bearer").</summary>
    public string TokenType { get; set; } = "Bearer";

    /// <summary>OAuth scope granted with this token.</summary>
    public string Scope { get; set; } = string.Empty;
}
