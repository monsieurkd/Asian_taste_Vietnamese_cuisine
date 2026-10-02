using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Email;
using AsianTaste.API.Services.Payment.Interfaces;
using AsianTaste.API.WebSockets;
using Microsoft.Extensions.Logging.Abstractions;

using OrderType = AsianTaste.API.Models.Enums.OrderType;
using DomainPaymentStatus = AsianTaste.API.Models.Enums.PaymentStatus;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests the kitchen's per-dish tick: what the LAST one does, and that the customer is
/// told exactly once.
///
/// Why these exist. Completion was only expressible per order, so a four-dish ticket had
/// one honest answer to "what is left?" — all of it. These tests pin the rule that turns
/// the ticks into a finished order, and the two ways it could go wrong in a way nobody
/// would notice from a screen:
///
///   * **Nobody is told.** The order silently reaches Ready and the customer waits at the
///     counter until someone wonders where their food is. Asserted on the queue's
///     collaborator, not on the response, because the response could say anything.
///   * **Somebody is told twice.** Unticking and re-ticking, or two tablets finishing the
///     last two dishes, reaches "all done" more than once. A second "your order is ready"
///     for food already collected is worse than no message, so the send is CLAIMED rather
///     than decided.
/// </summary>
public class OrderItemCompletionTests
{
    // ── Collaborators ────────────────────────────────────────────────────────

    /// <summary>
    /// An order repository that behaves like the real one where it matters here: the
    /// counts come back from the stored lines, and the ready-notification claim can only
    /// be won once.
    /// </summary>
    private sealed class FakeOrderRepository : IOrderRepository
    {
        public Order Order { get; set; } = new();
        public List<OrderItem> Items { get; set; } = new();
        public List<OrderStatus> StatusWrites { get; } = new();
        public int ReadyNotifiedAtWrites { get; private set; }
        public bool AlreadyNotified { get; set; }

        /// <summary>When true, ticking a line reports success but ticks nothing.</summary>
        public bool ItemNotFound { get; set; }

        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Order?>(Order);

        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default)
        {
            if (ItemNotFound) return Task.FromResult<OrderItemCompletionResult?>(null);

            var line = Items.FirstOrDefault(i => i.Id == orderItemId);
            if (line is null) return Task.FromResult<OrderItemCompletionResult?>(null);

            line.IsCompleted = isCompleted;

            // The status as the real query reads it: inside the same transaction as the
            // tick, so it is the status BEFORE any move this call is about to make. The
            // service relies on that distinction to know whether the order still needs
            // moving.
            return Task.FromResult<OrderItemCompletionResult?>(new OrderItemCompletionResult
            {
                OrderId = orderId,
                OrderItemId = orderItemId,
                IsCompleted = isCompleted,
                TotalLines = Items.Count,
                DoneLines = Items.Count(i => i.IsCompleted),
                OrderStatus = Order.Status.ToString(),
            });
        }

        public Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default) => Task.FromResult(new List<KitchenTicketDto>());
        public Task<CookStateResult?> SetItemCookStateAsync(int orderId, int orderItemId, string state, string? actor, CancellationToken cancellationToken = default) => Task.FromResult<CookStateResult?>(null);
        public Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderActivityDto>());

        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default)
        {
            // Mirrors the guarded UPDATE: the row is only claimed while it is still null.
            if (AlreadyNotified) return Task.FromResult(false);

            AlreadyNotified = true;
            ReadyNotifiedAtWrites++;
            return Task.FromResult(true);
        }

        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default)
        {
            Order.Status = status;
            StatusWrites.Add(status);
            return Task.CompletedTask;
        }

        public Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default) =>
            Task.FromResult(Order);

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(Items);
        public Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<AdminOrderDetailDto?>(null);
        public Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => Task.FromResult(new DashboardSummaryDto());
        public Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default) => Task.FromResult(new List<AdminOrderListDto>());
        public Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(int orderId, IReadOnlyList<OrderLineWrite> lines, CancellationToken cancellationToken = default) => Task.FromResult<(decimal, decimal)?>(null);
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    /// <summary>
    /// Records what the queue was asked to send, so "was the customer told?" is asserted
    /// on the collaborator rather than on a response field that could say anything.
    /// </summary>
    private sealed class RecordingEmailQueue : IOrderEmailQueue
    {
        public List<OrderStatusUpdateEmailJob> StatusUpdates { get; } = [];
        public List<OrderConfirmationEmailJob> Confirmations { get; } = [];

        public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default)
        {
            Confirmations.Add(job);
            return ValueTask.CompletedTask;
        }

        public ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default)
        {
            StatusUpdates.Add(job);
            return ValueTask.CompletedTask;
        }

        public async IAsyncEnumerable<OrderEmailJob> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            await Task.CompletedTask;
            yield break;
        }
    }

    private sealed class StubCustomerRepository : ICustomerRepository
    {
        public Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default) =>
            Task.FromResult(new Customer { Id = 1, CustomerNumber = "C-1", Email = email });
        public Task<Customer?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByCustomerNumberAsync(string customerNumber, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer> CreateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.FromResult(customer);
        public Task UpdateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<string> GenerateCustomerNumberAsync(CancellationToken cancellationToken = default) => Task.FromResult("C-1");
        public Task UpdateLastOrderAtAsync(int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubEmailService : IEmailService
    {
        public Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, string? message = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class StubSettingsRepository : IRestaurantSettingsRepository
    {
        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string> { ["address"] = "329 Henley Beach Rd, Brooklyn Park SA 5032" });
        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult<string?>(null);
        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) => Task.FromResult(new List<OperatingHoursRecord>());
        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubPaymentGateway : IPaymentGatewayService
    {
        public Task<PaymentAuthorizationResult> AuthorizePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentInitiationResult> InitiatePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentCaptureResult> CapturePaymentAsync(string paymentId, decimal amount, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentRefundResult> RefundPaymentAsync(string paymentId, decimal? amount = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<WebhookEvent?> ParseWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public bool VerifyWebhookSignature(string payload, string signature, string secret) => false;
    }

    private sealed class StubMenuRepository : IMenuRepository
    {
        public Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(IReadOnlyCollection<int> menuItemIds, CancellationToken cancellationToken = default) =>
            Task.FromResult(menuItemIds.ToDictionary(id => id, id => ("Test Dish", 17.00m)));
        public Task<bool> SetItemAvailabilityAsync(int id, bool isAvailable, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<MenuItemDetailDto?> UpdateItemAsync(int id, MenuItemUpdate update, CancellationToken cancellationToken = default) => Task.FromResult<MenuItemDetailDto?>(null);
        public Task<MenuItemDetailDto?> GetItemByIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult<MenuItemDetailDto?>(null);
        public Task<MenuResponseDto> GetFullMenuAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetItemsByCategoryAsync(int categoryId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> SearchItemsAsync(string query, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> SearchItemsAdvancedAsync(SearchParametersDto parameters, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetPopularItemsAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetAvailableItemsAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class StubNotifier : IOrderNotifier
    {
        public Task BroadcastNewOrderAsync(object orderData) => Task.CompletedTask;
        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null) => Task.CompletedTask;
        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }

    // ── Harness ──────────────────────────────────────────────────────────────

    private sealed record Harness(OrderService Service, FakeOrderRepository Orders, RecordingEmailQueue Emails);

    private static Harness CreateHarness(
        OrderStatus status = OrderStatus.Confirmed,
        int lineCount = 3,
        string customerEmail = "customer@example.com")
    {
        var orders = new FakeOrderRepository
        {
            Order = new Order
            {
                Id = 42,
                OrderNumber = "AT-TEST-0042",
                CustomerName = "Mai",
                CustomerEmail = customerEmail,
                CustomerPhone = "0400000000",
                OrderType = OrderType.Pickup,
                Status = status,
                PaymentStatus = DomainPaymentStatus.Succeeded,
                Total = 51.00m,
            },
            Items = Enumerable.Range(1, lineCount)
                .Select(i => new OrderItem { Id = i, OrderId = 42, MenuItemId = i, MenuItemName = $"Dish {i}", Quantity = 1 })
                .ToList(),
        };

        var emails = new RecordingEmailQueue();

        var service = new OrderService(
            orders,
            new StubCustomerRepository(),
            new StubEmailService(),
            emails,
            new StubSettingsRepository(),
            new StubPaymentGateway(),
            new StubNotifier(),
            new TradingHours(TimeProvider.System),
            new StubMenuRepository(),
            NullLogger<OrderService>.Instance);

        return new Harness(service, orders, emails);
    }

    // ── The rule: the last dish finishes the order ────────────────────────────

    [Fact]
    public async Task Ticking_a_dish_that_is_not_the_last_leaves_the_order_alone()
    {
        var h = CreateHarness(lineCount: 3);

        var result = await h.Service.SetItemCompletedAsync(42, 1, true);

        Assert.NotNull(result);
        Assert.Equal(1, result!.DoneLines);
        Assert.Equal(3, result.TotalLines);
        Assert.False(result.OrderMarkedReady);
        Assert.Equal(nameof(OrderStatus.Confirmed), result.OrderStatus);

        // Nothing moved, so nobody was written to and nobody was emailed.
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task Ticking_the_last_dish_moves_the_order_to_ready()
    {
        var h = CreateHarness(lineCount: 3);

        await h.Service.SetItemCompletedAsync(42, 1, true);
        await h.Service.SetItemCompletedAsync(42, 2, true);
        var last = await h.Service.SetItemCompletedAsync(42, 3, true);

        Assert.NotNull(last);
        Assert.True(last!.OrderMarkedReady);
        Assert.Equal(3, last.DoneLines);
        Assert.Equal(nameof(OrderStatus.Ready), last.OrderStatus);

        // The move is a real write, not just a field on the response.
        Assert.Equal([OrderStatus.Ready], h.Orders.StatusWrites);
        Assert.Equal(OrderStatus.Ready, h.Orders.Order.Status);
    }

    [Fact]
    public async Task Ticking_the_last_dish_tells_the_customer_exactly_once()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCompletedAsync(42, 1, true);
        var last = await h.Service.SetItemCompletedAsync(42, 2, true);

        Assert.True(last!.CustomerNotified);

        var sent = Assert.Single(h.Emails.StatusUpdates);
        Assert.Equal("AT-TEST-0042", sent.OrderNumber);
        Assert.Equal("customer@example.com", sent.ToEmail);
        Assert.Equal("Ready", sent.Status);
        Assert.Contains("329 Henley Beach Rd", sent.Message);

        // One claim, one message.
        Assert.Equal(1, h.Orders.ReadyNotifiedAtWrites);
    }

    /// <summary>
    /// The race the claim exists for: two tablets, the last two dishes, one answer each.
    /// </summary>
    [Fact]
    public async Task A_second_claim_on_the_ready_message_is_refused_rather_than_sent_again()
    {
        var h = CreateHarness(lineCount: 1);

        var first = await h.Service.SetItemCompletedAsync(42, 1, true);
        Assert.True(first!.CustomerNotified);

        // Put the dish back on the list and finish it again — the same journey a mistap
        // and a correction make, and the same one two tablets racing on the last two
        // dishes make between them.
        //
        // The order is rewound to Confirmed first, because a mistake being corrected
        // happens BEFORE the food leaves the pass: the order is not Ready yet, and this is
        // the path that reaches "all lines are done" a second time with a live order.
        await h.Service.SetItemCompletedAsync(42, 1, false);
        h.Orders.Order.Status = OrderStatus.Confirmed;

        var again = await h.Service.SetItemCompletedAsync(42, 1, true);

        Assert.True(again!.OrderMarkedReady);
        Assert.False(again.CustomerNotified);

        // Still exactly one message. This is the whole point of claiming rather than
        // reasoning: the condition "all lines are done" was reached twice.
        Assert.Single(h.Emails.StatusUpdates);
        Assert.Equal(1, h.Orders.ReadyNotifiedAtWrites);
    }

    [Fact]
    public async Task An_order_already_ready_is_not_moved_or_announced_again()
    {
        var h = CreateHarness(status: OrderStatus.Ready, lineCount: 2);

        var result = await h.Service.SetItemCompletedAsync(42, 1, true);

        Assert.False(result!.OrderMarkedReady);
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    /// <summary>
    /// A kitchen marks food as cooked in whatever order the wok allows, so the last tick
    /// is often not the last dish.
    /// </summary>
    [Fact]
    public async Task The_order_is_finished_by_the_last_remaining_dish_in_any_order()
    {
        var h = CreateHarness(lineCount: 3);

        await h.Service.SetItemCompletedAsync(42, 3, true);
        await h.Service.SetItemCompletedAsync(42, 1, true);
        var last = await h.Service.SetItemCompletedAsync(42, 2, true);

        Assert.True(last!.OrderMarkedReady);
        Assert.Equal(3, last.DoneLines);
    }

    // ── The guards ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Unticking_a_dish_does_not_move_a_ready_order_backwards()
    {
        var h = CreateHarness(status: OrderStatus.Ready, lineCount: 2);

        var result = await h.Service.SetItemCompletedAsync(42, 1, false);

        Assert.False(result!.OrderMarkedReady);
        // The food is on the counter and the customer has been emailed; a mistap on a
        // tablet must not un-announce either.
        Assert.Equal(OrderStatus.Ready, h.Orders.Order.Status);
        Assert.Empty(h.Orders.StatusWrites);
    }

    [Theory]
    [InlineData(OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Completed)]
    public async Task A_closed_order_cannot_have_its_dishes_ticked(OrderStatus status)
    {
        var h = CreateHarness(status: status, lineCount: 2);

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCompletedAsync(42, 1, true));

        Assert.Contains("no longer being cooked", refused.Message);
        Assert.Empty(h.Orders.StatusWrites);
    }

    [Fact]
    public async Task A_line_that_is_not_on_the_order_is_refused_rather_than_ticked()
    {
        var h = CreateHarness(lineCount: 2);
        h.Orders.ItemNotFound = true;

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCompletedAsync(42, 999, true));

        Assert.Contains("not on order", refused.Message);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task A_missing_order_reports_not_found_rather_than_throwing()
    {
        var h = CreateHarness();
        h.Orders.Order = null!;

        // The controller turns null into a 404 and InvalidOperationException into a 400.
        // The difference matters: one is "no such order", the other is "you may not do
        // that to this order".
        var result = await h.Service.SetItemCompletedAsync(42, 1, true);

        Assert.Null(result);
    }

    // ── A counter order has nobody to email ──────────────────────────────────

    [Fact]
    public async Task A_counter_order_with_no_email_address_is_ready_without_a_message()
    {
        var h = CreateHarness(lineCount: 1, customerEmail: string.Empty);

        var result = await h.Service.SetItemCompletedAsync(42, 1, true);

        Assert.True(result!.OrderMarkedReady);
        // "The order is ready" and "the customer knows" are different facts. Reported
        // honestly, because the cook now has to call the number out instead.
        Assert.False(result.CustomerNotified);
        Assert.Empty(h.Emails.StatusUpdates);
    }
}
