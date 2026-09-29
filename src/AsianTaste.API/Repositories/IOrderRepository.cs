using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Repositories;

/// <summary>
/// One line to write when an order is edited, already priced.
/// </summary>
/// <remarks>
/// Deliberately not the checkout DTO: an edit replaces lines that already exist, so it
/// carries a resolved unit price and total rather than a menu id for the repository to
/// price. The pricing decision belongs to the service, which reads the menu once — the
/// repository should not be able to invent a price.
/// </remarks>
public record OrderLineWrite
{
    public int MenuItemId { get; init; }
    public string MenuItemName { get; init; } = string.Empty;
    public int Quantity { get; init; }
    /// <summary>Price per unit, GST included, with any modifiers already applied.</summary>
    public decimal UnitPrice { get; init; }
    public string? SpecialInstructions { get; init; }
    /// <summary>Modifier ids to re-attach, priced from the menu.</summary>
    public List<int> ModifierIds { get; init; } = new();
}

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

    // Admin methods

    /// <summary>
    /// Gets all orders with optional filtering.
    /// </summary>
    Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets order details with items for admin view.
    /// </summary>
    Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets dashboard summary statistics.
    /// </summary>
    Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default);

    // Webhook support methods (Phase 4)

    /// <summary>
    /// Gets an order by the gateway's own payment id, if the order recorded one.
    /// </summary>
    /// <remarks>
    /// Last-resort lookup for a Stripe event: the checkout stores the PaymentIntent id
    /// (see <see cref="GetOrderByPaymentIntentIdAsync"/>, which is what actually
    /// matches), and this column is populated from the captured charge.
    /// </remarks>
    Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default);

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
    /// Replaces an order's line items and recomputes its total, in one transaction.
    /// </summary>
    /// <remarks>
    /// The whole point is ATOMICITY. An edit writes several rows — the order's totals
    /// and every line — and a partial write leaves a total that disagrees with its own
    /// items, which is the accounting the owner reconciles against and which no later
    /// query can detect. So it is one transaction or nothing.
    ///
    /// The caller supplies priced lines; pricing happens against the CURRENT menu so a
    /// client cannot name its own total. See <c>IMenuRepository.GetPricesForItemsAsync</c>.
    /// </remarks>
    /// <returns>The stored order's new subtotal and total, or null when it does not exist.</returns>
    Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(
        int orderId,
        IReadOnlyList<OrderLineWrite> lines,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Links an order to a customer by updating the customer_id.
    /// </summary>
    Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default);
}
