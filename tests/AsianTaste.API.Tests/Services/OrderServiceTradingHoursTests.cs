using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Email;
using AsianTaste.API.Services.Payment.Interfaces;
using AsianTaste.API.WebSockets;
using Microsoft.Extensions.Logging.Abstractions;

// The domain model and the payment-gateway contract both declare an `OrderType`, so
// the domain one is aliased — the same trap OrderServicePaymentTests documents.
using OrderType = AsianTaste.API.Models.Enums.OrderType;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests that a closed kitchen actually REFUSES an order, at the service boundary.
///
/// The trading-hours rule itself is covered exhaustively by <see cref="TradingHoursTests"/>.
/// What this file proves is the thing that was missing entirely: that the rule is
/// WIRED IN. The storefront has displayed "Closed" for a while and the API accepted the
/// order anyway, so a passing rule with no caller is exactly the failure mode here —
/// the same shape as the payment gateway that was built, registered and never called.
///
/// These tests therefore assert on the side effects, not on the verdict:
///
///   - no order row is created,
///   - no charge is attempted,
///   - no confirmation email is queued.
///
/// A refusal that has already written a row or taken money is worse than no refusal.
/// </summary>
public class OrderServiceTradingHoursTests
{
    private sealed class FixedClock : TimeProvider
    {
        private readonly DateTimeOffset _now;
        public FixedClock(DateTimeOffset now) => _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
    }

    /// <summary>3am Adelaide on a Wednesday — the order nobody should be able to place.</summary>
    private static DateTimeOffset Overnight =>
        new(TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, 11, 3, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide")));

    /// <summary>Wednesday noon Adelaide — open, so the harness itself is exercised.</summary>
    private static DateTimeOffset Lunchtime =>
        new(TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, 11, 12, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide")));

    private static readonly List<TradingWindow> OpenAllDay =
        [.. Enumerable.Range(1, 7).Select(d => new TradingWindow(d, TimeSpan.Zero, new TimeSpan(23, 59, 0)))];

    private static readonly List<TradingWindow> LunchOnly =
        [new(3, new TimeSpan(10, 0, 0), new TimeSpan(14, 0, 0))];

    private static CreateCheckoutOrderDto Request(string pickupType = "ASAP", DateTime? scheduled = null) => new()
    {
        CustomerName = "Test",
        CustomerPhone = "0400000000",
        CustomerEmail = "test@example.com",
        Items = [new CheckoutOrderItemDto { MenuItemId = 1, Quantity = 1 }],
        PaymentMethod = PaymentMethod.Card,
        PaymentToken = "pi_confirmed_abc",
        PickupTime = new PickupTimeDto { Type = pickupType, ScheduledTime = scheduled },
    };

    private sealed record Harness(
        OrderService Service,
        RecordingOrderRepository Orders,
        RecordingPaymentGateway Payment,
        StubEmailQueue Email);

    private static Harness CreateHarness(
        List<TradingWindow> windows,
        DateTimeOffset now,
        string timezone = "Australia/Adelaide")
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
                Subtotal = 17.00m,
                Total = 17.00m,
            },
        };
        var payment = new RecordingPaymentGateway();
        var email = new StubEmailQueue();

        var service = new OrderService(
            orders,
            new StubCustomerRepository(),
            new StubEmailService(),
            email,
            new StubSettingsRepository(windows, timezone),
            payment,
            new StubNotifier(),
            new TradingHours(new FixedClock(now)),
            new StubMenuRepository(),
            NullLogger<OrderService>.Instance);

        return new Harness(service, orders, payment, email);
    }

    // ── The refusal ──────────────────────────────────────────────────────────

    [Fact]
    public async Task An_order_placed_while_the_kitchen_is_shut_is_refused()
    {
        var h = CreateHarness(LunchOnly, Overnight);

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(Request()));
    }

    [Fact]
    public async Task A_refused_order_leaves_nothing_behind()
    {
        // The whole point of checking before anything happens: a refusal must not
        // create a row, charge a card, or queue an email about an order that will
        // never be cooked. A refund and a phone call is the cost if any of these run.
        var h = CreateHarness(LunchOnly, Overnight);

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(Request()));

        Assert.Equal(0, h.Payment.AuthorizeCallCount);
        Assert.Null(h.Orders.CreatedWithOrderNumber);
        Assert.Equal(0, h.Email.EnqueuedCount);
    }

    [Fact]
    public async Task The_refusal_explains_when_the_kitchen_is_next_open()
    {
        // The message is shown to the customer, so "closed" alone is not good enough —
        // they need to know whether to wait or go elsewhere.
        var h = CreateHarness(LunchOnly, Overnight);

        var ex = await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(Request()));
        Assert.Contains("10:00", ex.Message);
    }

    [Fact]
    public async Task Unreadable_opening_hours_refuse_rather_than_allow()
    {
        // No windows means no evidence the kitchen is open. Guessing "open" here is how
        // an order arrives at 3am; guessing "closed" costs one phone call.
        var h = CreateHarness([], Lunchtime);

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(Request()));
    }

    // ── The orders that must still go through ────────────────────────────────

    [Fact]
    public async Task An_order_inside_opening_hours_is_accepted()
    {
        // The control. A guard that refuses everything would pass every test above.
        var h = CreateHarness(LunchOnly, Lunchtime);

        var response = await h.Service.CreateOrderAsync(Request());

        // The service mints its own number from the restaurant's local date, so the
        // assertion is on the shape and on the order actually being written.
        Assert.StartsWith("AT-", response.OrderNumber);
        Assert.NotNull(h.Orders.CreatedWithOrderNumber);
        Assert.Equal(1, h.Payment.AuthorizeCallCount);
    }

    [Fact]
    public async Task A_scheduled_order_is_judged_at_the_time_it_is_wanted()
    {
        // Placing an order overnight for tomorrow lunch is legitimate: the customer is
        // organising ahead, and the kitchen will be open to cook it.
        var tomorrowLunch = TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, 18, 12, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide"));

        var h = CreateHarness(LunchOnly, Overnight);

        var response = await h.Service.CreateOrderAsync(
            Request("SCHEDULED", DateTime.SpecifyKind(tomorrowLunch, DateTimeKind.Utc)));

        Assert.StartsWith("AT-", response.OrderNumber);
        Assert.NotNull(h.Orders.CreatedWithOrderNumber);
    }

    [Fact]
    public async Task A_scheduled_order_wanted_while_shut_is_refused()
    {
        // Ordered mid-service for a pickup at 3am. Judged at "now" this is open, and the
        // kitchen gets a ticket nobody will cook — the failure the live probe was looking
        // for. Judged at the time chosen, it is refused.
        var threeAm = TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, 18, 3, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide"));

        var h = CreateHarness(LunchOnly, Lunchtime);

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(
            Request("SCHEDULED", DateTime.SpecifyKind(threeAm, DateTimeKind.Utc))));

        Assert.Equal(0, h.Payment.AuthorizeCallCount);
        Assert.Null(h.Orders.CreatedWithOrderNumber);
    }

    [Theory]
    [InlineData("scheduled")]
    [InlineData("Scheduled")]
    [InlineData("  SCHEDULED  ")]
    public async Task The_pickup_type_is_read_case_insensitively(string type)
    {
        // The bug this pins: the trading rule compared the type exactly while the
        // repository treated anything not-ASAP as scheduled, so a lowercase value was
        // STORED as scheduled and JUDGED as immediate. The order is accepted for a time
        // the kitchen is shut. Same request, two readings.
        var threeAm = TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(2026, 3, 18, 3, 0, 0, DateTimeKind.Unspecified),
            TimeZoneInfo.FindSystemTimeZoneById("Australia/Adelaide"));

        var h = CreateHarness(LunchOnly, Lunchtime);

        await Assert.ThrowsAsync<ShopClosedException>(() => h.Service.CreateOrderAsync(
            Request(type, DateTime.SpecifyKind(threeAm, DateTimeKind.Utc))));
    }

    // ── Collaborators ────────────────────────────────────────────────────────

    private sealed class StubSettingsRepository : IRestaurantSettingsRepository
    {
        private readonly List<TradingWindow> _windows;
        private readonly string _timezone;

        public StubSettingsRepository(List<TradingWindow> windows, string timezone)
        {
            _windows = windows;
            _timezone = timezone;
        }

        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string> { ["timezone"] = _timezone });

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(key == "timezone" ? _timezone : null);

        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(_windows.Select(w => new OperatingHoursRecord
            {
                DayOfWeek = w.DayOfWeek,
                OpenTime = w.Opens,
                CloseTime = w.Closes,
                IsClosed = false,
            }).ToList());

        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class RecordingOrderRepository : IOrderRepository
    {
        public string? CreatedWithOrderNumber { get; private set; }
        public Order OrderToReturn { get; set; } = new();

        public Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default)
        {
            CreatedWithOrderNumber = orderNumber;
            OrderToReturn.OrderNumber = orderNumber;
            return Task.FromResult(OrderToReturn);
        }

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(int orderId, IReadOnlyList<OrderLineWrite> lines, CancellationToken cancellationToken = default) => Task.FromResult<(decimal, decimal)?>(null);

        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderItem>());
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default) => Task.FromResult(new List<AdminOrderListDto>());
        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default) => Task.FromResult<OrderItemCompletionResult?>(null);
        public Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default) => Task.FromResult(new List<KitchenTicketDto>());
        public Task<CookStateResult?> SetItemCookStateAsync(int orderId, int orderItemId, string state, string? actor, CancellationToken cancellationToken = default) => Task.FromResult<CookStateResult?>(null);
        public Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<bool> SetOrderRequestedTimeAsync(int orderId, DateTime requestedTime, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderActivityDto>());
        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<AdminOrderDetailDto?>(null);
        public Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => Task.FromResult(new DashboardSummaryDto());
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class RecordingPaymentGateway : IPaymentGatewayService
    {
        public int AuthorizeCallCount { get; private set; }

        public Task<PaymentAuthorizationResult> AuthorizePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default)
        {
            AuthorizeCallCount++;
            return Task.FromResult(new PaymentAuthorizationResult
            {
                Success = true,
                AuthorizationId = "pi_test_verified",
                Amount = request.Amount / 100m,
            });
        }

        // Only Authorize is reached on the order-creation path; the rest exist to satisfy
        // the interface and must stay unreachable, so they throw rather than fabricate.
        public Task<PaymentInitiationResult> InitiatePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentCaptureResult> CapturePaymentAsync(string paymentId, decimal amount, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentRefundResult> RefundPaymentAsync(string paymentId, decimal? amount = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<WebhookEvent?> ParseWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default) => Task.FromResult<WebhookEvent?>(null);
        public bool VerifyWebhookSignature(string payload, string signature, string secret) => true;
    }

    private sealed class StubCustomerRepository : ICustomerRepository
    {
        public Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default) =>
            Task.FromResult(new Customer { Id = 1, CustomerNumber = "C-1", Email = email });

        public Task<Customer?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByCustomerNumberAsync(string customerNumber, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult<Customer?>(null);
        public Task<Customer> CreateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.FromResult(customer);
        public Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<string> GenerateCustomerNumberAsync(CancellationToken cancellationToken = default) => Task.FromResult("C-2");
        public Task UpdateAsync(Customer customer, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpdateLastOrderAtAsync(int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    /// <summary>
    /// Records nothing and sends nothing: the interesting assertion is that it is never
    /// reached, and a queue that threw would turn a correct refusal into a test error.
    /// </summary>
    private sealed class StubEmailService : IEmailService
    {
        public Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, string? message = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class StubEmailQueue : IOrderEmailQueue
    {
        public int EnqueuedCount { get; private set; }

        public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default)
        {
            EnqueuedCount++;
            return ValueTask.CompletedTask;
        }

        public ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default)
        {
            EnqueuedCount++;
            return ValueTask.CompletedTask;
        }

        /// <summary>
        /// Never yields. The queue is a recording stub; nothing reads from it in these
        /// tests, and an empty async stream is the honest answer.
        /// </summary>
        public async IAsyncEnumerable<OrderEmailJob> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            await Task.CompletedTask;
            yield break;
        }
    }

    /// <summary>
    /// Prices every dish at the value the test supplies, so an edit can be re-priced
    /// without a real menu table.
    /// </summary>
    private sealed class StubMenuRepository : IMenuRepository
    {
        public Dictionary<int, (string Name, decimal Price)> Prices { get; } =
            new() { [1] = ("Test Dish", 17.00m) };

        public Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(
            IReadOnlyCollection<int> menuItemIds, CancellationToken cancellationToken = default) =>
            Task.FromResult(menuItemIds
                .Where(Prices.ContainsKey)
                .ToDictionary(id => id, id => Prices[id]));

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

    private sealed class StubNotifier : IOrderNotifier
    {
        public Task BroadcastNewOrderAsync(object orderData) => Task.CompletedTask;
        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null) => Task.CompletedTask;
        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }
}
