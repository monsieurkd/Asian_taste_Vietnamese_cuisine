using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.WebSockets;
using Microsoft.Extensions.Logging;

namespace AsianTaste.API.Services.Webhooks;

/// <summary>
/// Lightspeed K-Series webhook service implementation.
/// Processes webhooks from Lightspeed POS for payment confirmations and order updates.
/// </summary>
public class LightspeedWebhookService : IWebhookService
{
    private readonly ILogger<LightspeedWebhookService> _logger;
    private readonly IConfiguration _config;
    private readonly IWebhookEventLogRepository _webhookLogRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly OrderWebSocketHandler _webSocketHandler;

    public LightspeedWebhookService(
        ILogger<LightspeedWebhookService> logger,
        IConfiguration config,
        IWebhookEventLogRepository webhookLogRepository,
        IOrderRepository orderRepository,
        OrderWebSocketHandler webSocketHandler)
    {
        _logger = logger;
        _config = config;
        _webhookLogRepository = webhookLogRepository;
        _orderRepository = orderRepository;
        _webSocketHandler = webSocketHandler;
    }

    public async Task<WebhookProcessingResult> ProcessWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        WebhookEventLog? eventLog = null;

        try
        {
            // Parse the payload to get event ID
            var eventData = JsonSerializer.Deserialize<LightspeedWebhookEvent>(payload);
            if (eventData == null || string.IsNullOrEmpty(eventData.EventId))
            {
                _logger.LogWarning("Webhook received without valid event ID");
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid webhook payload: missing event ID",
                    StatusCode = System.Net.HttpStatusCode.BadRequest
                };
            }

            // Check for idempotency - has this event already been processed?
            if (await _webhookLogRepository.HasEventBeenProcessedAsync(eventData.EventId, cancellationToken))
            {
                _logger.LogInformation("Webhook event {EventId} already processed, skipping", eventData.EventId);
                return new WebhookProcessingResult
                {
                    Success = true,
                    StatusCode = System.Net.HttpStatusCode.OK
                };
            }

            // Verify signature
            if (!VerifySignature(payload, signature))
            {
                _logger.LogWarning("Webhook signature verification failed for event {EventId}", eventData.EventId);

                // Log the failed verification attempt
                eventLog = new WebhookEventLog
                {
                    EventId = eventData.EventId,
                    EventType = eventData.EventType,
                    Payload = payload,
                    Signature = signature,
                    ProcessingSuccess = false,
                    ErrorMessage = "Invalid signature",
                    ReceivedAt = DateTime.UtcNow
                };
                await _webhookLogRepository.LogEventAsync(eventLog, cancellationToken);
                await _webhookLogRepository.MarkEventProcessedAsync(eventLog.Id, false, "Invalid signature", cancellationToken: cancellationToken);

                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid signature",
                    StatusCode = System.Net.HttpStatusCode.Unauthorized
                };
            }

            // Log the incoming event
            eventLog = new WebhookEventLog
            {
                EventId = eventData.EventId,
                EventType = eventData.EventType,
                Payload = payload.Length > 10000 ? payload.Substring(0, 10000) + "..." : payload, // Truncate large payloads
                Signature = signature,
                ProcessingSuccess = false,
                ReceivedAt = DateTime.UtcNow
            };
            eventLog = await _webhookLogRepository.LogEventAsync(eventLog, cancellationToken);

            _logger.LogInformation("Processing webhook event: {EventType} (EventId: {EventId})", eventData.EventType, eventData.EventId);

            // Route to appropriate handler based on event type
            WebhookProcessingResult result;
            try
            {
                result = eventData.EventType.ToLowerInvariant() switch
                {
                    "payment.completed" => await HandlePaymentCompletedAsync(eventData, eventLog, cancellationToken),
                    "payment.failed" => await HandlePaymentFailedAsync(eventData, eventLog, cancellationToken),
                    "payment.refunded" => await HandlePaymentRefundedAsync(eventData, eventLog, cancellationToken),
                    "order.updated" => await HandleOrderUpdatedAsync(eventData, eventLog, cancellationToken),
                    "order.completed" => await HandleOrderCompletedAsync(eventData, eventLog, cancellationToken),
                    "product.updated" => await HandleProductUpdatedAsync(eventData, eventLog, cancellationToken),
                    _ => new WebhookProcessingResult { Success = true, StatusCode = System.Net.HttpStatusCode.OK } // Unknown events are OK
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling webhook event {EventType}", eventData.EventType);
                result = new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = $"Handler error: {ex.Message}",
                    StatusCode = System.Net.HttpStatusCode.InternalServerError
                };
            }

            // Mark event as processed
            await _webhookLogRepository.MarkEventProcessedAsync(
                eventLog.Id,
                result.Success,
                result.ErrorMessage,
                eventLog.RelatedOrderId,
                cancellationToken);

            stopwatch.Stop();
            _logger.LogInformation("Webhook {EventType} processed in {ElapsedMs}ms: {Success}",
                eventData.EventType, stopwatch.ElapsedMilliseconds, result.Success);

            return result;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse webhook payload");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = "Invalid JSON payload",
                StatusCode = System.Net.HttpStatusCode.BadRequest
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error processing webhook");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = "Internal processing error",
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    public bool VerifySignature(string payload, string signature)
    {
        var secret = _config["Lightspeed:WebhookSecret"];
        if (string.IsNullOrEmpty(secret))
        {
            _logger.LogWarning("Webhook secret not configured - signature verification skipped");
            // In production, you might want to return false here
            // For development, we can allow unverified webhooks
            return true;
        }

        var computedSignature = ComputeHmacSha256(payload, secret);
        var signatureMatch = signature.Equals(computedSignature, StringComparison.OrdinalIgnoreCase);

        if (!signatureMatch)
        {
            _logger.LogWarning("Signature mismatch: expected {Expected}, got {Received}",
                computedSignature, signature);
        }

        return signatureMatch;
    }

    public Task<WebhookProcessingResult> HandlePaymentCompletedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default)
    {
        // This is a simplified interface method - actual handling is done in HandlePaymentCompletedAsync
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    public Task<WebhookProcessingResult> HandlePaymentFailedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    public Task<WebhookProcessingResult> HandlePaymentRefundedEventAsync(PaymentWebhookData data, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    public Task<WebhookProcessingResult> HandleOrderUpdatedEventAsync(OrderWebhookData data, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    public Task<WebhookProcessingResult> HandleOrderCompletedEventAsync(OrderWebhookData data, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    public Task<WebhookProcessingResult> HandleProductUpdatedEventAsync(ProductWebhookData data, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    #region Private Handlers

    private async Task<WebhookProcessingResult> HandlePaymentCompletedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            // Extract payment data from the event
            var paymentData = ExtractPaymentData(eventData);
            if (paymentData == null)
            {
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Could not extract payment data"
                };
            }

            // Find the order by external payment ID or order ID
            var order = await FindOrderByPaymentInfo(paymentData, cancellationToken);
            if (order == null)
            {
                _logger.LogWarning("No order found for payment webhook: {PaymentId}", paymentData.PaymentId);
                // Not necessarily an error - order might not exist in our system yet
                return new WebhookProcessingResult { Success = true };
            }

            // Update order payment status
            if (order.PaymentStatus != PaymentStatus.Succeeded)
            {
                order.PaymentStatus = PaymentStatus.Succeeded;
                order.PaidAmount = paymentData.Amount;
                order.PaidAt = DateTime.UtcNow;
                order.ExternalPaymentId = paymentData.PaymentId;
                order.ExternalTransactionId = paymentData.TransactionId;
                order.Status = OrderStatus.Confirmed;

                await _orderRepository.UpdateOrderAsync(order, cancellationToken);
                eventLog.RelatedOrderId = order.Id;

                // Notify via WebSocket
                await _webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "payment_completed", null);

                _logger.LogInformation("Updated order {OrderId} payment status to Succeeded", order.Id);
            }

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing payment.completed webhook");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    private async Task<WebhookProcessingResult> HandlePaymentFailedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            var paymentData = ExtractPaymentData(eventData);
            if (paymentData == null)
            {
                return new WebhookProcessingResult { Success = false, ErrorMessage = "Could not extract payment data" };
            }

            var order = await FindOrderByPaymentInfo(paymentData, cancellationToken);
            if (order == null)
            {
                return new WebhookProcessingResult { Success = true };
            }

            // Update order to show payment failed
            order.PaymentStatus = PaymentStatus.Failed;
            order.PaymentFailureReason = "Payment declined or failed";
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);
            eventLog.RelatedOrderId = order.Id;

            await _webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "payment_failed", null);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing payment.failed webhook");
            return new WebhookProcessingResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private async Task<WebhookProcessingResult> HandlePaymentRefundedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            var paymentData = ExtractPaymentData(eventData);
            if (paymentData == null)
            {
                return new WebhookProcessingResult { Success = false, ErrorMessage = "Could not extract payment data" };
            }

            var order = await FindOrderByPaymentInfo(paymentData, cancellationToken);
            if (order == null)
            {
                return new WebhookProcessingResult { Success = true };
            }

            // Update order to show refunded
            order.PaymentStatus = PaymentStatus.Refunded;
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);
            eventLog.RelatedOrderId = order.Id;

            await _webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "payment_refunded", null);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing payment.refunded webhook");
            return new WebhookProcessingResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private async Task<WebhookProcessingResult> HandleOrderUpdatedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            var orderData = ExtractOrderData(eventData);
            if (orderData == null)
            {
                return new WebhookProcessingResult { Success = false, ErrorMessage = "Could not extract order data" };
            }

            // Find order by Lightspeed order ID
            var order = await _orderRepository.GetOrderByLightspeedIdAsync(orderData.LightspeedOrderId.ToString(), cancellationToken);
            if (order == null)
            {
                _logger.LogWarning("No local order found for Lightspeed order {LsOrderId}", orderData.LightspeedOrderId);
                return new WebhookProcessingResult { Success = true };
            }

            // Map Lightspeed status to our OrderStatus
            var newStatus = MapLightspeedStatus(orderData.Status);
            if (newStatus != order.Status)
            {
                var oldStatus = order.Status;
                order.Status = newStatus;
                await _orderRepository.UpdateOrderAsync(order, cancellationToken);
                eventLog.RelatedOrderId = order.Id;

                await _webSocketHandler.BroadcastStatusUpdateAsync(order.Id, newStatus.ToString(), $"Status changed from {oldStatus} to {newStatus}");

                _logger.LogInformation("Updated order {OrderId} status from {OldStatus} to {NewStatus}", order.Id, oldStatus, newStatus);
            }

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing order.updated webhook");
            return new WebhookProcessingResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private async Task<WebhookProcessingResult> HandleOrderCompletedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            var orderData = ExtractOrderData(eventData);
            if (orderData == null)
            {
                return new WebhookProcessingResult { Success = false, ErrorMessage = "Could not extract order data" };
            }

            var order = await _orderRepository.GetOrderByLightspeedIdAsync(orderData.LightspeedOrderId.ToString(), cancellationToken);
            if (order == null)
            {
                return new WebhookProcessingResult { Success = true };
            }

            order.Status = OrderStatus.Completed;
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);
            eventLog.RelatedOrderId = order.Id;

            await _webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "Completed", null);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing order.completed webhook");
            return new WebhookProcessingResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private async Task<WebhookProcessingResult> HandleProductUpdatedAsync(LightspeedWebhookEvent eventData, WebhookEventLog eventLog, CancellationToken cancellationToken)
    {
        try
        {
            // Extract product data
            if (!eventData.Data.TryGetValue("product_id", out var productIdObj) ||
                !int.TryParse(productIdObj.ToString(), out var lightspeedProductId))
            {
                return new WebhookProcessingResult { Success = true }; // Don't fail for malformed product updates
            }

            var isAvailable = eventData.Data.TryGetValue("is_available", out var availableObj) &&
                              bool.TryParse(availableObj.ToString(), out var available) && available;

            _logger.LogInformation("Product {ProductId} availability updated to {Available}", lightspeedProductId, isAvailable);

            // TODO: Update product availability in local database
            // This would require a product repository method to update by Lightspeed ID

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing product.updated webhook");
            return new WebhookProcessingResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    #endregion

    #region Helper Methods

    private string ComputeHmacSha256(string payload, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);

        using var hmac = new HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(payloadBytes);

        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }

    private PaymentWebhookData? ExtractPaymentData(LightspeedWebhookEvent eventData)
    {
        if (!eventData.Data.TryGetValue("payment_id", out var paymentIdObj) ||
            !eventData.Data.TryGetValue("order_id", out var orderIdObj))
        {
            return null;
        }

        var amount = eventData.Data.TryGetValue("amount", out var amountObj) ? Convert.ToDecimal(amountObj) : 0m;

        var transactionId = eventData.Data.TryGetValue("transaction_id", out var txnIdObj)
            ? txnIdObj.ToString()
            : null;

        var currency = eventData.Data.TryGetValue("currency", out var currencyObj)
            ? currencyObj.ToString()
            : null;

        return new PaymentWebhookData
        {
            PaymentId = paymentIdObj.ToString() ?? string.Empty,
            OrderId = orderIdObj.ToString() ?? string.Empty,
            Amount = amount,
            Status = eventData.EventType,
            ProcessedAt = eventData.Timestamp,
            TransactionId = transactionId,
            Currency = currency
        };
    }

    private OrderWebhookData? ExtractOrderData(LightspeedWebhookEvent eventData)
    {
        if (!eventData.Data.TryGetValue("order_id", out var orderIdObj) ||
            !int.TryParse(orderIdObj.ToString(), out var lightspeedOrderId))
        {
            return null;
        }

        var status = eventData.Data.TryGetValue("status", out var statusObj) ? statusObj.ToString() : "unknown";

        return new OrderWebhookData
        {
            LightspeedOrderId = lightspeedOrderId,
            Status = status ?? "unknown",
            UpdatedAt = eventData.Timestamp
        };
    }

    private async Task<Order?> FindOrderByPaymentInfo(PaymentWebhookData paymentData, CancellationToken cancellationToken)
    {
        // Try to find order by external payment ID
        if (!string.IsNullOrEmpty(paymentData.PaymentId))
        {
            var order = await _orderRepository.GetOrderByExternalPaymentIdAsync(paymentData.PaymentId, cancellationToken);
            if (order != null) return order;
        }

        // Try to find order by order ID (if it's an integer)
        if (int.TryParse(paymentData.OrderId, out var orderId))
        {
            return await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        }

        return null;
    }

    private OrderStatus MapLightspeedStatus(string? lightspeedStatus)
    {
        return lightspeedStatus?.ToLowerInvariant() switch
        {
            "layby" => OrderStatus.Pending,
            "confirmed" => OrderStatus.Confirmed,
            "in_progress" => OrderStatus.Preparing,
            "ready" => OrderStatus.Ready,
            "completed" => OrderStatus.Completed,
            "cancelled" or "canceled" => OrderStatus.Cancelled,
            _ => OrderStatus.Pending
        };
    }

    #endregion
}
