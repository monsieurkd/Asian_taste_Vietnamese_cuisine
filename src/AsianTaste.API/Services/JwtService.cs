using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Services;

/// <summary>
/// Service for generating and validating JWT tokens for admin authentication.
/// </summary>
public class JwtService
{
    private readonly IConfiguration _configuration;
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _expirationMinutes;

    public JwtService(IConfiguration configuration)
    {
        _configuration = configuration;
        _secretKey = _configuration["Jwt:SecretKey"] ?? throw new InvalidOperationException("JWT SecretKey not configured");
        _issuer = _configuration["Jwt:Issuer"] ?? "AsianTasteAPI";
        _audience = _configuration["Jwt:Audience"] ?? "AsianTasteAdmin";
        _expirationMinutes = int.Parse(_configuration["Jwt:ExpirationMinutes"] ?? "1440"); // 24 hours default
    }

    /// <summary>
    /// Generates a JWT token for an admin user.
    /// </summary>
    public string GenerateToken(AdminUser user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.Role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_expirationMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Validates a JWT token and returns the claims principal.
    /// </summary>
    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
            var tokenHandler = new JwtSecurityTokenHandler();

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _issuer,
                ValidAudience = _audience,
                IssuerSigningKey = key,
                ClockSkew = TimeSpan.Zero
            };

            return tokenHandler.ValidateToken(token, validationParameters, out _);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Hashes a password using BCrypt.
    /// </summary>
    public string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password);
    }

    /// <summary>
    /// Verifies a password against a hash.
    /// </summary>
    public bool VerifyPassword(string password, string hash)
    {
        return BCrypt.Net.BCrypt.Verify(password, hash);
    }
}
