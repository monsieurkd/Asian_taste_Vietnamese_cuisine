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
/// Tests the back-of-house rules: three cook states, a per-dish note, a hold, and the
/// activity log that ties them together.
///
/// Why these exist. The tick shipped first and answered one question — "is this dish
/// done?" — which is one short of how a kitchen works. The states add a middle
/// ("the pho is on"), attribution ("who ticked it"), and a way to take a ticket off the
/// line without telling the customer their order is dead. Each of those can fail in a way
/// that is invisible from the screen:
///
///   * **A dish moving to COOKING must never finish the order.** A ticket with everything
///     on the wok is not ready, and marking it ready would email the customer to come and
///     collect food that does not exist yet. This is the single most damaging mistake
///     available in this file.
///   * **The activity log is written on the same path as the change**, so a move that
///     happens without a log line is a move nobody can account for later.
///   * **A hold must not touch the order's stage.** Collapsing the two would mean a
///     resumed order had to guess which stage to return to.
/// </summary>
public class KitchenWorkflowTests
{
    // ── Collaborators ────────────────────────────────────────────────────────

    private sealed class FakeOrderRepository : IOrderRepository
    {
        public Order Order { get; set; } = new();
        public List<OrderItem> Items { get; set; } = new();
        public List<OrderStatus> StatusWrites { get; } = new();
        public List<ActivityWrite> Activity { get; } = new();
        public List<KitchenTicketDto> Board { get; set; } = new();
        public bool ItemNotFound { get; set; }

        /// <summary>Simulates the log write failing, to pin that it cannot fail the action.</summary>
        public bool ThrowOnActivity { get; set; }
        public bool AlreadyNotified { get; set; }
        public int ReadyNotifiedAtWrites { get; private set; }

        public sealed record ActivityWrite(int OrderId, int? OrderItemId, string Kind, string Detail, string? Actor, string? StatusAtEvent);

        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(Order);

        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default)
        {
            var line = Items.FirstOrDefault(i => i.Id == orderItemId);
            if (line is null) return Task.FromResult<OrderItemCompletionResult?>(null);
            line.IsCompleted = isCompleted;
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

        /// <summary>
        /// Mirrors the real write, including the one rule that matters: a dish only counts
        /// as Done when its state IS Done, and is_completed follows it.
        /// </summary>
        public Task<CookStateResult?> SetItemCookStateAsync(int orderId, int orderItemId, string state, string? actor, CancellationToken cancellationToken = default)
        {
            if (ItemNotFound) return Task.FromResult<CookStateResult?>(null);

            var line = Items.FirstOrDefault(i => i.Id == orderItemId);
            if (line is null) return Task.FromResult<CookStateResult?>(null);

            line.CookState = state;
            line.IsCompleted = state == "Done";
            if (state == "Cooking") line.StartedAt ??= DateTime.UtcNow;
            if (state == "Done") line.CookedBy = actor;
            if (state == "Queued") { line.StartedAt = null; line.CookedBy = null; }

            return Task.FromResult<CookStateResult?>(new CookStateResult
            {
                OrderId = orderId,
                OrderItemId = orderItemId,
                State = state,
                TotalLines = Items.Count,
                DoneLines = Items.Count(i => i.CookState == "Done"),
                CookingLines = Items.Count(i => i.CookState == "Cooking"),
                OrderStatus = Order.Status.ToString(),
            });
        }

        public Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default)
        {
            var line = Items.FirstOrDefault(i => i.Id == orderItemId);
            if (line is null) return Task.FromResult(false);
            line.KitchenNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
            line.NoteBy = line.KitchenNote is null ? null : actor;
            return Task.FromResult(true);
        }

        public Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default)
        {
            Order.HeldAt = held ? DateTime.UtcNow : null;
            Order.HeldReason = held ? reason : null;
            Order.HeldBy = held ? actor : null;
            return Task.FromResult(true);
        }

        public Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default)
        {
            if (ThrowOnActivity) throw new InvalidOperationException("the log is unavailable");
            Activity.Add(new ActivityWrite(orderId, orderItemId, kind, detail, actor, statusAtEvent));
            return Task.CompletedTask;
        }

        public Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Activity.Select(a => new OrderActivityDto { Kind = a.Kind, Detail = a.Detail, Actor = a.Actor }).ToList());

        public Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default) => Task.FromResult(Board);

        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default)
        {
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

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default) => Task.FromResult(Order);
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

    private sealed class RecordingEmailQueue : IOrderEmailQueue
    {
        public List<OrderStatusUpdateEmailJob> StatusUpdates { get; } = [];
        public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default) => ValueTask.CompletedTask;
        public ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default)
        {
            StatusUpdates.Add(job);
            return ValueTask.CompletedTask;
        }
        public async IAsyncEnumerable<OrderEmailJob> ReadAllAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            await Task.CompletedTask;
            yield break;
        }
    }

    private sealed class StubCustomerRepository : ICustomerRepository
    {
        public Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default) => Task.FromResult(new Customer { Id = 1 });
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
            Task.FromResult(new Dictionary<string, string> { ["address"] = "329 Henley Beach Rd", ["pickup_minutes"] = "15" });
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
            Items = Enumerable.Range(1, lineCount).Select(i => new OrderItem
            {
                Id = i,
                OrderId = 42,
                MenuItemId = i,
                MenuItemName = $"Dish {i}",
                Quantity = 1,
                CookState = "Queued",
            }).ToList(),
        };

        var emails = new RecordingEmailQueue();
        var service = new OrderService(
            orders, new StubCustomerRepository(), new StubEmailService(), emails,
            new StubSettingsRepository(), new StubPaymentGateway(), new StubNotifier(),
            new TradingHours(TimeProvider.System), new StubMenuRepository(),
            NullLogger<OrderService>.Instance);

        return new Harness(service, orders, emails);
    }

    // ── The states themselves ────────────────────────────────────────────────

    [Fact]
    public async Task Moving_one_dish_to_cooking_leaves_the_order_alone()
    {
        var h = CreateHarness(lineCount: 3);

        var result = await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        Assert.Equal("Cooking", result!.CookState);
        Assert.Equal(1, result.CookingLines);
        Assert.Equal(0, result.DoneLines);
        Assert.False(result.OrderMarkedReady);
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    /// <summary>
    /// The single most damaging mistake available here: everything on the wok is NOT ready.
    /// </summary>
    [Fact]
    public async Task Every_dish_cooking_still_does_not_finish_the_order()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");
        var result = await h.Service.SetItemCookStateAsync(42, 2, "Cooking", "Mai");

        Assert.Equal(2, result!.CookingLines);
        Assert.Equal(0, result.DoneLines);
        Assert.False(result.OrderMarkedReady);
        // Nothing moved and nobody was emailed — the food does not exist yet.
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task The_last_dish_moved_to_done_finishes_the_order_and_tells_the_customer()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");
        var last = await h.Service.SetItemCookStateAsync(42, 2, "Done", "Mai");

        Assert.True(last!.OrderMarkedReady);
        Assert.True(last.CustomerNotified);
        Assert.Equal([OrderStatus.Ready], h.Orders.StatusWrites);
        Assert.Single(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task Putting_a_done_dish_back_to_cooking_does_not_move_a_ready_order_backwards()
    {
        var h = CreateHarness(status: OrderStatus.Ready, lineCount: 2);

        var result = await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        Assert.False(result!.OrderMarkedReady);
        Assert.Equal(OrderStatus.Ready, h.Orders.Order.Status);
        Assert.Empty(h.Orders.StatusWrites);
    }

    [Fact]
    public async Task An_unknown_state_is_refused_rather_than_stored()
    {
        var h = CreateHarness();

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 1, "Nearly", "Mai"));

        Assert.Contains("Unknown cook state", refused.Message);
    }

    [Theory]
    [InlineData("queued")]
    [InlineData("COOKING")]
    [InlineData(" done ")]
    public async Task The_state_is_read_case_insensitively(string state)
    {
        var h = CreateHarness();

        var result = await h.Service.SetItemCookStateAsync(42, 1, state, "Mai");

        // Stored in its canonical form whoever sends it, because the value is compared
        // against literals in SQL elsewhere and a stray casing would silently never match.
        Assert.Contains(result!.CookState, new[] { "Queued", "Cooking", "Done" });
    }

    [Theory]
    [InlineData(OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Completed)]
    public async Task A_closed_order_refuses_cook_state_changes(OrderStatus status)
    {
        var h = CreateHarness(status: status);

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai"));

        Assert.Contains("no longer being cooked", refused.Message);
    }

    [Fact]
    public async Task A_line_from_another_order_is_refused()
    {
        var h = CreateHarness();
        h.Orders.ItemNotFound = true;

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 999, "Done", "Mai"));

        Assert.Contains("not on order", refused.Message);
    }

    // ── The activity log ─────────────────────────────────────────────────────

    [Fact]
    public async Task Every_cook_state_move_is_logged_with_its_author()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        var entry = Assert.Single(h.Orders.Activity);
        Assert.Equal("ItemCookState", entry.Kind);
        Assert.Equal("Mai", entry.Actor);
        Assert.Equal(1, entry.OrderItemId);
        // A sentence a person reads, naming the dish — not a field-by-field diff.
        Assert.Contains("Dish 1", entry.Detail);
        Assert.Contains("cooking", entry.Detail);
    }

    [Fact]
    public async Task Finishing_the_order_is_logged_as_its_own_event()
    {
        var h = CreateHarness(lineCount: 1);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");

        // The dish move, the order moving, and the customer being told: three facts, three
        // lines. One line covering all three could not answer "was the customer told?".
        Assert.Contains(h.Orders.Activity, a => a.Kind == "ItemCookState");
        Assert.Contains(h.Orders.Activity, a => a.Kind == "StatusChanged");
        Assert.Contains(h.Orders.Activity, a => a.Kind == "ReadyNotified");
    }

    [Fact]
    public async Task A_system_change_is_named_as_the_system_rather_than_a_person()
    {
        var h = CreateHarness(lineCount: 1);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", actor: null);

        var entry = h.Orders.Activity.First(a => a.Kind == "ItemCookState");
        // "The system" is the accurate description, and more useful than a vague pronoun
        // when the question being asked is "who moved my order".
        Assert.Equal("The system", entry.Actor ?? "The system");
        Assert.StartsWith("The system", entry.Detail);
    }

    [Fact]
    public async Task A_log_failure_does_not_fail_the_kitchen_action()
    {
        var h = CreateHarness(lineCount: 1);
        h.Orders.ThrowOnActivity = true;

        // The dish move already happened; refusing it because a log row could not be
        // written would leave the food on the pass and the screen saying it is not.
        var result = await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");

        Assert.True(result!.OrderMarkedReady);
    }

    // ── The kitchen note ─────────────────────────────────────────────────────

    [Fact]
    public async Task A_kitchen_note_is_stored_with_its_author_and_logged()
    {
        var h = CreateHarness();

        var result = await h.Service.SetItemKitchenNoteAsync(42, 1, "  used cabbage  ", "Mai");

        Assert.Equal("used cabbage", result!.KitchenNote);
        Assert.Equal("Mai", result.NoteBy);

        var entry = Assert.Single(h.Orders.Activity);
        Assert.Equal("NoteAdded", entry.Kind);
        Assert.Contains("used cabbage", entry.Detail);
        Assert.Contains("Dish 1", entry.Detail);
    }

    [Fact]
    public async Task Clearing_a_note_removes_its_author_too()
    {
        var h = CreateHarness();
        await h.Service.SetItemKitchenNoteAsync(42, 1, "used cabbage", "Mai");

        var cleared = await h.Service.SetItemKitchenNoteAsync(42, 1, "   ", "Mai");

        Assert.Null(cleared!.KitchenNote);
        // A blank note that still names an author reads as somebody having said something.
        Assert.Null(cleared.NoteBy);
        Assert.Equal("NoteAdded", h.Orders.Activity.Last().Kind);
        Assert.Contains("cleared", h.Orders.Activity.Last().Detail);
    }

    // ── The hold ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Holding_requires_a_reason()
    {
        var h = CreateHarness();

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetOrderHeldAsync(42, held: true, reason: "  ", actor: "Mai"));

        // A held ticket with no reason is one the next person has to ask around about.
        Assert.Contains("Give a reason", refused.Message);
    }

    [Fact]
    public async Task Holding_does_not_touch_the_orders_stage()
    {
        var h = CreateHarness(status: OrderStatus.Confirmed);

        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting on the rolls", actor: "Mai");

        // The stage still says how far the cooking got; the hold is a separate axis.
        Assert.Equal(OrderStatus.Confirmed, h.Orders.Order.Status);
        Assert.Empty(h.Orders.StatusWrites);
        Assert.NotNull(h.Orders.Order.HeldAt);
        Assert.Equal("waiting on the rolls", h.Orders.Order.HeldReason);
    }

    [Fact]
    public async Task Resuming_clears_the_reason_so_a_live_order_carries_no_stale_excuse()
    {
        var h = CreateHarness();
        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting", actor: "Mai");

        var resumed = await h.Service.SetOrderHeldAsync(42, held: false, reason: null, actor: "Sam");

        Assert.False(resumed!.IsHeld);
        Assert.Null(resumed.HeldReason);
        Assert.Null(h.Orders.Order.HeldReason);
        Assert.Null(h.Orders.Order.HeldAt);
    }

    [Fact]
    public async Task Holding_and_resuming_are_both_logged()
    {
        var h = CreateHarness();

        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting on the rolls", actor: "Mai");
        await h.Service.SetOrderHeldAsync(42, held: false, reason: null, actor: "Sam");

        Assert.Equal("Held", h.Orders.Activity[0].Kind);
        Assert.Contains("waiting on the rolls", h.Orders.Activity[0].Detail);
        Assert.Equal("Resumed", h.Orders.Activity[1].Kind);
        Assert.Equal("Sam", h.Orders.Activity[1].Actor);
    }

    [Fact]
    public async Task A_closed_order_cannot_be_held()
    {
        var h = CreateHarness(status: OrderStatus.Cancelled);

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting", actor: "Mai"));

        Assert.Contains("nothing to hold", refused.Message);
    }

    // ── The board ────────────────────────────────────────────────────────────

    [Fact]
    public async Task The_board_counts_what_is_left_to_cook_and_what_is_on_the_wok()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RemainingLines = 3, CookingLines = 1 },
            new KitchenTicketDto { Id = 2, Status = "Pending", RemainingLines = 2, CookingLines = 2 },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(2, board.Summary.LiveOrders);
        Assert.Equal(1, board.Summary.AwaitingAcceptance);
        Assert.Equal(5, board.Summary.DishesToCook);
        Assert.Equal(3, board.Summary.DishesCooking);
    }

    [Fact]
    public async Task Held_orders_are_counted_separately_and_left_out_of_the_work()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RemainingLines = 3 },
            new KitchenTicketDto { Id = 2, Status = "Confirmed", RemainingLines = 5, IsHeld = true, HeldReason = "waiting" },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(1, board.Summary.LiveOrders);
        Assert.Equal(1, board.Summary.HeldOrders);
        // A held ticket's dishes are not work anyone should be picking up.
        Assert.Equal(3, board.Summary.DishesToCook);
    }

    [Fact]
    public async Task An_overdue_order_is_one_whose_wanted_time_has_passed()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            // Wanted 40 minutes ago, and not scheduled: late.
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-40), IsScheduled = false },
            // Wanted 40 minutes ago but for a specific time: the kitchen is doing fine.
            new KitchenTicketDto { Id = 2, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-40), IsScheduled = true },
            // Wanted five minutes ago: not late yet.
            new KitchenTicketDto { Id = 3, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-5), IsScheduled = false },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(1, board.Summary.OverdueOrders);
    }
}
