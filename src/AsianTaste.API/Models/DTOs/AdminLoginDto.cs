using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// DTO for admin login request.
/// </summary>
public class AdminLoginDto
{
    /// <summary>Username or email.</summary>
    [Required(ErrorMessage = "Username is required")]
    public string Username { get; set; } = string.Empty;

    /// <summary>Password.</summary>
    [Required(ErrorMessage = "Password is required")]
    public string Password { get; set; } = string.Empty;
}
