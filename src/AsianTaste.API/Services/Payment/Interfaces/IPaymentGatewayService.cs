using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Services.Payment.Interfaces;

/// <summary>
/// Abstract payment gateway interface for processing payments.
/// Allows multiple payment providers (Lightspeed, Stripe, etc.) to be implemented.
/// RESPONSIBLE FOR:
/// - Payment initiation
/// - Payment capture
/// - Payment authorization (for dine-in orders)
/// - Refunds
/// - Payment status queries
/// - Webhook signature verification
/// </summary>
public interface IPaymentGatewayService
{
    /// <summary>
    /// Initiates a payment and returns payment details for frontend processing.
    /// </summary>
    /// <param name="request">Payment request with order and amount details.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Payment initiation result with client secret or redirect URL.</returns>
    Task<PaymentInitiationResult> InitiatePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Captures a previously authorized payment (for dine-in orders).
    /// </summary>
    /// <param name="paymentId">External payment ID from authorization.</param>
    /// <param name="amount">Amount to capture (must be less than or equal to authorized amount).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Capture result with success status.</returns>
    Task<PaymentCaptureResult> CapturePaymentAsync(string paymentId, decimal amount, CancellationToken cancellationToken = default);

    /// <summary>
    /// Authorizes a payment without capturing (for dine-in orders).
    /// </summary>
    /// <param name="request">Payment request with order and amount details.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Authorization result with authorization ID.</returns>
    Task<PaymentAuthorizationResult> AuthorizePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Refunds a payment (full or partial).
    /// </summary>
    /// <param name="paymentId">External payment ID to refund.</param>
    /// <param name="amount">Amount to refund, or null for full refund.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Refund result with refund ID and amount.</returns>
    Task<PaymentRefundResult> RefundPaymentAsync(string paymentId, decimal? amount = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the current status of a payment from the payment gateway.
    /// </summary>
    /// <param name="paymentId">External payment ID.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Current payment status.</returns>
    Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Verifies webhook signature from the payment gateway.
    /// </summary>
    /// <param name="payload">Raw webhook payload.</param>
    /// <param name="signature">Signature from webhook header.</param>
    /// <param name="secret">Webhook secret for verification.</param>
    /// <returns>True if signature is valid.</returns>
    bool VerifyWebhookSignature(string payload, string signature, string secret);

    /// <summary>
    /// Parses webhook event into structured data.
    /// </summary>
    /// <param name="payload">Raw webhook payload.</param>
    /// <param name="signature">Signature from webhook header.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Parsed webhook event.</returns>
    Task<WebhookEvent?> ParseWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default);
}

#region Request/Response Models

/// <summary>
/// Request to initiate or authorize a payment.
/// </summary>
public record PaymentRequest
{
    /// <summary>Internal order ID.</summary>
    public required string OrderId { get; set; }

    /// <summary>Order number for human reference.</summary>
    public string? OrderNumber { get; set; }

    /// <summary>Payment amount in cents (minor units).</summary>
    public required int Amount { get; set; }

    /// <summary>Currency code (default: USD).</summary>
    public string Currency { get; set; } = "USD";

    /// <summary>Payment method ID from the payment processor.</summary>
    public string? PaymentMethodId { get; set; }

    /// <summary>Type of payment method being used.</summary>
    public required PaymentMethodType PaymentMethodType { get; set; }

    /// <summary>Order type affecting payment flow.</summary>
    public required OrderType OrderType { get; set; }

    /// <summary>Customer email for receipts.</summary>
    public string? CustomerEmail { get; set; }

    /// <summary>Customer phone for notifications.</summary>
    public string? CustomerPhone { get; set; }

    /// <summary>Additional metadata for tracking.</summary>
    public Dictionary<string, string> Metadata { get; set; } = new();

    /// <summary>Idempotency key to prevent duplicate payments.</summary>
    public required string IdempotencyKey { get; set; }
}

/// <summary>
/// Result of payment initiation.
/// </summary>
public record PaymentInitiationResult
{
    /// <summary>Whether initiation was successful.</summary>
    public required bool Success { get; set; }

    /// <summary>External payment ID from gateway.</summary>
    public required string PaymentId { get; set; }

    /// <summary>Client secret for frontend payment processing.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Redirect URL for hosted payment pages.</summary>
    public string? RedirectUrl { get; set; }

    /// <summary>Error message if initiation failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Whether additional action is required (3D Secure, etc.).</summary>
    public bool RequiresAction { get; set; }

    /// <summary>Payment status after initiation.</summary>
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;
}

/// <summary>
/// Result of payment capture.
/// </summary>
public record PaymentCaptureResult
{
    /// <summary>Whether capture was successful.</summary>
    public required bool Success { get; set; }

    /// <summary>Capture transaction ID.</summary>
    public required string CaptureId { get; set; }

    /// <summary>Error message if capture failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Amount actually captured.</summary>
    public decimal? Amount { get; set; }
}

/// <summary>
/// Result of payment authorization.
/// </summary>
public record PaymentAuthorizationResult
{
    /// <summary>Whether authorization was successful.</summary>
    public required bool Success { get; set; }

    /// <summary>Authorization ID for later capture.</summary>
    public required string AuthorizationId { get; set; }

    /// <summary>Error message if authorization failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Amount authorized.</summary>
    public decimal? Amount { get; set; }
}

/// <summary>
/// Result of payment refund.
/// </summary>
public record PaymentRefundResult
{
    /// <summary>Whether refund was successful.</summary>
    public required bool Success { get; set; }

    /// <summary>Refund transaction ID.</summary>
    public required string RefundId { get; set; }

    /// <summary>Amount refunded.</summary>
    public required decimal Amount { get; set; }

    /// <summary>Error message if refund failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Refund status.</summary>
    public RefundStatus Status { get; set; } = RefundStatus.Pending;
}

/// <summary>
/// Result of payment status query.
/// </summary>
public record PaymentStatusResult
{
    /// <summary>Current payment status.</summary>
    public required PaymentStatus Status { get; set; }

    /// <summary>Amount paid (if applicable).</summary>
    public decimal? PaidAmount { get; set; }

    /// <summary>When payment was completed.</summary>
    public DateTime? PaidAt { get; set; }

    /// <summary>Currency of the payment.</summary>
    public string? Currency { get; set; }

    /// <summary>Error message if payment failed.</summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Parsed webhook event from payment gateway.
/// </summary>
public record WebhookEvent
{
    /// <summary>Unique event ID.</summary>
    public required string EventId { get; set; }

    /// <summary>Event type (e.g., "payment.completed", "payment.failed").</summary>
    public required string EventType { get; set; }

    /// <summary>Associated payment ID.</summary>
    public string? PaymentId { get; set; }

    /// <summary>Associated order ID from metadata.</summary>
    public string? OrderId { get; set; }

    /// <summary>When the event occurred.</summary>
    public required DateTime Timestamp { get; set; }

    /// <summary>Raw event data.</summary>
    public Dictionary<string, object> Data { get; set; } = new();
}

#endregion

#region Enums

/// <summary>
/// Payment method type for processing flows.
/// </summary>
public enum PaymentMethodType
{
    /// <summary>Credit or debit card.</summary>
    Card = 0,

    /// <summary>Cash on pickup (no online processing).</summary>
    Cash = 1,

    /// <summary>Digital wallet (Apple Pay, Google Pay, etc.).</summary>
    DigitalWallet = 2
}

/// <summary>
/// Order type affecting payment authorization timing.
/// </summary>
public enum OrderType
{
    /// <summary>Customer picks up order.</summary>
    Pickup = 0,

    /// <summary>Customer dines in (authorize first, capture later).</summary>
    DineIn = 1,

    /// <summary>Order delivered to customer.</summary>
    Delivery = 2
}

/// <summary>
/// Payment status throughout lifecycle.
/// </summary>
public enum PaymentStatus
{
    /// <summary>Payment initiated but not yet processed.</summary>
    Pending = 0,

    /// <summary>Payment is being processed.</summary>
    Processing = 1,

    /// <summary>Payment completed successfully.</summary>
    Succeeded = 2,

    /// <summary>Payment failed.</summary>
    Failed = 3,

    /// <summary>Payment fully refunded.</summary>
    Refunded = 4,

    /// <summary>Payment partially refunded.</summary>
    PartiallyRefunded = 5,

    /// <summary>Payment requires additional action (3D Secure).</summary>
    RequiresAction = 6,

    /// <summary>Payment canceled.</summary>
    Canceled = 7
}

/// <summary>
/// Refund status.
/// </summary>
public enum RefundStatus
{
    /// <summary>Refund initiated.</summary>
    Pending = 0,

    /// <summary>Refund completed successfully.</summary>
    Succeeded = 1,

    /// <summary>Refund failed.</summary>
    Failed = 2
}

#endregion
