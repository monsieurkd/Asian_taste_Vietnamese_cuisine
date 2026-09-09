using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;
using Npgsql;

namespace AsianTaste.API.Repositories;

/// <summary>
/// PostgreSQL implementation of webhook event log repository.
/// </summary>
public class WebhookEventLogRepository : IWebhookEventLogRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public WebhookEventLogRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<bool> HasEventBeenProcessedAsync(string eventId, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            SELECT COUNT(*) > 0
            FROM webhook_event_log
            WHERE event_id = @EventId
              AND processing_success = true";

        return await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(sql, new { EventId = eventId }, cancellationToken: cancellationToken));
    }

    public async Task<WebhookEventLog> LogEventAsync(WebhookEventLog eventLog, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            INSERT INTO webhook_event_log (
                event_id, event_type, payload, signature, source_ip,
                related_order_id, processing_attempts, received_at
            )
            VALUES (
                @EventId, @EventType, @Payload, @Signature, @SourceIp,
                @RelatedOrderId, @ProcessingAttempts, @ReceivedAt
            )
            RETURNING id, received_at";

        var parameters = new
        {
            EventId = eventLog.EventId,
            EventType = eventLog.EventType,
            Payload = eventLog.Payload,
            Signature = eventLog.Signature,
            SourceIp = eventLog.SourceIp,
            RelatedOrderId = eventLog.RelatedOrderId,
            ProcessingAttempts = eventLog.ProcessingAttempts,
            ReceivedAt = eventLog.ReceivedAt
        };

        var result = await connection.QuerySingleAsync<(int Id, DateTime ReceivedAt)>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        eventLog.Id = result.Id;
        eventLog.ReceivedAt = result.ReceivedAt;
        return eventLog;
    }

    public async Task MarkEventProcessedAsync(int id, bool success, string? errorMessage = null, int? relatedOrderId = null, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            UPDATE webhook_event_log
            SET processing_success = @Success,
                error_message = @ErrorMessage,
                processed_at = NOW(),
                related_order_id = COALESCE(@RelatedOrderId, related_order_id)
            WHERE id = @Id";

        await connection.ExecuteAsync(
            new CommandDefinition(sql, new { Id = id, Success = success, ErrorMessage = errorMessage, RelatedOrderId = relatedOrderId }, cancellationToken: cancellationToken));
    }

    public async Task IncrementProcessingAttemptsAsync(int id, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            UPDATE webhook_event_log
            SET processing_attempts = processing_attempts + 1
            WHERE id = @Id";

        await connection.ExecuteAsync(
            new CommandDefinition(sql, new { Id = id }, cancellationToken: cancellationToken));
    }

    public async Task<List<WebhookEventLog>> GetRecentLogsAsync(int limit = 50, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            SELECT id, event_id, event_type, payload, processing_success,
                   error_message, received_at, processed_at, signature,
                   source_ip, related_order_id, processing_attempts
            FROM webhook_event_log
            ORDER BY received_at DESC
            LIMIT @Limit";

        var logs = await connection.QueryAsync<WebhookEventLog>(
            new CommandDefinition(sql, new { Limit = limit }, cancellationToken: cancellationToken));

        return logs.AsList();
    }

    public async Task<List<WebhookEventLog>> GetFailedEventsAsync(int limit = 20, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            SELECT id, event_id, event_type, payload, processing_success,
                   error_message, received_at, processed_at, signature,
                   source_ip, related_order_id, processing_attempts
            FROM webhook_event_log
            WHERE processing_success = false
              AND processing_attempts < 5
            ORDER BY received_at ASC
            LIMIT @Limit";

        var logs = await connection.QueryAsync<WebhookEventLog>(
            new CommandDefinition(sql, new { Limit = limit }, cancellationToken: cancellationToken));

        return logs.AsList();
    }

    public async Task<int> CleanupOldLogsAsync(DateTime olderThan, CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
            DELETE FROM webhook_event_log
            WHERE received_at < @OlderThan
              AND processing_success = true
              AND processed_at IS NOT NULL";

        return await connection.ExecuteAsync(
            new CommandDefinition(sql, new { OlderThan = olderThan }, cancellationToken: cancellationToken));
    }
}
