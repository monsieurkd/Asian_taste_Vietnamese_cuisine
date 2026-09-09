using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository interface for webhook event log data access.
/// </summary>
public interface IWebhookEventLogRepository
{
    /// <summary>
    /// Checks if an event with the given event ID has already been processed.
    /// </summary>
    /// <param name="eventId">Unique event ID from Lightspeed.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>True if event has been processed successfully.</returns>
    Task<bool> HasEventBeenProcessedAsync(string eventId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Logs a new webhook event.
    /// </summary>
    /// <param name="eventLog">The event log to create.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The created event log with assigned ID.</returns>
    Task<WebhookEventLog> LogEventAsync(WebhookEventLog eventLog, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an event as processed with the result.
    /// </summary>
    /// <param name="id">The event log ID.</param>
    /// <param name="success">Whether processing was successful.</param>
    /// <param name="errorMessage">Error message if processing failed.</param>
    /// <param name="relatedOrderId">Related order ID (if applicable).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task MarkEventProcessedAsync(int id, bool success, string? errorMessage = null, int? relatedOrderId = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Increments the processing attempt count for an event.
    /// </summary>
    /// <param name="id">The event log ID.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task IncrementProcessingAttemptsAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets recent webhook logs for monitoring.
    /// </summary>
    /// <param name="limit">Maximum number of records to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of recent webhook logs.</returns>
    Task<List<WebhookEventLog>> GetRecentLogsAsync(int limit = 50, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets failed webhook events for retry processing.
    /// </summary>
    /// <param name="limit">Maximum number of records to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of failed webhook logs.</returns>
    Task<List<WebhookEventLog>> GetFailedEventsAsync(int limit = 20, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cleans up old webhook logs (for maintenance).
    /// </summary>
    /// <param name="olderThan">Delete logs older than this date.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Number of logs deleted.</returns>
    Task<int> CleanupOldLogsAsync(DateTime olderThan, CancellationToken cancellationToken = default);
}
