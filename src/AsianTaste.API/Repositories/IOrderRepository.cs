using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository interface for order data access.
/// </summary>
public interface IOrderRepository
{
    /// <summary>
    /// Gets an order by its order number.
    /// </summary>
    Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets an order by its ID.
    /// </summary>
    Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a new order from the checkout request.
    /// </summary>
    Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the status of an order.
    /// </summary>
    Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates Lightspeed K-Series integration info for an order.
    /// </summary>
    Task UpdateOrderLightspeedInfoAsync(int orderId, string thirdPartyReference, DateTime sentAt, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all orders for a customer by email.
    /// </summary>
    Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets order items for a specific order.
    /// </summary>
    Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an order as having email confirmation sent.
    /// </summary>
    Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default);

    // Lightspeed Sync methods (Phase 3)

    /// <summary>
    /// Gets orders that are pending sync to Lightspeed.
    /// </summary>
    Task<List<Order>> GetPendingSyncOrdersAsync(int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets orders that failed to sync to Lightspeed.
    /// </summary>
    Task<List<Order>> GetFailedSyncOrdersAsync(int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates Lightspeed sync information for an order.
    /// </summary>
    Task UpdateOrderSyncInfoAsync(int orderId, string? lightspeedOrderId, SyncStatus status, DateTime? syncedAt, string? errorMessage, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an order as pending sync to Lightspeed.
    /// </summary>
    Task MarkOrderSyncPendingAsync(int orderId, CancellationToken cancellationToken = default);

    // Admin methods

    /// <summary>
    /// Gets all orders with optional filtering.
    /// </summary>
    Task<List<Order>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets order details with items for admin view.
    /// </summary>
    Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets dashboard summary statistics.
    /// </summary>
    Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets daily statistics for a specific date.
    /// </summary>
    Task<DailyStatsDto> GetDailyStatsAsync(DateTime date, CancellationToken cancellationToken = default);

    // Webhook support methods (Phase 4)

    /// <summary>
    /// Gets an order by its external payment ID.
    /// </summary>
    Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets an order by its Lightspeed order ID.
    /// </summary>
    Task<Order?> GetOrderByLightspeedIdAsync(string lightspeedOrderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets an order by the Stripe PaymentIntent it was paid with.
    /// </summary>
    /// <remarks>
    /// This is the linkage that actually exists for card payments: the checkout stores the
    /// PaymentIntent id on the order, and Stripe's webhook events carry the same id. Note
    /// that <see cref="GetOrderByExternalPaymentIdAsync"/> is a different column
    /// (<c>external_payment_id</c>) which nothing currently writes, so lookups by it find
    /// nothing — use this one for anything driven by a Stripe event.
    /// </remarks>
    Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates an order entity.
    /// </summary>
    Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default);

    /// <summary>
    /// Links an order to a customer by updating the customer_id.
    /// </summary>
    Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default);
}
