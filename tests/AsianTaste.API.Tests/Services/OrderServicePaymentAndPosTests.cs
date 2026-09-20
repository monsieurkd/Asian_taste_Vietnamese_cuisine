using AsianTaste.API.WebSockets;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Email;
using AsianTaste.API.Services.Lightspeed;
using AsianTaste.API.Services.Payment.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;

// Both the domain model and the payment-gateway contract declare OrderType and
// PaymentStatus with the same member names. Aliases keep the test readable and
// make it obvious which one each assertion means.
using OrderType = AsianTaste.API.Models.Enums.OrderType;
using GatewayPaymentStatus = AsianTaste.API.Services.Payment.Interfaces.PaymentStatus;
using DomainPaymentStatus = AsianTaste.API.Models.Enums.PaymentStatus;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests that order creation actually TAKES PAYMENT and PUSHES TO THE POS.
///
/// Regression context, and the reason these exist at all:
///
/// The services for both were fully built and registered in DI, but
/// <c>OrderService.CreateOrderAsync</c> never called either one — it had
/// `// TODO: Send to Lightspeed K-Series` and `// TODO: Process payment if Card`,
/// then returned `PaymentDisplay = "Paid online"` for every card order regardless.
///
/// So a customer could pay and the kitchen would never see the order, and an order
/// could be marked paid without a cent being charged. A test that only checked the
/// response DTO would have passed: the response said "Paid online" the whole time.
/// These tests assert on the COLLABORATORS — that the gateway was asked and the POS
/// was told — because that is the property that was missing.
/// </summary>
public class OrderServicePaymentAndPosTests
{
    // ── Collaborators ────────────────────────────────────────────────────────

    private sealed class RecordingPaymentGateway : IPaymentGatewayService
    {
        public int AuthorizeCallCount { get; private set; }
        public int CaptureCallCount { get; private set; }
        public PaymentRequest? LastRequest { get; private set; }
        public bool NextSuccess { get; set; } = true;
        public string NextAuthorizationId { get; set; } = "pi_test_123";
        public string? NextError { get; set; }
        public Exception? NextThrow { get; set; }

        public Task<PaymentAuthorizationResult> AuthorizePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default)
        {
            AuthorizeCallCount++;
            LastRequest = request;

            if (NextThrow is not null) throw NextThrow;

            return Task.FromResult(new PaymentAuthorizationResult
            {
                Success = NextSuccess,
                AuthorizationId = NextSuccess ? NextAuthorizationId : string.Empty,
                ErrorMessage = NextError,
            });
        }

        public Task<PaymentInitiationResult> InitiatePaymentAsync(PaymentRequest request, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PaymentInitiationResult { Success = true, PaymentId = "pi_1" });

        public Task<PaymentCaptureResult> CapturePaymentAsync(string paymentId, decimal amount, CancellationToken cancellationToken = default)
        {
            CaptureCallCount++;
            return Task.FromResult(new PaymentCaptureResult { Success = true, CaptureId = "cap_1", Amount = amount });
        }

        public Task<PaymentRefundResult> RefundPaymentAsync(string paymentId, decimal? amount = null, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PaymentRefundResult { Success = true, RefundId = "re_1", Amount = amount ?? 0m });

        public Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new PaymentStatusResult { Status = GatewayPaymentStatus.Succeeded });

        public Task<WebhookEvent?> ParseWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default) =>
            Task.FromResult<WebhookEvent?>(null);

        public bool VerifyWebhookSignature(string payload, string signature, string secret) => true;
    }

    private sealed class RecordingLightspeed : ILightspeedOrderService
    {
        public int CreateOrderCallCount { get; private set; }
        public Order? LastOrder { get; private set; }
        public bool NextSuccess { get; set; } = true;
        public int NextLightspeedOrderId { get; set; } = 4242;
        public Exception? NextThrow { get; set; }

        public Task<LightspeedOrderResult> CreateOrderAsync(Order order)
        {
            CreateOrderCallCount++;
            LastOrder = order;

            if (NextThrow is not null) throw NextThrow;

            return Task.FromResult(new LightspeedOrderResult
            {
                Success = NextSuccess,
                LightspeedOrderId = NextSuccess ? NextLightspeedOrderId : null,
                ErrorMessage = NextSuccess ? null : "POS unreachable",
            });
        }

        public Task<LightspeedOrderResult> UpdateOrderAsync(int lightspeedOrderId, LightspeedOrderUpdate update) =>
            Task.FromResult(new LightspeedOrderResult { Success = true, LightspeedOrderId = lightspeedOrderId });

        public Task<LightspeedOrder?> GetOrderAsync(int lightspeedOrderId) =>
            Task.FromResult<LightspeedOrder?>(null);

        public Task<bool> SyncOrderStatusAsync(int orderId, OrderStatus status) => Task.FromResult(true);

        public Task<int> RetryFailedSyncsAsync() => Task.FromResult(0);

        public Task<LightspeedSyncStats> GetSyncStatsAsync() =>
            Task.FromResult(new LightspeedSyncStats());
    }

    private sealed class RecordingOrderRepository : IOrderRepository
    {
        public List<Order> Updates { get; } = new();
        public List<(int OrderId, string? LightspeedId, SyncStatus Status)> SyncUpdates { get; } = new();
        public List<int> MarkedPending { get; } = new();
        public Order OrderToReturn { get; set; } = new();

        public Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default)
        {
            OrderToReturn.OrderNumber = orderNumber;
            return Task.FromResult(OrderToReturn);
        }

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default)
        {
            // Snapshot: the caller mutates this same instance, so storing the
            // reference would let later changes rewrite history.
            Updates.Add(new Order
            {
                Id = order.Id,
                OrderNumber = order.OrderNumber,
                Status = order.Status,
                PaymentStatus = order.PaymentStatus,
                ExternalPaymentId = order.ExternalPaymentId,
                PaidAmount = order.PaidAmount,
                PaidAt = order.PaidAt,
                PaymentFailureReason = order.PaymentFailureReason,
            });
            return Task.CompletedTask;
        }

        public Task UpdateOrderSyncInfoAsync(int orderId, string? lightspeedOrderId, SyncStatus status, DateTime? syncedAt, string? errorMessage, CancellationToken cancellationToken = default)
        {
            SyncUpdates.Add((orderId, lightspeedOrderId, status));
            return Task.CompletedTask;
        }

        public Task MarkOrderSyncPendingAsync(int orderId, CancellationToken cancellationToken = default)
        {
            MarkedPending.Add(orderId);
            return Task.CompletedTask;
        }

        // Remaining members exist only to satisfy the interface; the tests assert on
        // UpdateOrderAsync, UpdateOrderSyncInfoAsync and MarkOrderSyncPendingAsync.
        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpdateOrderLightspeedInfoAsync(int orderId, string thirdPartyReference, DateTime sentAt, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult<AdminOrderDetailDto?>(null);
        public Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => Task.FromResult(new DashboardSummaryDto());
        public Task<DailyStatsDto> GetDailyStatsAsync(DateTime date, CancellationToken cancellationToken = default) => Task.FromResult(new DailyStatsDto());
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task<Order?> GetOrderByLightspeedIdAsync(string lightspeedOrderId, CancellationToken cancellationToken = default) => Task.FromResult<Order?>(null);
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) => Task.FromResult(new List<OrderItem>());
        public Task<List<Order>> GetPendingSyncOrdersAsync(int limit, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<Order>> GetFailedSyncOrdersAsync(int limit, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
        public Task<List<Order>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, CancellationToken cancellationToken = default) => Task.FromResult(new List<Order>());
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
        public Task<List<CustomerPaymentMethod>> GetPaymentMethodsAsync(int customerId, CancellationToken cancellationToken = default) => Task.FromResult(new List<CustomerPaymentMethod>());
    }

    private sealed class StubEmailService : IEmailService
    {
        public Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class StubEmailQueue : IOrderEmailQueue
    {
        public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default) => ValueTask.CompletedTask;

        public async IAsyncEnumerable<OrderConfirmationEmailJob> ReadAllAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            await Task.CompletedTask;
            yield break;
        }
    }

    private sealed class StubSettingsRepository : IRestaurantSettingsRepository
    {
        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string>());

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult<string?>(null);
        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) => Task.FromResult(new List<OperatingHoursRecord>());
        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    // ── Harness ──────────────────────────────────────────────────────────────

    private sealed record Harness(
        OrderService Service,
        RecordingPaymentGateway Payment,
        RecordingLightspeed Lightspeed,
        RecordingOrderRepository Orders,
        IOrderNotifier Notifier,
        RecordingOrderNotifier? Pushes);

    /// <summary>
    /// Records order pushes rather than opening WebSocket connections.
    ///
    /// This is the seam that was missing: BroadcastNewOrderAsync was defined but
    /// never called, so a customer's order reached the kitchen only on refresh.
    /// </summary>
    private sealed class RecordingOrderNotifier : IOrderNotifier
    {
        public List<object> NewOrders { get; } = [];

        public Task BroadcastNewOrderAsync(object orderData)
        {
            NewOrders.Add(orderData);
            return Task.CompletedTask;
        }

        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null)
            => Task.CompletedTask;

        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }

    private static Harness CreateHarness(PaymentMethod method = PaymentMethod.Card, decimal total = 17.00m, string? paymentToken = "pi_confirmed_abc", IOrderNotifier? notifier = null)
    {
        var payment = new RecordingPaymentGateway();
        var lightspeed = new RecordingLightspeed();
        notifier ??= new RecordingOrderNotifier();
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
                PaymentMethod = method,
                Subtotal = total,
                Total = total,
            },
        };

        var service = new OrderService(
            orders,
            new StubCustomerRepository(),
            new StubEmailService(),
            new StubEmailQueue(),
            new StubSettingsRepository(),
            payment,
            lightspeed,
            // Records pushes instead of opening WebSockets, so these tests stay
            // focused on payment and POS behaviour.
            notifier,
            NullLogger<OrderService>.Instance);

        return new Harness(service, payment, lightspeed, orders, notifier, notifier as RecordingOrderNotifier);
    }

    private static CreateCheckoutOrderDto CardRequest(string? paymentToken = "pi_confirmed_abc") => new()
    {
        CustomerName = "Test",
        CustomerEmail = "test@example.com",
        CustomerPhone = "0400000000",
        OrderType = OrderType.Pickup,
        PaymentMethod = PaymentMethod.Card,
        PaymentToken = paymentToken,
        Items = [new CheckoutOrderItemDto { MenuItemId = 1, Quantity = 2 }],
    };

    private static CreateCheckoutOrderDto CashRequest() => new()
    {
        CustomerName = "Test",
        CustomerEmail = "test@example.com",
        CustomerPhone = "0400000000",
        OrderType = OrderType.Pickup,
        PaymentMethod = PaymentMethod.Cash,
        Items = [new CheckoutOrderItemDto { MenuItemId = 1, Quantity = 2 }],
    };

    // ── Payment ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Card_order_asks_the_gateway_to_take_payment()
    {
        // The core regression: this call did not happen at all.
        var h = CreateHarness();
        await h.Service.CreateOrderAsync(CardRequest());

        Assert.Equal(1, h.Payment.AuthorizeCallCount);
    }

    [Fact]
    public async Task Successful_payment_marks_the_order_paid_and_records_the_authorization()
    {
        var h = CreateHarness();
        h.Payment.NextAuthorizationId = "pi_live_xyz";

        await h.Service.CreateOrderAsync(CardRequest());

        var update = Assert.Single(h.Orders.Updates);
        Assert.Equal(DomainPaymentStatus.Succeeded, update.PaymentStatus);
        Assert.Equal("pi_live_xyz", update.ExternalPaymentId);
        Assert.NotNull(update.PaidAt);
        Assert.Null(update.PaymentFailureReason);
    }

    [Fact]
    public async Task Successful_payment_reports_paid_online()
    {
        var h = CreateHarness();
        var response = await h.Service.CreateOrderAsync(CardRequest());

        Assert.Equal("Paid online", response.PaymentDisplay);
    }

    [Fact]
    public async Task Declined_payment_marks_the_order_failed_and_says_so()
    {
        // Before the fix this returned "Paid online" regardless of what happened.
        var h = CreateHarness();
        h.Payment.NextSuccess = false;
        h.Payment.NextError = "Your card was declined.";

        var response = await h.Service.CreateOrderAsync(CardRequest());

        var update = Assert.Single(h.Orders.Updates);
        Assert.Equal(DomainPaymentStatus.Failed, update.PaymentStatus);
        Assert.Equal("Your card was declined.", update.PaymentFailureReason);
        Assert.DoesNotContain("Paid online", response.PaymentDisplay);
    }

    [Fact]
    public async Task A_gateway_that_throws_still_leaves_an_order_marked_unpaid_rather_than_paid()
    {
        // A gateway outage must not produce an order that claims to be paid.
        var h = CreateHarness();
        h.Payment.NextThrow = new HttpRequestException("stripe unreachable");

        var response = await h.Service.CreateOrderAsync(CardRequest());

        var update = Assert.Single(h.Orders.Updates);
        Assert.Equal(DomainPaymentStatus.Failed, update.PaymentStatus);
        Assert.Contains("stripe unreachable", update.PaymentFailureReason);
        Assert.DoesNotContain("Paid online", response.PaymentDisplay);
    }

    [Fact]
    public async Task Payment_is_attempted_for_the_servers_own_total_in_minor_units()
    {
        // The amount sent to the gateway must be the server's figure, not anything
        // the client supplied. $17.00 -> 1700 cents, AUD.
        var h = CreateHarness(total: 17.00m);

        await h.Service.CreateOrderAsync(CardRequest());

        var request = Assert.IsType<PaymentRequest>(h.Payment.LastRequest);
        Assert.Equal(1700, request.Amount);
        Assert.Equal("aud", request.Currency);
    }

    [Fact]
    public async Task The_idempotency_key_is_derived_from_the_order_so_a_retry_cannot_double_charge()
    {
        var h = CreateHarness();

        await h.Service.CreateOrderAsync(CardRequest());
        var first = h.Payment.LastRequest!.IdempotencyKey;
        await h.Service.CreateOrderAsync(CardRequest());

        Assert.Equal(first, h.Payment.LastRequest!.IdempotencyKey);
        Assert.Contains("1", first); // the order id
    }

    [Fact]
    public async Task The_payment_intent_from_the_client_is_forwarded_for_verification()
    {
        // The server verifies the intent with Stripe rather than trusting the
        // client's word, so the token must reach the gateway.
        var h = CreateHarness();

        await h.Service.CreateOrderAsync(CardRequest(paymentToken: "pi_confirmed_abc"));

        Assert.Equal("pi_confirmed_abc", h.Payment.LastRequest!.PaymentMethodId);
    }

    [Fact]
    public async Task Cash_orders_do_not_touch_the_payment_gateway()
    {
        var h = CreateHarness();
        var request = CardRequest();
        request.PaymentMethod = PaymentMethod.Cash;

        var response = await h.Service.CreateOrderAsync(request);

        Assert.Equal(0, h.Payment.AuthorizeCallCount);
        Assert.Equal("Pay on pickup", response.PaymentDisplay);
    }

    // ── POS ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Order_is_pushed_to_the_pos()
    {
        // The other half of the regression: the customer paid and the kitchen was
        // never told.
        var h = CreateHarness();

        await h.Service.CreateOrderAsync(CardRequest());

        Assert.Equal(1, h.Lightspeed.CreateOrderCallCount);
        Assert.False(string.IsNullOrWhiteSpace(h.Lightspeed.LastOrder!.OrderNumber));
        Assert.StartsWith("AT-", h.Lightspeed.LastOrder.OrderNumber);
    }

    [Fact]
    public async Task A_successful_pos_push_records_the_lightspeed_order_id()
    {
        var h = CreateHarness();
        h.Lightspeed.NextLightspeedOrderId = 9876;

        await h.Service.CreateOrderAsync(CardRequest());

        var sync = Assert.Single(h.Orders.SyncUpdates);
        Assert.Equal(9876.ToString(), sync.LightspeedId);
        Assert.Equal(SyncStatus.Synced, sync.Status);
    }

    [Fact]
    public async Task A_failed_pos_push_is_queued_for_retry_and_does_not_fail_the_order()
    {
        // The customer has paid; a POS hiccup must not lose the order or throw.
        var h = CreateHarness();
        h.Lightspeed.NextSuccess = false;

        var response = await h.Service.CreateOrderAsync(CardRequest());

        Assert.Single(h.Orders.MarkedPending);
        Assert.Empty(h.Orders.SyncUpdates);
        Assert.StartsWith("AT-", response.OrderNumber); // the order still succeeded
    }

    [Fact]
    public async Task A_pos_push_that_throws_is_still_queued_for_retry()
    {
        var h = CreateHarness();
        h.Lightspeed.NextThrow = new TimeoutException("POS timed out");

        var response = await h.Service.CreateOrderAsync(CardRequest());

        Assert.Single(h.Orders.MarkedPending);
        Assert.StartsWith("AT-", response.OrderNumber);
    }

    [Fact]
    public async Task The_pos_push_happens_even_when_payment_failed()
    {
        // A declined card still leaves an order the counter may fulfil (the customer
        // can pay cash on collection), so the kitchen must see it.
        var h = CreateHarness();
        h.Payment.NextSuccess = false;

        await h.Service.CreateOrderAsync(CardRequest());

        Assert.Equal(1, h.Lightspeed.CreateOrderCallCount);
    }

    // ── Admin dashboard push ─────────────────────────────────────────────────
    //
    // Regression context: BroadcastNewOrderAsync was implemented and documented
    // on OrderWebSocketHandler but no code ever called it, so an order placed by
    // a customer only appeared in the admin dashboard when someone refreshed the
    // page. That is invisible while watching a single screen — the order does
    // appear, just late — and it matters most for the kitchen tablet, where the
    // whole point is to be told about an order without touching anything.

    [Fact]
    public async Task A_new_order_is_pushed_to_admin_dashboards()
    {
        // Without this call the kitchen learns about an order only on refresh.
        var h = CreateHarness();

        await h.Service.CreateOrderAsync(CardRequest());

        Assert.Single(h.Pushes!.NewOrders);
    }

    [Fact]
    public async Task The_push_carries_the_fields_a_dashboard_needs_to_act()
    {
        // A push that arrives without an order number or total cannot be acted on,
        // so assert on the payload rather than only on the count.
        var h = CreateHarness();

        var response = await h.Service.CreateOrderAsync(CardRequest());

        var payload = h.Pushes!.NewOrders.Single();
        var json = System.Text.Json.JsonSerializer.Serialize(payload);

        Assert.Contains(response.OrderNumber, json);
        Assert.Contains("total", json);
        Assert.Contains("estimatedReadyTime", json);
    }

    [Fact]
    public async Task A_cash_order_is_pushed_too()
    {
        // Cash orders skip the payment gateway entirely, so they travel a
        // different path through CreateOrderAsync. They are the most important
        // ones to push, since nothing else tells the counter about them.
        var h = CreateHarness(PaymentMethod.Cash);

        await h.Service.CreateOrderAsync(CashRequest());

        Assert.Single(h.Pushes!.NewOrders);
    }

    [Fact]
    public async Task A_failing_push_does_not_lose_the_order()
    {
        // The customer has already committed by this point. A notification
        // problem must degrade to "the kitchen finds out on refresh", never to
        // "the order failed".
        var h = CreateHarness(notifier: new ThrowingOrderNotifier());

        var response = await h.Service.CreateOrderAsync(CardRequest());

        Assert.StartsWith("AT-", response.OrderNumber);
        // The order was created and returned to the customer normally — proof the
        // failing push did not roll it back or throw.
        Assert.Equal(response.OrderNumber, h.Orders.OrderToReturn.OrderNumber);
        // Nothing was pushed, because pushing is what failed.
        Assert.Null(h.Pushes);
    }

    private sealed class ThrowingOrderNotifier : IOrderNotifier
    {
        public Task BroadcastNewOrderAsync(object orderData)
            => throw new InvalidOperationException("dashboard push unavailable");

        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null)
            => Task.CompletedTask;

        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }
}
