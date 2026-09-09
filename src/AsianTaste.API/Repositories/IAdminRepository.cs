using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository interface for admin user data access.
/// </summary>
public interface IAdminRepository
{
    /// <summary>
    /// Gets an admin user by username.
    /// </summary>
    Task<AdminUser?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets an admin user by ID.
    /// </summary>
    Task<AdminUser?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a new admin user.
    /// </summary>
    Task<AdminUser> CreateAsync(AdminUser user, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the last login timestamp for an admin user.
    /// </summary>
    Task UpdateLastLoginAsync(int id, CancellationToken cancellationToken = default);
}
