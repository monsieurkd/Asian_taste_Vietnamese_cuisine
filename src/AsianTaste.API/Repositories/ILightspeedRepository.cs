using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository for Lightspeed token data access.
/// </summary>
public interface ILightspeedRepository
{
    /// <summary>Saves a token to the database.</summary>
    Task<int> SaveTokenAsync(LightspeedToken token);

    /// <summary>Gets the active token for a restaurant.</summary>
    Task<LightspeedToken?> GetActiveTokenAsync(int? restaurantId = null);

    /// <summary>Gets a token by ID.</summary>
    Task<LightspeedToken?> GetTokenByIdAsync(int id);

    /// <summary>Updates an existing token.</summary>
    Task<bool> UpdateTokenAsync(LightspeedToken token);

    /// <summary>Deactivates a token.</summary>
    Task<bool> DeactivateTokenAsync(int id);

    /// <summary>Deactivates all tokens for a restaurant.</summary>
    Task<bool> DeactivateAllTokensAsync(int? restaurantId = null);
}

/// <summary>
/// Dapper-based implementation of Lightspeed repository.
/// </summary>
public class LightspeedRepository : ILightspeedRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public LightspeedRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<int> SaveTokenAsync(LightspeedToken token)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            INSERT INTO lightspeed_tokens (
                account_id, access_token, refresh_token, expires_at,
                created_at, updated_at, is_active, restaurant_id, token_type, scope
            ) VALUES (
                @AccountId, @AccessToken, @RefreshToken, @ExpiresAt,
                @CreatedAt, @UpdatedAt, @IsActive, @RestaurantId, @TokenType, @Scope
            )
            RETURNING id;
        ";

        return await connection.QuerySingleAsync<int>(
            new CommandDefinition(sql, token));
    }

    public async Task<LightspeedToken?> GetActiveTokenAsync(int? restaurantId = null)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        string sql = @"
            SELECT id, account_id, access_token, refresh_token, expires_at,
                   created_at, updated_at, is_active, restaurant_id, token_type, scope
            FROM lightspeed_tokens
            WHERE is_active = TRUE
        ";

        if (restaurantId.HasValue)
        {
            sql += " AND restaurant_id = @RestaurantId";
        }
        else
        {
            sql += " AND restaurant_id IS NULL";
        }

        sql += " ORDER BY created_at DESC LIMIT 1;";

        return await connection.QueryFirstOrDefaultAsync<LightspeedToken?>(
            new CommandDefinition(sql, new { RestaurantId = restaurantId }));
    }

    public async Task<LightspeedToken?> GetTokenByIdAsync(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id, account_id, access_token, refresh_token, expires_at,
                   created_at, updated_at, is_active, restaurant_id, token_type, scope
            FROM lightspeed_tokens
            WHERE id = @Id;
        ";

        return await connection.QueryFirstOrDefaultAsync<LightspeedToken?>(
            new CommandDefinition(sql, new { Id = id }));
    }

    public async Task<bool> UpdateTokenAsync(LightspeedToken token)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE lightspeed_tokens SET
                account_id = @AccountId,
                access_token = @AccessToken,
                refresh_token = @RefreshToken,
                expires_at = @ExpiresAt,
                updated_at = @UpdatedAt,
                is_active = @IsActive,
                token_type = @TokenType,
                scope = @Scope
            WHERE id = @Id;
        ";

        var rowsAffected = await connection.ExecuteAsync(
            new CommandDefinition(sql, token));
        return rowsAffected > 0;
    }

    public async Task<bool> DeactivateTokenAsync(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE lightspeed_tokens
            SET is_active = FALSE, updated_at = NOW()
            WHERE id = @Id;
        ";

        var rowsAffected = await connection.ExecuteAsync(
            new CommandDefinition(sql, new { Id = id }));
        return rowsAffected > 0;
    }

    public async Task<bool> DeactivateAllTokensAsync(int? restaurantId = null)
    {
        using var connection = _connectionFactory.CreateConnection();
        connection.Open();

        string sql = @"
            UPDATE lightspeed_tokens
            SET is_active = FALSE, updated_at = NOW()
            WHERE is_active = TRUE
        ";

        if (restaurantId.HasValue)
        {
            sql += " AND restaurant_id = @RestaurantId";
        }
        else
        {
            sql += " AND restaurant_id IS NULL";
        }

        var rowsAffected = await connection.ExecuteAsync(
            new CommandDefinition(sql, new { RestaurantId = restaurantId }));
        return rowsAffected > 0;
    }
}
