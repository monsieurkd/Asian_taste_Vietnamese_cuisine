namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// DTO for admin authentication response containing JWT token.
/// </summary>
public class AdminAuthResponseDto
{
    /// <summary>JWT access token.</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>Token type (always "Bearer").</summary>
    public string TokenType { get; set; } = "Bearer";

    /// <summary>Token expiration in seconds.</summary>
    public int ExpiresIn { get; set; }

    /// <summary>Admin user information.</summary>
    public AdminUserDto User { get; set; } = new();
}

/// <summary>
/// Admin user data returned in auth response.
/// </summary>
public class AdminUserDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}
