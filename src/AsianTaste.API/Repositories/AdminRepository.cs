using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Dapper-based repository for admin user data access.
/// </summary>
public class AdminRepository : IAdminRepository
{
    private readonly IDbConnectionFactory _dbConnectionFactory;

    public AdminRepository(IDbConnectionFactory dbConnectionFactory)
    {
        _dbConnectionFactory = dbConnectionFactory;
    }

    public async Task<AdminUser?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT
                id AS Id,
                username AS Username,
                password_hash AS PasswordHash,
                email AS Email,
                role AS Role,
                is_active AS IsActive,
                created_at AS CreatedAt,
                updated_at AS UpdatedAt,
                last_login_at AS LastLoginAt
            FROM admin_users
            WHERE username = @Username
            AND is_active = TRUE";

        return await connection.QueryFirstOrDefaultAsync<AdminUser>(
            new CommandDefinition(sql, new { Username = username }, cancellationToken: cancellationToken));
    }

    public async Task<AdminUser?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT
                id AS Id,
                username AS Username,
                password_hash AS PasswordHash,
                email AS Email,
                role AS Role,
                is_active AS IsActive,
                created_at AS CreatedAt,
                updated_at AS UpdatedAt,
                last_login_at AS LastLoginAt
            FROM admin_users
            WHERE id = @Id
            AND is_active = TRUE";

        return await connection.QueryFirstOrDefaultAsync<AdminUser>(
            new CommandDefinition(sql, new { Id = id }, cancellationToken: cancellationToken));
    }

    public async Task<AdminUser> CreateAsync(AdminUser user, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            INSERT INTO admin_users (username, password_hash, email, role, is_active, created_at)
            VALUES (@Username, @PasswordHash, @Email, @Role, @IsActive, @CreatedAt)
            RETURNING id";

        var id = await connection.QuerySingleAsync<int>(
            new CommandDefinition(
                sql,
                new
                {
                    Username = user.Username,
                    PasswordHash = user.PasswordHash,
                    Email = user.Email,
                    Role = user.Role,
                    IsActive = user.IsActive,
                    CreatedAt = DateTime.UtcNow
                },
                cancellationToken: cancellationToken));

        user.Id = id;
        return user;
    }

    public async Task UpdateLastLoginAsync(int id, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE admin_users
            SET last_login_at = @Now, updated_at = @Now
            WHERE id = @Id";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new { Id = id, Now = DateTime.UtcNow },
                cancellationToken: cancellationToken));
    }
}
