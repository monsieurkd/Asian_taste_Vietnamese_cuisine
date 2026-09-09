using System.Text;
using AsianTaste.API.Services.Payment.Interfaces;

namespace AsianTaste.API.Services.Payment;

/// <summary>
/// MOCK payment gateway for testing WITHOUT real Lightspeed credentials.
/// This simulates successful payments locally.
/// Enable by setting "Payment:UseMockGateway" = "true" in appsettings.json
/// </summary>
public class MockPaymentGateway : IPaymentGatewayService
{
    private readonly ILogger<MockPaymentGateway> _logger;
    private readonly IConfiguration _config;

    // Store mock payments in static memory so they persist across requests
    private static readonly Dictionary<string, MockPaymentData> _mockPayments = new();
    private static readonly object _lock = new();

    private class MockPaymentData
    {
        public string OrderId { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public PaymentStatus Status { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string? CapturedId { get; set; }
    }

    public MockPaymentGateway(
        ILogger<MockPaymentGateway> logger,
        IConfiguration config)
    {
        _logger = logger;
        _config = config;

        _logger.LogInformation("Mock Payment Gateway initialized - NO REAL PAYMENTS WILL BE PROCESSED");
    }

    public async Task<PaymentInitiationResult> InitiatePaymentAsync(
        PaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        await Task.Delay(100, cancellationToken); // Simulate network delay

        var mockPaymentId = $"MOCK_{Guid.NewGuid():N}";
        var isCard = request.PaymentMethodType == PaymentMethodType.Card;

        _logger.LogInformation("Mock payment initiation: Order={OrderId}, Method={Method}, Amount={Amount}, PaymentId={PaymentId}",
            request.OrderId, request.PaymentMethodType, request.Amount, mockPaymentId);

        // Log the dictionary state BEFORE storing
        _logger.LogInformation("[BEFORE STORE] Dictionary instance: {InstanceId}, Count: {Count}",
            GetHashCode(), _mockPayments.Count);

        // Store mock payment data
        lock (_lock)
        {
            _mockPayments[mockPaymentId] = new MockPaymentData
            {
                OrderId = request.OrderId,
                Amount = request.Amount,
                Status = PaymentStatus.Processing,
                CreatedAt = DateTime.UtcNow
            };
            _logger.LogInformation("[AFTER STORE] Stored payment {PaymentId}, Dictionary instance: {InstanceId}, Count: {Count}, Keys: {Keys}",
                mockPaymentId, GetHashCode(), _mockPayments.Count, string.Join(", ", _mockPayments.Keys));
        }

        // Simulate immediate success for demo
        return new PaymentInitiationResult
        {
            Success = true,
            PaymentId = mockPaymentId,
            ClientSecret = isCard ? "mock_secret_" + Guid.NewGuid().ToString("N")[..8] : null,
            PaymentStatus = PaymentStatus.Processing,
            RequiresAction = false,
            ErrorMessage = null
        };
    }

    public async Task<PaymentCaptureResult> CapturePaymentAsync(
        string paymentId,
        decimal amount,
        CancellationToken cancellationToken = default)
    {
        await Task.Delay(50, cancellationToken);

        _logger.LogInformation("Mock payment capture: PaymentId={PaymentId}, Amount={Amount}",
            paymentId, amount);

        // Handle cash payments (starts with CASH_)
        if (paymentId.StartsWith("CASH_"))
        {
            return new PaymentCaptureResult
            {
                Success = true,
                CaptureId = $"CAPTURE_{paymentId}",
                Amount = amount,
                ErrorMessage = null
            };
        }

        lock (_lock)
        {
            _logger.LogInformation("[CAPTURE] Looking up payment {PaymentId}, Dictionary instance: {InstanceId}, Count: {Count}, Keys: {Keys}",
                paymentId, GetHashCode(), _mockPayments.Count, string.Join(", ", _mockPayments.Keys));

            if (_mockPayments.TryGetValue(paymentId, out var payment))
            {
                payment.Status = PaymentStatus.Succeeded;
                payment.CompletedAt = DateTime.UtcNow;
                payment.CapturedId = $"CAPTURE_MOCK_{Guid.NewGuid():N}";

                return new PaymentCaptureResult
                {
                    Success = true,
                    CaptureId = payment.CapturedId,
                    Amount = amount,
                    ErrorMessage = null
                };
            }
        }

        return new PaymentCaptureResult
        {
            Success = false,
            CaptureId = string.Empty,
            ErrorMessage = "Payment not found"
        };
    }

    public async Task<PaymentAuthorizationResult> AuthorizePaymentAsync(
        PaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        await Task.Delay(100, cancellationToken);

        var mockAuthId = $"MOCK_AUTH_{Guid.NewGuid():N}";

        _logger.LogInformation("Mock payment authorization: Order={OrderId}, Amount={Amount}",
            request.OrderId, request.Amount);

        return new PaymentAuthorizationResult
        {
            Success = true,
            AuthorizationId = mockAuthId,
            ErrorMessage = null
        };
    }

    public async Task<PaymentRefundResult> RefundPaymentAsync(
        string paymentId,
        decimal? amount = null,
        CancellationToken cancellationToken = default)
    {
        await Task.Delay(100, cancellationToken);

        _logger.LogInformation("Mock refund: PaymentId={PaymentId}, Amount={Amount}",
            paymentId, amount ?? 0);

        // Handle cash payments
        if (paymentId.StartsWith("CASH_"))
        {
            return new PaymentRefundResult
            {
                Success = true,
                RefundId = $"REFUND_CASH_{Guid.NewGuid():N}",
                Amount = amount ?? 0,
                Status = RefundStatus.Succeeded,
                ErrorMessage = null
            };
        }

        if (_mockPayments.TryGetValue(paymentId, out var payment))
        {
            payment.Status = amount.HasValue
                ? PaymentStatus.PartiallyRefunded
                : PaymentStatus.Refunded;

            return new PaymentRefundResult
            {
                Success = true,
                RefundId = $"REFUND_MOCK_{Guid.NewGuid():N}",
                Amount = amount ?? payment.Amount,
                Status = RefundStatus.Succeeded,
                ErrorMessage = null
            };
        }

        return new PaymentRefundResult
        {
            Success = false,
            RefundId = string.Empty,
            Amount = 0,
            Status = RefundStatus.Failed,
            ErrorMessage = "Payment not found"
        };
    }

    public async Task<PaymentStatusResult> GetPaymentStatusAsync(
        string paymentId,
        CancellationToken cancellationToken = default)
    {
        await Task.Delay(50, cancellationToken);

        // Handle cash payments
        if (paymentId.StartsWith("CASH_"))
        {
            return new PaymentStatusResult
            {
                Status = PaymentStatus.Pending,
                ErrorMessage = null
            };
        }

        lock (_lock)
        {
            _logger.LogInformation("[GET STATUS] Looking up payment {PaymentId}, Dictionary instance: {InstanceId}, Count: {Count}, Keys: {Keys}",
                paymentId, GetHashCode(), _mockPayments.Count, string.Join(", ", _mockPayments.Keys));

            if (_mockPayments.TryGetValue(paymentId, out var payment))
            {
                return new PaymentStatusResult
                {
                    Status = payment.Status,
                    PaidAmount = payment.Status == PaymentStatus.Succeeded ? payment.Amount : null,
                    PaidAt = payment.CompletedAt,
                    Currency = "USD",
                    ErrorMessage = null
                };
            }
        }

        return new PaymentStatusResult
        {
            Status = PaymentStatus.Failed,
            ErrorMessage = "Payment not found"
        };
    }

    public bool VerifyWebhookSignature(string payload, string signature, string secret)
    {
        // Mock implementation - always returns true for testing
        _logger.LogDebug("Mock webhook signature verification (always returns true)");
        return true;
    }

    public async Task<WebhookEvent?> ParseWebhookAsync(
        string payload,
        string signature,
        CancellationToken cancellationToken = default)
    {
        await Task.CompletedTask;

        _logger.LogInformation("Mock webhook parsing: {PayloadLength} chars", payload.Length);

        // Return a mock webhook event
        return new WebhookEvent
        {
            EventId = Guid.NewGuid().ToString("N"),
            EventType = "payment.completed",
            Timestamp = DateTime.UtcNow,
            Data = new Dictionary<string, object>
            {
                ["mock"] = true,
                ["payload"] = payload
            }
        };
    }
}
