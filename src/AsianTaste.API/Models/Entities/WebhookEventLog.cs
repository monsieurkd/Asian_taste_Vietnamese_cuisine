namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Log of received webhook events from Lightspeed for idempotency and audit.
/// Ensures duplicate events are not processed twice.
/// </summary>
public class WebhookEventLog
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Unique event ID from Lightspeed to prevent duplicate processing.</summary>
    public string EventId { get; set; } = string.Empty;

    /// <summary>Type of webhook event (e.g., "payment.completed", "order.updated").</summary>
    public string EventType { get; set; } = string.Empty;

    /// <summary>Raw JSON payload (for audit/debugging).</summary>
    public string? Payload { get; set; }

    /// <summary>Whether the event was processed successfully.</summary>
    public bool ProcessingSuccess { get; set; }

    /// <summary>Error message if processing failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>When the webhook was received.</summary>
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the webhook was processed (null if pending/failed).</summary>
    public DateTime? ProcessedAt { get; set; }

    /// <summary>Signature from webhook header for verification.</summary>
    public string? Signature { get; set; }

    /// <summary>IP address of the webhook sender.</summary>
    public string? SourceIp { get; set; }

    /// <summary>Related order ID (if applicable).</summary>
    public int? RelatedOrderId { get; set; }

    /// <summary>Number of processing attempts (for retry logic).</summary>
    public int ProcessingAttempts { get; set; } = 0;
}
