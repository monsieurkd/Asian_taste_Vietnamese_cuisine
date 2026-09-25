using System.Text.Json;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Email;
using Microsoft.Extensions.Configuration;

namespace AsianTaste.API.Services.Webhooks;

/// <summary>
/// Stripe webhook service for processing payment events.
/// Handles Stripe webhook events and updates order status accordingly.
/// </summary>
public class StripeWebhookService
{
    private readonly IOrderRepository _orderRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<StripeWebhookService> _logger;
    private readonly IOrderEmailQueue _emailQueue;

    public StripeWebhookService(
        IOrderRepository orderRepository,
        IConfiguration configuration,
        ILogger<StripeWebhookService> logger,
        IOrderEmailQueue emailQueue)
    {
        _orderRepository = orderRepository;
        _configuration = configuration;
        _logger = logger;
        _emailQueue = emailQueue;
    }

    /// <inheritdoc />
    public async Task<WebhookProcessingResult> ProcessWebhookAsync(
        string payload,
        string signature,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var webhookSecret = _configuration["Stripe:WebhookSecret"];
            if (string.IsNullOrEmpty(webhookSecret))
            {
                _logger.LogError("Stripe webhook secret not configured");
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Webhook secret not configured",
                    StatusCode = System.Net.HttpStatusCode.InternalServerError
                };
            }

            // Verify signature using Stripe's utility.
            // throwOnApiVersionMismatch: false — the event carries the Stripe
            // account's API version, which may differ from the SDK's default.
            // Without this, legitimate webhooks are rejected as "Invalid signature".
            try
            {
                Stripe.Event stripeEvent = Stripe.EventUtility.ConstructEvent(
                    payload,
                    signature,
                    webhookSecret,
                    throwOnApiVersionMismatch: false
                );

                _logger.LogInformation("Processing Stripe webhook event: {EventType}", stripeEvent.Type);

                // Process based on event type
                return await DispatchEventAsync(stripeEvent, cancellationToken);
            }
            catch (Stripe.StripeException ex)
            {
                // Signature verification failed (bad/missing secret, tampered
                // payload, or a timestamp outside the tolerance window).
                _logger.LogWarning(ex, "Stripe webhook signature verification failed");
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid signature",
                    StatusCode = System.Net.HttpStatusCode.Unauthorized
                };
            }
            catch (Exception ex)
            {
                // Signature was valid but the event could not be processed —
                // do NOT report this as an auth failure, or it will be debugged
                // in the wrong place.
                _logger.LogError(ex, "Stripe webhook passed verification but failed to process");
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Webhook processing failed",
                    StatusCode = System.Net.HttpStatusCode.InternalServerError
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Stripe webhook");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = "Webhook processing failed",
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    /// <inheritdoc />
    public bool VerifySignature(string payload, string signature)
    {
        var webhookSecret = _configuration["Stripe:WebhookSecret"];
        if (string.IsNullOrEmpty(webhookSecret))
        {
            return false;
        }

        try
        {
            Stripe.EventUtility.ConstructEvent(payload, signature, webhookSecret, throwOnApiVersionMismatch: false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Development/test helper: runs the handler logic for a simulated event
    /// without going through Stripe's JSON deserializer. The simulate endpoint is
    /// a local testing tool; the SDK converter is validated separately by real
    /// Stripe traffic.
    /// </summary>
    public Task<WebhookProcessingResult> SimulateEventAsync(
        string eventType,
        string paymentIntentId,
        int orderId,
        string status,
        CancellationToken cancellationToken = default)
    {
        var paymentIntent = new Stripe.PaymentIntent
        {
            Id = paymentIntentId,
            Status = status,
            Metadata = new Dictionary<string, string> { ["order_id"] = orderId.ToString() },
        };

        var stripeEvent = new Stripe.Event
        {
            Id = $"evt_sim_{Guid.NewGuid():N}",
            Type = eventType,
            Data = new Stripe.EventData { Object = paymentIntent },
        };

        return DispatchEventAsync(stripeEvent, cancellationToken);
    }

    /// <summary>
    /// Dispatches an already-verified Stripe event to the appropriate handler.
    /// Exposed for testing so handler logic can be exercised without depending on
    /// the Stripe SDK's JSON deserialization (which rejects hand-written events).
    /// </summary>
    internal Task<WebhookProcessingResult> DispatchEventAsync(
        Stripe.Event stripeEvent,
        CancellationToken cancellationToken = default)
    {
        return stripeEvent.Type.ToLowerInvariant() switch
        {
            "payment_intent.succeeded" => HandlePaymentIntentSucceededAsync(stripeEvent, cancellationToken),
            "payment_intent.payment_failed" => HandlePaymentIntentFailedAsync(stripeEvent, cancellationToken),
            "payment_intent.canceled" => HandlePaymentIntentCanceledAsync(stripeEvent, cancellationToken),
            "charge.refunded" => HandleChargeRefundedAsync(stripeEvent, cancellationToken),
            _ => Task.FromResult(new WebhookProcessingResult
            {
                Success = true,
                StatusCode = System.Net.HttpStatusCode.OK,
                ErrorMessage = "Event type not handled"
            })
        };
    }

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandlePaymentCompletedEventAsync(
        PaymentWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Not used for Stripe - use HandlePaymentIntentSucceededAsync instead
        return Task.FromResult(new WebhookProcessingResult
        {
            Success = false,
            ErrorMessage = "Use HandlePaymentIntentSucceededAsync for Stripe webhooks"
        });
    }

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandlePaymentFailedEventAsync(
        PaymentWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Not used for Stripe - use HandlePaymentIntentFailedAsync instead
        return Task.FromResult(new WebhookProcessingResult
        {
            Success = false,
            ErrorMessage = "Use HandlePaymentIntentFailedAsync for Stripe webhooks"
        });
    }

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandlePaymentRefundedEventAsync(
        PaymentWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Not used for Stripe - use HandleChargeRefundedAsync instead
        return Task.FromResult(new WebhookProcessingResult
        {
            Success = false,
            ErrorMessage = "Use HandleChargeRefundedAsync for Stripe webhooks"
        });
    }

    /// <summary>
    /// Handles payment_intent.succeeded event from Stripe.
    /// </summary>
    private async Task<WebhookProcessingResult> HandlePaymentIntentSucceededAsync(
        Stripe.Event stripeEvent,
        CancellationToken cancellationToken)
    {
        try
        {
            var paymentIntent = stripeEvent.Data.Object as Stripe.PaymentIntent;
            if (paymentIntent == null)
            {
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid payment intent data"
                };
            }

            // Extract order_id from metadata
            paymentIntent.Metadata.TryGetValue("order_id", out var orderIdStr);

            if (string.IsNullOrEmpty(orderIdStr) || !int.TryParse(orderIdStr, out var orderId))
            {
                _logger.LogWarning("No valid order_id found in PaymentIntent metadata: {PaymentIntentId}",
                    paymentIntent.Id);
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "No order found in metadata"
                };
            }

            // Update order status to Confirmed
            await _orderRepository.UpdateOrderStatusAsync(orderId, OrderStatus.Confirmed, cancellationToken);

            _logger.LogInformation("Order {OrderId} confirmed via Stripe PaymentIntent {PaymentIntentId}",
                orderId, paymentIntent.Id);

            // Queue the order confirmation email (only if not already sent).
            // Webhooks can be delivered more than once, so guard on the sent flag.
            await QueueConfirmationEmailIfNotSentAsync(orderId, cancellationToken);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling payment_intent.succeeded");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = ex.Message,
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    /// <summary>
    /// Handles payment_intent.payment_failed event from Stripe.
    /// </summary>
    private async Task<WebhookProcessingResult> HandlePaymentIntentFailedAsync(
        Stripe.Event stripeEvent,
        CancellationToken cancellationToken)
    {
        try
        {
            var paymentIntent = stripeEvent.Data.Object as Stripe.PaymentIntent;
            if (paymentIntent == null)
            {
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid payment intent data"
                };
            }

            // Extract order_id from metadata
            paymentIntent.Metadata.TryGetValue("order_id", out var orderIdStr);

            if (string.IsNullOrEmpty(orderIdStr) || !int.TryParse(orderIdStr, out var orderId))
            {
                _logger.LogWarning("No valid order_id found in PaymentIntent metadata: {PaymentIntentId}",
                    paymentIntent.Id);
                return new WebhookProcessingResult { Success = true }; // Don't fail webhook
            }

            // Update order status to Cancelled or Failed
            await _orderRepository.UpdateOrderStatusAsync(orderId, OrderStatus.Cancelled, cancellationToken);

            _logger.LogWarning("Order {OrderId} payment failed via Stripe PaymentIntent {PaymentIntentId}",
                orderId, paymentIntent.Id);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling payment_intent.payment_failed");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = ex.Message,
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    /// <summary>
    /// Handles payment_intent.canceled event from Stripe.
    /// </summary>
    private async Task<WebhookProcessingResult> HandlePaymentIntentCanceledAsync(
        Stripe.Event stripeEvent,
        CancellationToken cancellationToken)
    {
        try
        {
            var paymentIntent = stripeEvent.Data.Object as Stripe.PaymentIntent;
            if (paymentIntent == null)
            {
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid payment intent data"
                };
            }

            // Extract order_id from metadata
            paymentIntent.Metadata.TryGetValue("order_id", out var orderIdStr);

            if (!string.IsNullOrEmpty(orderIdStr) && int.TryParse(orderIdStr, out var orderId))
            {
                // Update order status
                await _orderRepository.UpdateOrderStatusAsync(orderId, OrderStatus.Cancelled, cancellationToken);

                _logger.LogInformation("Order {OrderId} canceled via Stripe PaymentIntent {PaymentIntentId}",
                    orderId, paymentIntent.Id);
            }

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling payment_intent.canceled");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = ex.Message,
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    /// <summary>
    /// Handles charge.refunded event from Stripe.
    /// </summary>
    private async Task<WebhookProcessingResult> HandleChargeRefundedAsync(
        Stripe.Event stripeEvent,
        CancellationToken cancellationToken)
    {
        try
        {
            var charge = stripeEvent.Data.Object as Stripe.Charge;
            if (charge == null)
            {
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid charge data"
                };
            }

            _logger.LogInformation("Refund processed for charge: {ChargeId}, amount: {Amount}",
                charge.Id, charge.AmountRefunded);

            // Record the refund against the order.
            //
            // This is the AUTHORITATIVE path: a refund made in the Stripe dashboard — which
            // is how refunds actually happen today, since the API endpoint has no UI calling
            // it — arrives here and nowhere else. The note that used to sit here said the
            // order status would be updated "when payment status tracking is implemented";
            // the tracking existed all along (`orders.payment_status` has had a `Refunded`
            // value since migration 05), nothing was writing to it. So a refunded order kept
            // reading as paid, and the day's takings stayed wrong by the refunded amount.
            //
            // Best-effort by design: the refund has already happened, so a bookkeeping
            // failure must not make Stripe retry the event forever. It logs, and returns
            // success, because the event itself was handled correctly.
            await TryMarkOrderRefundedAsync(charge, cancellationToken);

            return new WebhookProcessingResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling charge.refunded");
            return new WebhookProcessingResult
            {
                Success = false,
                ErrorMessage = ex.Message,
                StatusCode = System.Net.HttpStatusCode.InternalServerError
            };
        }
    }

    /// <summary>
    /// Queues the order confirmation email for an order, unless it has already
    /// been sent. Stripe retries webhooks, so this keeps delivery idempotent.
    /// </summary>
    /// <summary>
    /// Marks the order behind a refunded charge as Refunded or PartiallyRefunded.
    /// </summary>
    /// <remarks>
    /// Resolves the order through the charge's PaymentIntent, because that is the linkage the
    /// checkout actually writes. The `external_payment_id` column exists but nothing populates
    /// it, so a lookup by that would silently match nothing and the order would keep reading as
    /// paid — the exact bug this method exists to close.
    ///
    /// Never throws. The refund has already happened at Stripe, so a bookkeeping failure must
    /// not be reported as a webhook failure: Stripe retries non-2xx responses, and it would
    /// retry forever over something a retry cannot fix while paging whoever is on call. It logs
    /// instead, which is what an operator can actually act on.
    /// </remarks>
    private async Task TryMarkOrderRefundedAsync(Stripe.Charge charge, CancellationToken cancellationToken)
    {
        try
        {
            var paymentIntentId = charge.PaymentIntentId;
            if (string.IsNullOrWhiteSpace(paymentIntentId))
            {
                _logger.LogWarning(
                    "Refunded charge {ChargeId} carries no PaymentIntent id, so the order cannot be located",
                    charge.Id);
                return;
            }

            var order = await _orderRepository.GetOrderByPaymentIntentIdAsync(paymentIntentId, cancellationToken);
            if (order is null)
            {
                _logger.LogWarning(
                    "Refund recorded for charge {ChargeId} (payment intent {PaymentIntentId}) but no order carries " +
                    "that payment intent; the order will still read as paid",
                    charge.Id, paymentIntentId);
                return;
            }

            // Compare the refunded total against what was actually captured, not the order
            // total. A cart can be priced differently from what Stripe captured, and
            // `paid_amount` is the money that really moved.
            var paid = order.PaidAmount ?? order.Total;
            var refunded = (decimal)charge.AmountRefunded / 100m;

            order.PaymentStatus = refunded >= paid
                ? Models.Enums.PaymentStatus.Refunded
                : Models.Enums.PaymentStatus.PartiallyRefunded;
            order.UpdatedAt = DateTime.UtcNow;

            await _orderRepository.UpdateOrderAsync(order, cancellationToken);

            _logger.LogInformation(
                "Order {OrderNumber} marked {PaymentStatus} after a refund of {Refunded} (paid {Paid})",
                order.OrderNumber, order.PaymentStatus, refunded, paid);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Could not record the refund for charge {ChargeId} against its order. " +
                "Stripe has the refund; the local order still reads as paid.",
                charge.Id);
        }
    }

    private async Task QueueConfirmationEmailIfNotSentAsync(int orderId, CancellationToken cancellationToken)
    {
        try
        {
            var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
            if (order is null)
            {
                _logger.LogWarning("Cannot queue confirmation email: order {OrderId} not found", orderId);
                return;
            }

            if (order.EmailConfirmationSent)
            {
                _logger.LogInformation("Confirmation email already sent for order {OrderId}; skipping", orderId);
                return;
            }

            if (string.IsNullOrWhiteSpace(order.CustomerEmail))
            {
                _logger.LogWarning("Order {OrderId} has no customer email; skipping confirmation", orderId);
                return;
            }

            var items = await _orderRepository.GetOrderItemsAsync(orderId, cancellationToken);

            var model = new OrderConfirmationEmailModel
            {
                OrderNumber = order.OrderNumber,
                CustomerName = order.CustomerName,
                OrderDate = order.CreatedAt,
                EstimatedReadyTime = order.RequestedTime.AddMinutes(15),
                OrderType = order.OrderType.ToString(),
                PaymentMethod = order.PaymentMethod?.ToString() ?? string.Empty,
                Subtotal = order.Subtotal,
                Total = order.Total,
                SpecialInstructions = order.Notes,
                Items = items.Select(i => new OrderItemEmailModel
                {
                    Name = i.MenuItemName,
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    TotalPrice = i.TotalPrice,
                    SpecialInstructions = i.SpecialInstructions,
                    Modifiers = i.Modifiers?.Any() == true
                        ? string.Join(", ", i.Modifiers.Select(m => m.ModifierName ?? ""))
                        : null
                }).ToList(),
            };

            await _emailQueue.EnqueueAsync(
                new OrderConfirmationEmailJob(order.Id, order.CustomerEmail, order.CustomerName, model),
                cancellationToken);

            _logger.LogInformation("Queued confirmation email for order {OrderId} after payment success", orderId);
        }
        catch (Exception ex)
        {
            // Email failure must not fail the webhook (Stripe would retry needlessly).
            _logger.LogError(ex, "Failed to queue confirmation email for order {OrderId}", orderId);
        }
    }
}

/// <summary>
/// Result of processing one webhook delivery.
/// </summary>
/// <remarks>
/// Lives here because Stripe's webhook service is now the only producer. It used to
/// sit alongside a Lightspeed webhook contract whose events nothing could send.
/// </remarks>
public record WebhookProcessingResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }
    public System.Net.HttpStatusCode StatusCode { get; init; } = System.Net.HttpStatusCode.OK;
}

/// <summary>
/// Payment fields a webhook event can carry.
/// </summary>
public record PaymentWebhookData
{
    public string PaymentId { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; }
    public string? Currency { get; set; }
    public string? TransactionId { get; set; }
    public Dictionary<string, string>? Metadata { get; set; }
}
