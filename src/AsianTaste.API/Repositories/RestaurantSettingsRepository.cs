using System.Data;
using Dapper;
using AsianTaste.API.Data;

namespace AsianTaste.API.Repositories;

/// <summary>
/// A single row of restaurant operating hours (Adelaide local time).
/// </summary>
public class OperatingHoursRecord
{
    /// <summary>ISO-8601 day number: 1 = Monday ... 7 = Sunday.</summary>
    public int DayOfWeek { get; set; }

    public TimeSpan? OpenTime { get; set; }
    public TimeSpan? CloseTime { get; set; }

    /// <summary>
    /// The break between services, for a kitchen that closes and reopens in the day.
    /// Null means one continuous service.
    /// </summary>
    public TimeSpan? BreakStart { get; set; }
    public TimeSpan? BreakEnd { get; set; }

    public bool IsClosed { get; set; }
}

public interface IRestaurantSettingsRepository
{
    Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<string?> GetAsync(string key, CancellationToken cancellationToken = default);
    Task SetAsync(string key, string value, CancellationToken cancellationToken = default);
    Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default);
    Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default);
    Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default);
}

/// <summary>
/// PostgreSQL-backed restaurant settings and operating hours.
/// </summary>
public class RestaurantSettingsRepository : IRestaurantSettingsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public RestaurantSettingsRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<(string Key, string Value)>(
            new CommandDefinition(
                "SELECT key, value FROM restaurant_settings ORDER BY key",
                cancellationToken: cancellationToken));

        return rows.ToDictionary(r => r.Key, r => r.Value, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<string?> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();
        return await connection.ExecuteScalarAsync<string?>(
            new CommandDefinition(
                "SELECT value FROM restaurant_settings WHERE key = @Key",
                new { Key = key },
                cancellationToken: cancellationToken));
    }

    public async Task SetAsync(string key, string value, CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(
            new CommandDefinition(
                @"INSERT INTO restaurant_settings (key, value)
                  VALUES (@Key, @Value)
                  ON CONFLICT (key) DO UPDATE SET
                      value = EXCLUDED.value,
                      updated_at = CURRENT_TIMESTAMP",
                new { Key = key, Value = value },
                cancellationToken: cancellationToken));
    }

    public async Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default)
    {
        if (settings.Count == 0)
        {
            return;
        }

        using var connection = (System.Data.Common.DbConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        foreach (var (key, value) in settings)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    @"INSERT INTO restaurant_settings (key, value)
                      VALUES (@Key, @Value)
                      ON CONFLICT (key) DO UPDATE SET
                          value = EXCLUDED.value,
                          updated_at = CURRENT_TIMESTAMP",
                    new { Key = key, Value = value },
                    transaction,
                    cancellationToken: cancellationToken));
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();
        var rows = await connection.QueryAsync<OperatingHoursRecord>(
            new CommandDefinition(
                @"SELECT day_of_week AS DayOfWeek,
                         open_time   AS OpenTime,
                         close_time  AS CloseTime,
                         break_start AS BreakStart,
                         break_end   AS BreakEnd,
                         is_closed   AS IsClosed
                  FROM operating_hours
                  ORDER BY day_of_week",
                cancellationToken: cancellationToken));

        return rows.AsList();
    }

    public async Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(
            new CommandDefinition(
                @"INSERT INTO operating_hours (day_of_week, open_time, close_time, is_closed)
                  VALUES (@DayOfWeek, @OpenTime, @CloseTime, @IsClosed)
                  ON CONFLICT (day_of_week) DO UPDATE SET
                      open_time = EXCLUDED.open_time,
                      close_time = EXCLUDED.close_time,
                      is_closed = EXCLUDED.is_closed,
                      updated_at = CURRENT_TIMESTAMP",
                new { DayOfWeek = dayOfWeek, OpenTime = openTime, CloseTime = closeTime, IsClosed = isClosed },
                cancellationToken: cancellationToken));
    }
}
