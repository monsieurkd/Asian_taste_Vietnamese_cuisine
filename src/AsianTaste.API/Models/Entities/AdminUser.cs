namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents an admin user who can access the restaurant management dashboard.
/// </summary>
public class AdminUser
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Unique username for login.</summary>
    public string Username { get; set; } = string.Empty;

    /// <summary>BCrypt hashed password.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Email address for notifications and password recovery.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Role-based access control (Admin, Manager, Staff).</summary>
    public string Role { get; set; } = "Admin";

    /// <summary>Whether the account is active.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>When the account was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the account was last updated.</summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Last login timestamp.</summary>
    public DateTime? LastLoginAt { get; set; }
}
