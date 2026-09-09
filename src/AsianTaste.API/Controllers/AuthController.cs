using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Models.DTOs;
using System.Security.Claims;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for admin authentication.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    private readonly IAdminRepository _adminRepository;
    private readonly JwtService _jwtService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAdminRepository adminRepository,
        JwtService jwtService,
        ILogger<AuthController> logger)
    {
        _adminRepository = adminRepository;
        _jwtService = jwtService;
        _logger = logger;
    }

    /// <summary>
    /// Authenticates an admin user and returns a JWT token.
    /// </summary>
    /// <param name="request">Login credentials.</param>
    /// <returns>JWT token and user information.</returns>
    /// <response code="200">Returns the authentication token.</response>
    /// <response code="401">Invalid credentials.</response>
    /// <response code="500">Internal server error.</response>
    [HttpPost("login")]
    [ProducesResponseType(typeof(AdminAuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<AdminAuthResponseDto>> Login([FromBody] AdminLoginDto request)
    {
        try
        {
            var user = await _adminRepository.GetByUsernameAsync(request.Username);

            if (user == null || !_jwtService.VerifyPassword(request.Password, user.PasswordHash))
            {
                _logger.LogWarning("Failed login attempt for username: {Username}", request.Username);
                return Unauthorized(new { error = "Invalid username or password" });
            }

            if (!user.IsActive)
            {
                _logger.LogWarning("Inactive login attempt for username: {Username}", request.Username);
                return Unauthorized(new { error = "Account is inactive" });
            }

            // Update last login
            await _adminRepository.UpdateLastLoginAsync(user.Id);

            // Generate JWT token
            var token = _jwtService.GenerateToken(user);

            var response = new AdminAuthResponseDto
            {
                Token = token,
                TokenType = "Bearer",
                ExpiresIn = 1440, // 24 hours in minutes
                User = new AdminUserDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    Role = user.Role
                }
            };

            _logger.LogInformation("Successful login for user: {Username}", request.Username);

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during login for username: {Username}", request.Username);
            return StatusCode(500, new { error = "An error occurred during login" });
        }
    }

    /// <summary>
    /// Validates a JWT token and returns the user information.
    /// </summary>
    /// <param name="request">Token validation request.</param>
    /// <returns>User information if token is valid.</returns>
    /// <response code="200">Token is valid, returns user info.</response>
    /// <response code="401">Token is invalid or expired.</response>
    [HttpPost("validate")]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    public ActionResult ValidateToken([FromBody] ValidateTokenRequestDto request)
    {
        try
        {
            var principal = _jwtService.ValidateToken(request.Token);

            if (principal == null)
            {
                return Unauthorized(new { error = "Invalid or expired token" });
            }

            var userIdClaim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var usernameClaim = principal.FindFirst(ClaimTypes.Name)?.Value;
            var emailClaim = principal.FindFirst(ClaimTypes.Email)?.Value;
            var roleClaim = principal.FindFirst(ClaimTypes.Role)?.Value;

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { error = "Invalid token claims" });
            }

            return Ok(new AdminUserDto
            {
                Id = userId,
                Username = usernameClaim ?? string.Empty,
                Email = emailClaim ?? string.Empty,
                Role = roleClaim ?? string.Empty
            });
        }
        catch
        {
            return Unauthorized(new { error = "Token validation failed" });
        }
    }
}

/// <summary>
/// DTO for token validation request.
/// </summary>
public class ValidateTokenRequestDto
{
    public string Token { get; set; } = string.Empty;
}
