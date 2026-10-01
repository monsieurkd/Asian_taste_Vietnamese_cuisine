using System.Security.Cryptography;
using System.Text;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Webhooks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace AsianTaste.API.Tests.Services.Webhooks;

/// <summary>
/// Tests for Stripe webhook handling.
///
/// Handler logic is exercised through DispatchEventAsync with a constructed
/// Stripe.Event, because the Stripe SDK's EventConverter cannot deserialize
/// hand-written event JSON (it expects an exact SDK-shaped payload). Signature
/// verification is tested separately via VerifySignature / ProcessWebhookAsync.
/// </summary>
public class StripeWebhookServiceTests
{
    private const string WebhookSecret = "whsec_test_secret_for_unit_tests";

    private static StripeWebhookService CreateService(
        IOrderRepository? orderRepo = null,
        IOrderEmailQueue? emailQueue = null,
        string? secret = WebhookSecret)
    {
        var settings = new Dictionary<string, string?>();
        if (secret is not null)
        {
            settings["Stripe:WebhookSecret"] = secret;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        return new StripeWebhookService(
            orderRepo ?? new StubOrderRepository(),
            configuration,
            NullLogger<StripeWebhookService>.Instance,
            emailQueue ?? new OrderEmailQueue());
    }

    private static Stripe.Event BuildStripeEvent(string type, int orderId, string status = "succeeded")
    {
        var paymentIntent = new Stripe.PaymentIntent
        {
            Id = "pi_test_1",
            Status = status,
            Metadata = new Dictionary<string, string> { ["order_id"] = orderId.ToString() },
        };

        return new Stripe.Event
        {
            Id = "evt_test_1",
            Type = type,
            Data = new Stripe.EventData
            {
                Object = paymentIntent,
            },
        };
    }

    private static string Sign(string payload, string secret, long timestamp)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{timestamp}.{payload}"));
        return $"t={timestamp},v1={Convert.ToHexString(hash).ToLowerInvariant()}";
    }

    // ---------- Signature verification ----------

    [Fact]
    public async Task ProcessWebhook_With_Invalid_Signature_Returns_Unauthorized_And_Touches_Nothing()
    {
        var repo = new StubOrderRepository();
        var service = CreateService(repo);

        var result = await service.ProcessWebhookAsync("{}", "t=123,v1=deadbeef");

        Assert.False(result.Success);
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, result.StatusCode);
        Assert.Null(repo.LastStatus);
    }

    [Fact]
    public async Task ProcessWebhook_Without_Configured_Secret_Fails_Safely()
    {
        var repo = new StubOrderRepository();
        var service = CreateService(repo, secret: null);

        var result = await service.ProcessWebhookAsync("{}", "t=123,v1=abc");

        Assert.False(result.Success);
        Assert.Equal(System.Net.HttpStatusCode.InternalServerError, result.StatusCode);
        Assert.Null(repo.LastStatus);
    }

    [Fact]
    public void VerifySignature_Returns_False_When_Secret_Not_Configured()
    {
        var service = CreateService(secret: null);

        Assert.False(service.VerifySignature("{}", "t=1,v1=abc"));
    }

    [Fact]
    public void VerifySignature_Returns_False_For_Tampered_Payload()
    {
        var service = CreateService();
        var payload = """{"id":"evt_1"}""";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = Sign(payload, WebhookSecret, timestamp);

        // A valid signature must not validate a different payload.
        Assert.False(service.VerifySignature(payload + " ", signature));
    }

    // ---------- Handler logic ----------

    [Fact]
    public async Task PaymentIntentSucceeded_Confirms_Order_And_Queues_Email()
    {
        var repo = new StubOrderRepository
        {
            Order = new Order
            {
                Id = 7,
                OrderNumber = "AT-010100-0007",
                CustomerName = "Test Customer",
                CustomerEmail = "customer@example.com",
                EmailConfirmationSent = false,
                Status = OrderStatus.Pending,
            },
        };
        var queue = new OrderEmailQueue();
        var service = CreateService(repo, queue);

        var result = await service.DispatchEventAsync(
            BuildStripeEvent("payment_intent.succeeded", orderId: 7));

        Assert.True(result.Success);
        Assert.Equal(7, repo.LastStatusOrderId);
        Assert.Equal(OrderStatus.Confirmed, repo.LastStatus);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var job in queue.ReadAllAsync(cts.Token))
        {
            var confirmation = Assert.IsType<OrderConfirmationEmailWork>(job);
            Assert.Equal(7, confirmation.Job.OrderId);
            Assert.Equal("customer@example.com", confirmation.Job.ToEmail);
            return;
        }

        Assert.Fail("Expected a confirmation email to be queued after payment success");
    }

    [Fact]
    public async Task PaymentIntentSucceeded_Does_Not_Requeue_When_Email_Already_Sent()
    {
        // Stripe retries webhooks, so the confirmation email must be idempotent.
        var repo = new StubOrderRepository
        {
            Order = new Order
            {
                Id = 7,
                OrderNumber = "AT-010100-0007",
                CustomerEmail = "customer@example.com",
                EmailConfirmationSent = true,
                Status = OrderStatus.Confirmed,
            },
        };
        var queue = new OrderEmailQueue();
        var service = CreateService(repo, queue);

        var result = await service.DispatchEventAsync(
            BuildStripeEvent("payment_intent.succeeded", orderId: 7));

        Assert.True(result.Success);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        var queued = new List<OrderEmailJob>();
        try
        {
            await foreach (var job in queue.ReadAllAsync(cts.Token))
            {
                queued.Add(job);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected: nothing was queued.
        }

        Assert.Empty(queued);
    }

    [Fact]
    public async Task PaymentIntentFailed_Cancels_Order_And_Does_Not_Email()
    {
        var repo = new StubOrderRepository
        {
            Order = new Order { Id = 7, OrderNumber = "AT-010100-0007", EmailConfirmationSent = false },
        };
        var queue = new OrderEmailQueue();
        var service = CreateService(repo, queue);

        var result = await service.DispatchEventAsync(
            BuildStripeEvent("payment_intent.payment_failed", orderId: 7, status: "requires_payment_method"));

        Assert.True(result.Success);
        Assert.Equal(OrderStatus.Cancelled, repo.LastStatus);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        var queued = new List<OrderEmailJob>();
        try
        {
            await foreach (var job in queue.ReadAllAsync(cts.Token))
            {
                queued.Add(job);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected.
        }

        Assert.Empty(queued);
    }

    [Fact]
    public async Task PaymentIntentCanceled_Cancels_Order()
    {
        var repo = new StubOrderRepository();
        var service = CreateService(repo);

        var result = await service.DispatchEventAsync(
            BuildStripeEvent("payment_intent.canceled", orderId: 11, status: "canceled"));

        Assert.True(result.Success);
        Assert.Equal(11, repo.LastStatusOrderId);
        Assert.Equal(OrderStatus.Cancelled, repo.LastStatus);
    }

    [Fact]
    public async Task Missing_OrderId_In_Metadata_Does_Not_Confirm_Anything()
    {
        var repo = new StubOrderRepository();
        var service = CreateService(repo);

        var paymentIntent = new Stripe.PaymentIntent
        {
            Id = "pi_no_metadata",
            Metadata = new Dictionary<string, string>(),
        };
        var stripeEvent = new Stripe.Event
        {
            Id = "evt_x",
            Type = "payment_intent.succeeded",
            Data = new Stripe.EventData { Object = paymentIntent },
        };

        var result = await service.DispatchEventAsync(stripeEvent);

        Assert.False(result.Success);
        Assert.Null(repo.LastStatus);
    }

    [Fact]
    public async Task Unhandled_Event_Type_Is_Acknowledged_Without_Action()
    {
        var repo = new StubOrderRepository();
        var service = CreateService(repo);

        var stripeEvent = new Stripe.Event { Id = "evt_x", Type = "customer.created" };

        var result = await service.DispatchEventAsync(stripeEvent);

        Assert.True(result.Success);
        Assert.Null(repo.LastStatus);
    }

    // ── charge.refunded → the order must stop reading as paid ────────────────
    //
    // This is the authoritative refund path: a refund made in the Stripe dashboard
    // arrives here and nowhere else. Before these tests, the handler logged the
    // refund and changed nothing, so a refunded order kept showing as paid and the
    // day's takings stayed overstated by the refunded amount.

    /// <summary>
    /// Builds a charge.refunded event. Refunds carry a Charge (with a PaymentIntent id),
    /// not a PaymentIntent, so it cannot use <see cref="BuildStripeEvent"/>.
    /// </summary>
    private static Stripe.Event BuildRefundedChargeEvent(
        string paymentIntentId = "pi_test_1",
        long amountRefundedCents = 2500,
        string? chargeId = "ch_test_1")
    {
        var charge = new Stripe.Charge
        {
            Id = chargeId!,
            PaymentIntentId = paymentIntentId,
            AmountRefunded = amountRefundedCents,
        };

        return new Stripe.Event
        {
            Id = "evt_refund_1",
            Type = "charge.refunded",
            Data = new Stripe.EventData { Object = charge },
        };
    }

    private static Order OrderWithPayment(string paymentIntentId, decimal total, decimal? paid)
    {
        return new Order
        {
            Id = 1,
            OrderNumber = "AT-20260312-0001",
            Total = total,
            PaidAmount = paid,
            PaymentIntentId = paymentIntentId,
            PaymentStatus = PaymentStatus.Succeeded,
        };
    }

    [Fact]
    public async Task ChargeRefunded_Marks_The_Order_Fully_Refunded()
    {
        var repo = new StubOrderRepository
        {
            OrderByPaymentIntent = OrderWithPayment("pi_test_1", total: 25.00m, paid: 25.00m),
        };
        var service = CreateService(repo);

        var result = await service.DispatchEventAsync(BuildRefundedChargeEvent(amountRefundedCents: 2500));

        Assert.True(result.Success);
        Assert.NotNull(repo.UpdatedOrder);
        Assert.Equal(PaymentStatus.Refunded, repo.UpdatedOrder!.PaymentStatus);
    }

    [Fact]
    public async Task ChargeRefunded_Marks_A_Partial_Refund_As_Partial()
    {
        // Refunding less than was paid must NOT read as a full refund, or the day's
        // numbers swing too far the other way.
        var repo = new StubOrderRepository
        {
            OrderByPaymentIntent = OrderWithPayment("pi_test_1", total: 25.00m, paid: 25.00m),
        };
        var service = CreateService(repo);

        var result = await service.DispatchEventAsync(BuildRefundedChargeEvent(amountRefundedCents: 1000));

        Assert.True(result.Success);
        Assert.Equal(PaymentStatus.PartiallyRefunded, repo.UpdatedOrder!.PaymentStatus);
    }

    [Fact]
    public async Task ChargeRefunded_Looks_The_Order_Up_By_PaymentIntent()
    {
        // The linkage that actually exists. `external_payment_id` is never written, so
        // resolving through it would match nothing and the refund would be lost silently.
        var repo = new StubOrderRepository
        {
            OrderByPaymentIntent = OrderWithPayment("pi_lookup_me", total: 10.00m, paid: 10.00m),
        };
        var service = CreateService(repo);

        await service.DispatchEventAsync(BuildRefundedChargeEvent(paymentIntentId: "pi_lookup_me"));

        Assert.Equal("pi_lookup_me", repo.LastPaymentIntentLookup);
    }

    [Fact]
    public async Task ChargeRefunded_Falls_Back_To_The_Order_Total_When_PaidAmount_Is_Missing()
    {
        // Orders captured before paid_amount was populated must still be judged: the
        // order total is the best available evidence of what was captured.
        var repo = new StubOrderRepository
        {
            OrderByPaymentIntent = OrderWithPayment("pi_test_1", total: 25.00m, paid: null),
        };
        var service = CreateService(repo);

        await service.DispatchEventAsync(BuildRefundedChargeEvent(amountRefundedCents: 2500));

        Assert.Equal(PaymentStatus.Refunded, repo.UpdatedOrder!.PaymentStatus);
    }

    [Fact]
    public async Task ChargeRefunded_With_No_Matching_Order_Still_Acknowledges_The_Event()
    {
        // A refund for an order this app does not know about must not make Stripe retry
        // forever. The event was handled; there was simply nothing local to update.
        var repo = new StubOrderRepository { OrderByPaymentIntent = null };
        var service = CreateService(repo);

        var result = await service.DispatchEventAsync(BuildRefundedChargeEvent());

        Assert.True(result.Success);
        Assert.Null(repo.UpdatedOrder);
    }

    [Fact]
    public async Task ChargeRefunded_With_No_PaymentIntent_Id_Still_Acknowledges_The_Event()
    {
        // A charge with no PaymentIntent cannot be traced to an order. That must be
        // survivable, not an exception that pages someone.
        var repo = new StubOrderRepository();
        var service = CreateService(repo);

        var result = await service.DispatchEventAsync(
            BuildRefundedChargeEvent(paymentIntentId: string.Empty));

        Assert.True(result.Success);
        Assert.Null(repo.UpdatedOrder);
    }

    [Fact]
    public async Task ChargeRefunded_Survives_A_Repository_Failure()
    {
        // The money has already moved. A bookkeeping failure must not surface as a
        // webhook failure, because Stripe would retry something a retry cannot fix.
        var service = CreateService(new ThrowingOrderRepository());

        var result = await service.DispatchEventAsync(BuildRefundedChargeEvent());

        Assert.True(result.Success);
    }

    /// <summary>
    /// A repository whose refund lookup fails, to prove a bookkeeping error cannot turn a
    /// delivered webhook into a Stripe retry loop.
    /// </summary>
    private sealed class ThrowingOrderRepository : IOrderRepository
    {
        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("database unavailable");

        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(int orderId, IReadOnlyList<OrderLineWrite> lines, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Order> CreateOrderAsync(Models.DTOs.CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<Models.DTOs.AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Models.DTOs.AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Models.DTOs.DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class StubOrderRepository : IOrderRepository
    {
        public Order? Order { get; set; }
        public int? LastStatusOrderId { get; private set; }
        public OrderStatus? LastStatus { get; private set; }

        public Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(int orderId, IReadOnlyList<OrderLineWrite> lines, CancellationToken cancellationToken = default) => throw new NotImplementedException();

        /// <summary>The order returned by a PaymentIntent lookup — set to exercise refunds.</summary>
        public Order? OrderByPaymentIntent { get; set; }

        /// <summary>The order written by the most recent <see cref="UpdateOrderAsync"/>.</summary>
        public Order? UpdatedOrder { get; private set; }

        public string? LastPaymentIntentLookup { get; private set; }

        public Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Order);

        public Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default)
        {
            LastPaymentIntentLookup = paymentIntentId;
            return Task.FromResult(OrderByPaymentIntent);
        }

        public Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default)
        {
            UpdatedOrder = order;
            return Task.CompletedTask;
        }

        public Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default)
        {
            LastStatusOrderId = orderId;
            LastStatus = status;
            return Task.CompletedTask;
        }

        public Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new List<OrderItem>());

        public Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        // --- Unused members for these tests ---
        public Task<Order> CreateOrderAsync(Models.DTOs.CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<Models.DTOs.AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(int orderId, int orderItemId, bool isCompleted, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Models.DTOs.AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Models.DTOs.DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }
}
