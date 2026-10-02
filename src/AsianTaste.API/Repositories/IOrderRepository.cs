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
/// What a line's tick left the order looking like.
/// </summary>
/// <remarks>
/// One record rather than four out-parameters, because every field here is needed
/// together by the same decision — "is the order finished, and does anyone need
/// telling?" — and a caller that could read the counts without the status could
/// announce a ready order twice.
/// </remarks>
public record OrderItemCompletionResult
{
    public int OrderId { get; init; }
    public int OrderItemId { get; init; }
    public bool IsCompleted { get; init; }

    /// <summary>Every line on the order, including ones already ticked.</summary>
    public int TotalLines { get; init; }

    /// <summary>Lines ticked, after this change.</summary>
    public int DoneLines { get; init; }

    /// <summary>True when every line on the order is now ticked.</summary>
    public bool AllDone => TotalLines > 0 && DoneLines == TotalLines;

    /// <summary>The order's own status as text, read in the same transaction.</summary>
    public string OrderStatus { get; init; } = string.Empty;
}

/// <summary>
/// What a dish's move to a new cook state left the order looking like.
/// </summary>
public record CookStateResult
{
    public int OrderId { get; init; }
    public int OrderItemId { get; init; }
    public string State { get; init; } = string.Empty;

    /// <summary>Every dish on the order.</summary>
    public int TotalLines { get; init; }

    /// <summary>Dishes at Done.</summary>
    public int DoneLines { get; init; }

    /// <summary>Dishes at Cooking.</summary>
    public int CookingLines { get; init; }

    /// <summary>True when every dish is Done.</summary>
    public bool AllDone => TotalLines > 0 && DoneLines == TotalLines;

    /// <summary>The order's status as of this change, before any move the caller makes.</summary>
    public string OrderStatus { get; init; } = string.Empty;
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
    /// <param name="includeItems">
    /// Whether to include each order's lines. The board needs them (the ticket renders
    /// what to cook, and what is already done); the Orders table does not, and asking
    /// for them there would ship a hundred orders' worth of lines nobody reads.
    /// </param>
    Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default);

    /// <summary>
    /// Ticks or unticks one line on an order, reporting the resulting state of the order.
    /// </summary>
    /// <returns>Null when the line does not exist on that order.</returns>
    Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default);

    // ── Back-of-house (§18) ──────────────────────────────────────────────────────

    /// <summary>
    /// The kitchen's board: live tickets with their dishes, cook state and holds.
    /// </summary>
    /// <param name="includeFinished">
    /// Include orders that are collected or cancelled. Off for the board (they leave the
    /// line the moment they are handed over), on for the history view.
    /// </param>
    Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default);

    /// <summary>
    /// Moves one dish to a cook state, recording who did it and when.
    /// </summary>
    /// <returns>The resulting counts, or null when the line is not on that order.</returns>
    Task<CookStateResult?> SetItemCookStateAsync(
        int orderId,
        int orderItemId,
        string state,
        string? actor,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets or clears the kitchen's own note on a dish.
    /// </summary>
    /// <returns>False when the line is not on that order.</returns>
    Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default);

    /// <summary>
    /// Holds a ticket off the line, or puts it back.
    /// </summary>
    /// <returns>False when the order does not exist.</returns>
    Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default);

    /// <summary>
    /// Appends one line to an order's activity log.
    /// </summary>
    /// <remarks>
    /// Called from the same code path as the state change it describes, so the log cannot
    /// drift from the state. Deliberately fire-and-forget in spirit: a failure to write the
    /// log must never fail the change, because the kitchen's action already happened.
    /// </remarks>
    Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default);

    /// <summary>Everything that has happened to an order, newest first.</summary>
    Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records that the customer has been told the order is ready, at most once.
    /// </summary>
    /// <returns>
    /// True when this call set it (so it should send the message), false when it was
    /// already set (so it must not).
    /// </returns>
    Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default);

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
