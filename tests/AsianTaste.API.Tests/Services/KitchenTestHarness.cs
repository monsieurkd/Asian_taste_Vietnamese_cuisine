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
/// The collaborators the kitchen suites share: a repository that behaves like the real one
/// where it matters, a queue that records what would be sent, and the harness that wires
/// them into an <see cref="OrderService"/>.
/// </summary>
/// <remarks>
/// Extracted so the kitchen's tests can be split by SUBJECT rather than kept in one file
/// that outgrew the repository's single-file review limit. The split is by subject, not by
/// convenience: <c>KitchenWorkflowTests</c> covers a dish's own states and the log,
/// <c>KitchenTicketTests</c> covers the ticket-level acts (a note, a hold) and the board's
/// counts. The two share these fakes, and duplicating them would mean two versions of
/// "what the real repository does" — which is the drift this file exists to prevent.
/// </remarks>
internal static class KitchenTestHarness
{
    // ── Collaborators ────────────────────────────────────────────────────────

    internal sealed class FakeOrderRepository : IOrderRepository
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

        internal sealed record ActivityWrite(int OrderId, int? OrderItemId, string Kind, string Detail, string? Actor, string? StatusAtEvent);

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

        /// <summary>The promised times written, so a test can prove the time moved.</summary>
        public List<DateTime> RequestedTimeWrites { get; } = new();

        public Task<bool> SetOrderRequestedTimeAsync(int orderId, DateTime requestedTime, CancellationToken cancellationToken = default)
        {
            Order.RequestedTime = requestedTime;
            RequestedTimeWrites.Add(requestedTime);
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

    internal sealed class RecordingEmailQueue : IOrderEmailQueue
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
        public Task<List<MenuItemDetailDto>> GetCounterMenuAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }

    private sealed class StubNotifier : IOrderNotifier
    {
        public Task BroadcastNewOrderAsync(object orderData) => Task.CompletedTask;
        public Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null) => Task.CompletedTask;
        public Task BroadcastDashboardUpdateAsync(object statsData) => Task.CompletedTask;
    }

    // ── Harness ──────────────────────────────────────────────────────────────

    internal sealed record Harness(OrderService Service, FakeOrderRepository Orders, RecordingEmailQueue Emails);

    internal static Harness CreateHarness(
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
}
