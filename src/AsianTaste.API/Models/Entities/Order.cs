using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a customer order.
/// </summary>
public class Order
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Human-readable order number (e.g., "AT-001234").</summary>
    public string OrderNumber { get; set; } = string.Empty;

    /// <summary>Customer ID (null for guest orders).</summary>
    public int? CustomerId { get; set; }

    /// <summary>Customer's name.</summary>
    public string CustomerName { get; set; } = string.Empty;

    /// <summary>Customer's phone number.</summary>
    public string CustomerPhone { get; set; } = string.Empty;

    /// <summary>Customer's email address.</summary>
    public string CustomerEmail { get; set; } = string.Empty;

    /// <summary>Pickup or dine-in.</summary>
    public OrderType OrderType { get; set; } = OrderType.Pickup;

    /// <summary>Requested pickup time (null = ASAP).</summary>
    public DateTime RequestedTime { get; set; } = DateTime.UtcNow;

    /// <summary>Current order status.</summary>
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    /// <summary>Payment method used.</summary>
    public PaymentMethod? PaymentMethod { get; set; }

    /// <summary>Subtotal before tax.</summary>
    public decimal Subtotal { get; set; }

    /// <summary>Tax amount (GST if applicable).</summary>
    public decimal Tax { get; set; }

    /// <summary>Total amount including tax.</summary>
    public decimal Total { get; set; }

    // ==================== PAYMENT FIELDS (Phase 2) ====================

    /// <summary>Current payment processing status.</summary>
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;

    /// <summary>External payment ID from payment gateway (e.g., Stripe, Lightspeed).</summary>
    public string? ExternalPaymentId { get; set; }

    /// <summary>External transaction/sale ID for completed payments.</summary>
    public string? ExternalTransactionId { get; set; }

    /// <summary>Amount actually paid (may differ from Total for partial payments/refunds).</summary>
    public decimal? PaidAmount { get; set; }

    /// <summary>When payment was completed.</summary>
    public DateTime? PaidAt { get; set; }

    /// <summary>Idempotency key to prevent duplicate payment processing.</summary>
    public string? IdempotencyKey { get; set; }

    // ==================== LEGACY PAYMENT FIELDS (retained for compatibility) ====================

    /// <summary>Square payment ID (from Square API - legacy).</summary>
    public string? SquarePaymentId { get; set; }

    /// <summary>Square order ID (from Square API - legacy).</summary>
    public string? SquareOrderId { get; set; }

    /// <summary>Payment intent ID from payment processor (legacy).</summary>
    public string? PaymentIntentId { get; set; }

    /// <summary>Reason for payment failure (if applicable).</summary>
    public string? PaymentFailureReason { get; set; }

    // ==================== LIGHTSPEED SYNC FIELDS (Phase 2) ====================

    /// <summary>Lightspeed order ID (when synced to POS).</summary>
    public string? LightspeedOrderId { get; set; }

    /// <summary>Lightspeed sale/transaction ID (when payment is synced).</summary>
    public string? LightspeedSaleId { get; set; }

    /// <summary>Sync status with Lightspeed POS.</summary>
    public SyncStatus LightspeedSyncStatus { get; set; } = SyncStatus.NotSynced;

    /// <summary>When order was successfully synced to Lightspeed.</summary>
    public DateTime? SyncedToLightspeedAt { get; set; }

    /// <summary>Error message if sync failed.</summary>
    public string? SyncError { get; set; }

    /// <summary>Third-party reference (Lightspeed K-Series - legacy field, kept for compatibility).</summary>
    public string? ThirdPartyReference { get; set; }

    /// <summary>When order was sent to Lightspeed (legacy field, kept for compatibility).</summary>
    public DateTime? LightspeedSentAt { get; set; }

    // ==================== OTHER FIELDS ====================

    /// <summary>Whether email confirmation was sent.</summary>
    public bool EmailConfirmationSent { get; set; } = false;

    /// <summary>Customer notes or special instructions.</summary>
    public string? Notes { get; set; }

    /// <summary>When the order was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the order was last updated.</summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Navigation property to customer.</summary>
    public Customer? Customer { get; set; }

    /// <summary>Navigation property to order items.</summary>
    public List<OrderItem> Items { get; set; } = new();
}
