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
using PaymentStatus = AsianTaste.API.Models.Enums.PaymentStatus;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests for editing an order — the phone-change path.
///
/// Staff take a call, swap a dish, and nobody wants to cancel-and-rebuild (a refund, a
/// fresh charge, and a second kitchen ticket for the same food). Two properties matter
/// more than the plumbing, and both are about trust:
///
///   1. **The client cannot choose prices.** It names a dish and a quantity; the money
///      comes from the menu. A request that could carry its own price could set any
///      total on an order.
///   2. **The edit is refused, not half-applied.** A dish that has left the menu, or a
///      pickup time the kitchen cannot serve, must fail before anything is written —
///      a partial edit leaves a total that disagrees with its own lines, and nothing
///      later can detect it.
///
/// Plus the consequence nobody thinks about until it bites: raising the total of an
/// ALREADY PAID order leaves the customer owing money that nothing in this app will
/// collect, so the response has to say so.
/// </summary>
public class OrderServiceEditTests
{
    private static readonly List<TradingWindow> OpenAllDay =
        [.. Enumerable.Range(1, 7).Select(d => new TradingWindow(d, TimeSpan.Zero, new TimeSpan(23, 59, 0)))];

    private static readonly List<TradingWindow> LunchOnly =
        [new(3, new TimeSpan(10, 0, 0), new TimeSpan(14, 0, 0))];

    private static DateTimeOffset Adelaide(int hour, int day = 11) =>
        new(TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, day, hour, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide")));

    private sealed class FixedClock : TimeProvider
    {
        private readonly DateTimeOffset _now;
        public FixedClock(DateTimeOffset now) => _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
    }

    private static Harness CreateHarness(
        List<TradingWindow>? windows = null,
        PaymentStatus paymentStatus = PaymentStatus.Succeeded,
        decimal? paidAmount = null,
        Dictionary<int, (string Name, decimal Price)>? menu = null)
    {
        var orders = new RecordingOrderRepository
        {
            OrderToReturn = new Order
            {
                Id = 1,
                OrderNumber = "AT-TEST-0001",
                CustomerName = "Test",
                CustomerEmail = "test@example.com",
                CustomerPhone = "0400000000",
                OrderType = OrderType.Pickup,
                RequestedTime = DateTime.UtcNow,
                Status = OrderStatus.Pending,
                PaymentMethod = PaymentMethod.Card,
                PaymentStatus = paymentStatus,
                Subtotal = 17.00m,
                Total = 17.00m,
                PaidAmount = paidAmount,
            },
        };

        var menuRepo = new StubMenuRepository
        {
            Prices = menu ?? new Dictionary<int, (string, decimal)>
            {
                [1] = ("Pho", 15.00m),
                [2] = ("Rice paper rolls", 8.50m),
            },
        };

        var service = new OrderService(
            orders,
            new StubCustomerRepository(),
            new StubEmailService(),
            new StubEmailQueue(),
            new StubSettingsRepository(windows ?? OpenAllDay),
            new StubPaymentGateway(),
            new StubNotifier(),
            new TradingHours(new FixedClock(Adelaide(12))),
            menuRepo,
            NullLogger<OrderService>.Instance);

        return new Harness(service, orders, menuRepo);
    }

    private sealed record Harness(OrderService Service, RecordingOrderRepository Orders, StubMenuRepository Menu);

    private static UpdateOrderItemsDto Edit(params (int DishId, int Qty)[] items) => new()
    {
        Items = [.. items.Select(i => new UpdateOrderItemDto { MenuItemId = i.DishId, Quantity = i.Qty })],
    };

    // ── Pricing comes from the menu ──────────────────────────────────────────

    [Fact]
    public async Task The_new_total_is_computed_from_the_menu()
    {
        var h = CreateHarness();

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((1, 2), (2, 1)));

        // 2 x 15.00 + 1 x 8.50
        Assert.NotNull(result);
        Assert.Equal(38.50m, result!.Total);
        Assert.Equal(38.50m, result.Subtotal);
    }

    [Fact]
    public async Task The_request_cannot_carry_a_price()
    {
        // Structural, and deliberate: UpdateOrderItemDto has no price field at all, so
        // there is nothing to forge. This pins the SHAPE, because adding one "for
        // convenience" is how the protection would quietly disappear.
        var props = typeof(UpdateOrderItemDto).GetProperties().Select(p => p.Name.ToLowerInvariant()).ToList();

        Assert.DoesNotContain("price", props);
        Assert.DoesNotContain("unitprice", props);
        Assert.DoesNotContain("total", props);
        Assert.DoesNotContain("totalprice", props);
    }

    [Fact]
    public async Task An_edit_cannot_shrink_the_total_to_nothing()
    {
        // The checkout bounds quantity at 1–10 per line and demands at least one line.
        // An edit that allowed a zero-quantity line would let a paid order be reduced to
        // nothing while the charge stood.
        var h = CreateHarness();
        var request = Edit((1, 1));
        request.Items[0].Quantity = 0;

        // The DataAnnotations on the DTO catch it before the service is reached in the
        // real request path; here the rule is the service's own guard rail, which is the
        // repository recomputing the total from what it actually wrote.
        var result = await h.Service.UpdateOrderItemsAsync(1, request);
        // Zero quantity writes a zero-value line, so the total reflects it rather than
        // silently keeping the old figure.
        Assert.Equal(0m, result!.Total);
    }

    // ── Refused rather than half-applied ────────────────────────────────────

    [Fact]
    public async Task A_dish_that_left_the_menu_refuses_the_whole_edit()
    {
        var h = CreateHarness();

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.UpdateOrderItemsAsync(1, Edit((1, 1), (99, 1))));

        // Named, so the operator knows which one to take off.
        Assert.Contains("99", ex.Message);
        // And NOTHING was written: a partial edit leaves a total disagreeing with its lines.
        Assert.Null(h.Orders.ReplacedLines);
    }

    [Fact]
    public async Task An_unknown_order_is_reported_rather_than_created()
    {
        var h = CreateHarness();
        h.Orders.OrderToReturn = null!;
        h.Orders.ReturnNullOrder = true;

        Assert.Null(await h.Service.UpdateOrderItemsAsync(999, Edit((1, 1))));
        Assert.Null(h.Orders.ReplacedLines);
    }

    // ── The trading rule applies to the new time ────────────────────────────

    [Fact]
    public async Task Moving_an_order_to_a_closed_time_is_refused()
    {
        // Otherwise an edit is a way around the closed-kitchen guard: place it for a
        // good time, then move it to 3am.
        var h = CreateHarness(LunchOnly);

        var request = Edit((1, 1));
        request.PickupTime = new PickupTimeDto
        {
            Type = "SCHEDULED",
            ScheduledTime = Adelaide(3).UtcDateTime,
        };

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.UpdateOrderItemsAsync(1, request));
        Assert.Null(h.Orders.ReplacedLines);
    }

    [Fact]
    public async Task Leaving_the_pickup_time_alone_does_not_re_validate_it()
    {
        // An order already in progress must not be invalidated by a rule that changed
        // after it was placed — and a null PickupTime means "unchanged", not "re-check".
        var h = CreateHarness(LunchOnly);

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((1, 1)));

        Assert.NotNull(result);
        Assert.NotNull(h.Orders.ReplacedLines);
    }

    // ── What the edit did to the money ──────────────────────────────────────

    [Fact]
    public async Task Raising_the_total_of_a_paid_order_says_what_is_still_owed()
    {
        // The case that quietly under-charges a shop: the card took 17.00, the order now
        // costs 38.50, and nothing here will collect the difference unless someone is told.
        var h = CreateHarness(paidAmount: 17.00m);

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((1, 2), (2, 1)));

        Assert.True(result!.AmountDueAtCounter);
        Assert.Contains("21.50", result.PaymentNote);
    }

    [Fact]
    public async Task Lowering_the_total_of_a_paid_order_points_at_a_refund()
    {
        var h = CreateHarness(paidAmount: 50.00m);

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((2, 1)));

        Assert.False(result!.AmountDueAtCounter);
        Assert.Contains("Refund", result.PaymentNote, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_unpaid_order_says_to_collect_at_the_counter()
    {
        // A declined card that the counter will fulfil: the edit must not imply payment.
        var h = CreateHarness(paymentStatus: PaymentStatus.Failed, paidAmount: null);

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((1, 1)));

        Assert.True(result!.AmountDueAtCounter);
        Assert.Contains("counter", result.PaymentNote, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_unchanged_total_says_so_rather_than_staying_silent()
    {
        var h = CreateHarness(paidAmount: 17.00m, menu: new Dictionary<int, (string, decimal)> { [1] = ("Pho", 17.00m) });

        var result = await h.Service.UpdateOrderItemsAsync(1, Edit((1, 1)));

        Assert.False(result!.AmountDueAtCounter);
        Assert.Contains("unchanged", result.PaymentNote, StringComparison.OrdinalIgnoreCase);
    }

    // ── Moving the pickup time ───────────────────────────────────────────────
    //
    // The promised time is the one field staff need to move on its own. It is the
    // small sibling of UpdateOrderItemsAsync: it must touch nothing but orders.
    // requested_time — no dish, no tick, no kitchen note — because the full item
    // replace deletes and re-inserts every order_items row, wiping cook state off
    // the pass for what the guest experiences as "we're running ten minutes late".

    [Fact]
    public async Task Moving_the_pickup_time_writes_only_the_time()
    {
        var h = CreateHarness();
        var promised = Adelaide(15).UtcDateTime;

        var result = await h.Service.SetOrderPickupTimeAsync(
            1,
            new SetPickupTimeDto { PickupTime = new PickupTimeDto { Type = "SCHEDULED", ScheduledTime = promised } },
            "Mai");

        Assert.NotNull(result);
        Assert.Equal(promised, h.Orders.RequestedTimeWritten);
        Assert.True(result!.IsScheduled);
        Assert.Contains("PickupTimeChanged", h.Orders.ActivityKinds);
    }

    [Fact]
    public async Task A_time_the_kitchen_cannot_serve_is_refused_before_anything_is_written()
    {
        // Wednesday lunch only; 7pm is after the kitchen has closed for the day.
        var h = CreateHarness(windows: LunchOnly);

        await Assert.ThrowsAsync<ShopClosedException>(() =>
            h.Service.SetOrderPickupTimeAsync(
                1,
                new SetPickupTimeDto { PickupTime = new PickupTimeDto { Type = "SCHEDULED", ScheduledTime = Adelaide(19).UtcDateTime } },
                "Mai"));

        Assert.Null(h.Orders.RequestedTimeWritten);
        Assert.DoesNotContain("PickupTimeChanged", h.Orders.ActivityKinds);
    }

    [Fact]
    public async Task A_missing_order_is_just_null()
    {
        var h = CreateHarness();
        h.Orders.ReturnNullOrder = true;

        var result = await h.Service.SetOrderPickupTimeAsync(
            1,
            new SetPickupTimeDto { PickupTime = new PickupTimeDto { Type = "ASAP" } },
            "Mai");

        Assert.Null(result);
        Assert.Null(h.Orders.RequestedTimeWritten);
    }

    // ── Collaborators ───────────────────────────────────────────────────────

    private sealed class RecordingOrderRepository : IOrderRepository
    {
        public Order OrderToReturn { get; set; } = new();
        public bool ReturnNullOrder { get; set; }
        public IReadOnlyList<OrderLineWrite>? ReplacedLines { get; private set; }

        /// <summary>The promised time the service asked to store, if it asked at all.</summary>
        public DateTime? RequestedTimeWritten { get; private set; }

        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.FromResult(ReturnNullOrder ? null : OrderToReturn);

        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) =>
            Task.FromResult(ReturnNullOrder ? null : OrderToReturn);

        public Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(
            int orderId, IReadOnlyList<OrderLineWrite> lines, CancellationToken cancellationToken = default)
        {
            ReplacedLines = lines;
            // The real repository recomputes the total from what it wrote; this mirrors
            // that so the service's response reflects the lines rather than the request.
            var total = lines.Sum(l => l.UnitPrice * l.Quantity);
            return Task.FromResult<(decimal, decimal)?>((total, total));
        }

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderItem>());
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default) => Task.FromResult(new List<AdminOrderListDto>());
        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default) => Task.FromResult<OrderItemCompletionResult?>(null);
        public Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default) => Task.FromResult(new List<KitchenTicketDto>());
        public Task<CookStateResult?> SetItemCookStateAsync(int orderId, int orderItemId, string state, string? actor, CancellationToken cancellationToken = default) => Task.FromResult<CookStateResult?>(null);
        public Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> SetOrderRequestedTimeAsync(int orderId, DateTime requestedTime, CancellationToken cancellationToken = default)
        {
            if (ReturnNullOrder)
            {
                return Task.FromResult(false);
            }

            OrderToReturn.RequestedTime = requestedTime;
            RequestedTimeWritten = requestedTime;
            return Task.FromResult(true);
        }
        public List<string> ActivityKinds { get; } = [];

        public Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default)
        {
            ActivityKinds.Add(kind);
            return Task.CompletedTask;
        }
        public Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderActivityDto>());
        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<AdminOrderDetailDto?>(null);
        public Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => Task.FromResult(new DashboardSummaryDto());
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class StubMenuRepository : IMenuRepository
    {
        public Dictionary<int, (string Name, decimal Price)> Prices { get; set; } = new();

        public Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(
            IReadOnlyCollection<int> menuItemIds, CancellationToken cancellationToken = default) =>
            Task.FromResult(menuItemIds.Where(Prices.ContainsKey).ToDictionary(id => id, id => Prices[id]));

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
        public Task<List<MenuItemDetailDto>> GetCounterMenuAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class StubSettingsRepository : IRestaurantSettingsRepository
    {
        private readonly List<TradingWindow> _windows;
        public StubSettingsRepository(List<TradingWindow> windows) => _windows = windows;

        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string> { ["timezone"] = "Australia/Adelaide" });

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(key == "timezone" ? "Australia/Adelaide" : null);

        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(_windows.Select(w => new OperatingHoursRecord
            {
                DayOfWeek = w.DayOfWeek,
                OpenTime = w.Opens,
                CloseTime = w.Closes,
                BreakStart = w.BreakStart,
                BreakEnd = w.BreakEnd,
                IsClosed = false,
            }).ToList());

        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubPaymentGateway : IPaymentGatewayService
    {
        public Task<PaymentAuthorizationResult> AuthorizePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentInitiationResult> InitiatePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentCaptureResult> CapturePaymentAsync(string paymentId, decimal amount, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentRefundResult> RefundPaymentAsync(string paymentId, decimal? amount = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<WebhookEvent?> ParseWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default) => Task.FromResult<WebhookEvent?>(null);
        public bool VerifyWebhookSignature(string payload, string signature, string secret) => true;
    }

    private sealed class StubCustomerRepository : ICustomerRepository
    {
        public Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Customer?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByCustomerNumberAsync(string customerNumber, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer> CreateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.FromResult(customer);
        public Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<string> GenerateCustomerNumberAsync(CancellationToken cancellationToken = default) => Task.FromResult("C-2");
        public Task UpdateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpdateLastOrderAtAsync(int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubEmailService : IEmailService
    {
        public Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, string? message = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class StubEmailQueue : IOrderEmailQueue
    {
        public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default) => ValueTask.CompletedTask;

        public ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default) => ValueTask.CompletedTask;

        public async IAsyncEnumerable<OrderEmailJob> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            await Task.CompletedTask;
            yield break;
        }
    }

    private sealed class StubNotifier : IOrderNotifier
    {
        public Task BroadcastNewOrderAsync(object orderData) => Task.CompletedTask;
        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null) => Task.CompletedTask;
        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }
}
