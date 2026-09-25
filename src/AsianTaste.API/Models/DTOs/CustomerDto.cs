using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Request DTO for customer registration.
/// </summary>
public class RegisterCustomerDto
{
    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    public string Password { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    public string Name { get; set; } = string.Empty;

    [StringLength(50)]
    [Phone]
    public string? Phone { get; set; }

    public bool MarketingConsent { get; set; } = false;

    /// <summary>
    /// Optional order number to link the account to an existing order.
    /// </summary>
    [StringLength(20)]
    public string? LinkOrderNumber { get; set; }
}

/// <summary>
/// Request DTO for customer login.
/// </summary>
public class LoginCustomerDto
{
    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    public string Password { get; set; } = string.Empty;
}

/// <summary>
/// Response DTO for customer authentication.
/// </summary>
public class CustomerAuthResponseDto
{
    public bool Success { get; set; }
    public string? Token { get; set; }
    public CustomerResponseDto? Customer { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Request DTO for creating a customer account from an order.
/// </summary>
public class CreateCustomerAccountFromOrderDto
{
    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    public string Password { get; set; } = string.Empty;

    [Required]
    [StringLength(20)]
    public string OrderNumber { get; set; } = string.Empty;

    public bool MarketingConsent { get; set; } = false;
}

/// <summary>
/// Response DTO for customer profile information.
/// </summary>
public class CustomerProfileResponseDto
{
    public int Id { get; set; }
    public string CustomerNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastOrderAt { get; set; }
    public int OrderCount { get; set; }
}

/// <summary>
/// Request DTO for updating customer profile.
/// </summary>
public class UpdateCustomerProfileDto
{
    [StringLength(255)]
    public string? FirstName { get; set; }

    [StringLength(255)]
    public string? LastName { get; set; }

    [StringLength(50)]
    [Phone]
    public string? Phone { get; set; }

    public bool? MarketingConsent { get; set; }
}

/// <summary>
/// Request DTO for password change.
/// </summary>
public class ChangePasswordDto
{
    [Required]
    [StringLength(255)]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    [MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;
}

/// <summary>
/// Request DTO for password reset.
/// </summary>
public class RequestPasswordResetDto
{
    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
}

/// <summary>
/// Request DTO for resetting password with token.
/// </summary>
public class ResetPasswordDto
{
    [Required]
    [StringLength(255)]
    public string Token { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    [MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;
}
