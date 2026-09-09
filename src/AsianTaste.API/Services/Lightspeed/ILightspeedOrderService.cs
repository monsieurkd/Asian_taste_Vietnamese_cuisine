using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Services.Lightspeed;

/// <summary>
/// Service for syncing orders with Lightspeed K-Series POS.
/// REFERENCE: https://developers.lightspeedhq.com/kounta/endpoints/orders/
/// RESPONSIBLE FOR:
/// - Creating orders in Lightspeed
/// - Updating order status
/// - Retrieving orders from Lightspeed
/// - Handling order sync failures
/// </summary>
public interface ILightspeedOrderService
{
    /// <summary>
    /// Creates a new order in Lightspeed POS.
    /// </summary>
    /// <param name="order">The order to sync (must include Items).</param>
    /// <returns>Result containing success status and Lightspeed order ID.</returns>
    Task<LightspeedOrderResult> CreateOrderAsync(Order order);

    /// <summary>
    /// Updates an existing order in Lightspeed.
    /// </summary>
    /// <param name="lightspeedOrderId">The Lightspeed order ID.</param>
    /// <param name="update">The update to apply.</param>
    /// <returns>Result containing success status.</returns>
    Task<LightspeedOrderResult> UpdateOrderAsync(int lightspeedOrderId, LightspeedOrderUpdate update);

    /// <summary>
    /// Retrieves an order from Lightspeed.
    /// </summary>
    /// <param name="lightspeedOrderId">The Lightspeed order ID.</param>
    /// <returns>The Lightspeed order or null if not found.</returns>
    Task<LightspeedOrder?> GetOrderAsync(int lightspeedOrderId);

    /// <summary>
    /// Syncs local order status to Lightspeed.
    /// </summary>
    /// <param name="orderId">The local order ID.</param>
    /// <param name="status">The status to sync.</param>
    /// <returns>True if sync was successful.</returns>
    Task<bool> SyncOrderStatusAsync(int orderId, OrderStatus status);

    /// <summary>
    /// Processes failed sync attempts.
    /// </summary>
    /// <returns>Number of orders successfully retried.</returns>
    Task<int> RetryFailedSyncsAsync();

    /// <summary>
    /// Gets sync statistics.
    /// </summary>
    Task<LightspeedSyncStats> GetSyncStatsAsync();
}

/// <summary>
/// Result from a Lightspeed order operation.
/// </summary>
public record LightspeedOrderResult
{
    /// <summary>Whether the operation was successful.</summary>
    public bool Success { get; init; }

    /// <summary>The Lightspeed order ID (if successful).</summary>
    public int? LightspeedOrderId { get; init; }

    /// <summary>Human-readable error message (if failed).</summary>
    public string? ErrorMessage { get; init; }

    /// <summary>Machine-readable error code (if failed).</summary>
    public string? ErrorCode { get; init; }

    /// <summary>The order number from Lightspeed (if successful).</summary>
    public string? OrderNumber { get; init; }

    /// <summary>Creates a successful result.</summary>
    public static LightspeedOrderResult Successful(int orderId, string? orderNumber = null) =>
        new() { Success = true, LightspeedOrderId = orderId, OrderNumber = orderNumber };

    /// <summary>Creates a failed result.</summary>
    public static LightspeedOrderResult Failed(string errorMessage, string? errorCode = null) =>
        new() { Success = false, ErrorMessage = errorMessage, ErrorCode = errorCode };
}

/// <summary>
/// Representation of a Lightspeed order.
/// </summary>
public record LightspeedOrder
{
    /// <summary>Lightspeed order ID.</summary>
    public int Id { get; init; }

    /// <summary>Order number/num.</summary>
    public string OrderNumber { get; init; } = string.Empty;

    /// <summary>When the order was created.</summary>
    public DateTime CreatedAt { get; init; }

    /// <summary>Order status.</summary>
    public string Status { get; init; } = string.Empty;

    /// <summary>Order total.</summary>
    public decimal Total { get; init; }

    /// <summary>Order line items.</summary>
    public List<LightspeedOrderLine> Lines { get; init; } = new();

    /// <summary>Contact information.</summary>
    public LightspeedContact? Contact { get; init; }

    /// <summary>Order note.</summary>
    public string? Note { get; init; }

    /// <summary>Sale date.</summary>
    public DateTime? SaleDate { get; init; }
}

/// <summary>
/// Representation of a Lightspeed order line item.
/// </summary>
public record LightspeedOrderLine
{
    /// <summary>Line item ID.</summary>
    public int Id { get; init; }

    /// <summary>Product description.</summary>
    public string Description { get; init; } = string.Empty;

    /// <summary>Quantity ordered.</summary>
    public decimal Quantity { get; init; }

    /// <summary>Unit price.</summary>
    public decimal UnitPrice { get; init; }

    /// <summary>Line total.</summary>
    public decimal Total { get; init; }

    /// <summary>Product ID.</summary>
    public int? ProductId { get; init; }
}

/// <summary>
/// Contact information for a Lightspeed order.
/// </summary>
public record LightspeedContact
{
    /// <summary>First name.</summary>
    public string? FirstName { get; init; }

    /// <summary>Last name.</summary>
    public string? LastName { get; init; }

    /// <summary>Email address.</summary>
    public string? Email { get; init; }

    /// <summary>Phone number.</summary>
    public string? Phone { get; init; }
}

/// <summary>
/// Update payload for a Lightspeed order.
/// </summary>
public record LightspeedOrderUpdate
{
    /// <summary>New order status.</summary>
    public string? Status { get; init; }

    /// <summary>Order note.</summary>
    public string? Note { get; init; }

    /// <summary>Sale date.</summary>
    public DateTime? SaleDate { get; init; }
}

/// <summary>
/// Sync statistics.
/// </summary>
public record LightspeedSyncStats
{
    /// <summary>Count of orders pending sync.</summary>
    public int PendingCount { get; init; }

    /// <summary>Count of orders with failed sync.</summary>
    public int FailedCount { get; init; }

    /// <summary>Count of successfully synced orders.</summary>
    public int SyncedCount { get; init; }

    /// <summary>Count of orders not yet synced.</summary>
    public int NotSyncedCount { get; init; }

    /// <summary>Last successful sync time.</summary>
    public DateTime? LastSuccessfulSyncAt { get; init; }

    /// <summary>Last sync error (if any).</summary>
    public string? LastSyncError { get; init; }
}
