namespace AsianTaste.API.Services.Webhooks;

/// <summary>
/// Service for processing Lightspeed webhooks.
/// RESPONSIBLE FOR:
/// - Signature verification
/// - Event parsing
/// - Order status updates
/// - Error handling
/// </summary>
public interface IWebhookService
{
    /// <summary>
    /// Processes an incoming webhook event.
    /// </summary>
    /// <param name="payload">Raw JSON payload from webhook.</param>
    /// <param name="signature">HMAC-SHA256 signature for verification.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Result of webhook processing.</returns>
    Task<WebhookProcessingResult> ProcessWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default);

    /// <summary>
    /// Verifies webhook signature using HMAC-SHA256.
    /// </summary>
    /// <param name="payload">Raw JSON payload.</param>
    /// <param name="signature">Signature to verify.</param>
    /// <returns>True if signature is valid.</returns>
    bool VerifySignature(string payload, string signature);

    /// <summary>
    /// Handles payment.completed event.
    /// </summary>
    Task<WebhookProcessingResult> HandlePaymentCompletedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles payment.failed event.
    /// </summary>
    Task<WebhookProcessingResult> HandlePaymentFailedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles payment.refunded event.
    /// </summary>
    Task<WebhookProcessingResult> HandlePaymentRefundedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles order.updated event.
    /// </summary>
    Task<WebhookProcessingResult> HandleOrderUpdatedEventAsync(OrderWebhookData data, CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles order.completed event.
    /// </summary>
    Task<WebhookProcessingResult> HandleOrderCompletedEventAsync(OrderWebhookData data, CancellationToken cancellationToken = default);

    /// <summary>
    /// Handles product.updated event.
    /// </summary>
    Task<WebhookProcessingResult> HandleProductUpdatedEventAsync(ProductWebhookData data, CancellationToken cancellationToken = default);
}

/// <summary>
/// Result of webhook processing.
/// </summary>
public record WebhookProcessingResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public System.Net.HttpStatusCode StatusCode { get; init; } = System.Net.HttpStatusCode.OK;
}

/// <summary>
/// Payment webhook data from Lightspeed.
/// </summary>
public record PaymentWebhookData
{
    public string PaymentId { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; }
    public string? Currency { get; set; }
    public string? TransactionId { get; set; }
    public Dictionary<string, string>? Metadata { get; set; }
}

/// <summary>
/// Order webhook data from Lightspeed.
/// </summary>
public record OrderWebhookData
{
    public int LightspeedOrderId { get; set; }
    public string? LocalOrderId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
    public string? OrderNumber { get; set; }
    public string? Note { get; set; }
}

/// <summary>
/// Product webhook data from Lightspeed.
/// </summary>
public record ProductWebhookData
{
    public int LightspeedProductId { get; set; }
    public bool IsAvailable { get; set; }
    public int? StockLevel { get; set; }
    public string? ProductName { get; set; }
    public decimal? Price { get; set; }
}

/// <summary>
/// Lightspeed webhook event payload structure.
/// </summary>
public record LightspeedWebhookEvent
{
    public string EventId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public Dictionary<string, object> Data { get; set; } = new();
}
