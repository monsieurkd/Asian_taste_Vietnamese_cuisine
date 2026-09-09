using System.Text.Json;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using Microsoft.Extensions.Configuration;

namespace AsianTaste.API.Services.Webhooks;

/// <summary>
/// Stripe webhook service for processing payment events.
/// Handles Stripe webhook events and updates order status accordingly.
/// </summary>
public class StripeWebhookService : IWebhookService
{
    private readonly IOrderRepository _orderRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<StripeWebhookService> _logger;

    public StripeWebhookService(
        IOrderRepository orderRepository,
        IConfiguration configuration,
        ILogger<StripeWebhookService> logger)
    {
        _orderRepository = orderRepository;
        _configuration = configuration;
        _logger = logger;
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

            // Verify signature using Stripe's utility
            try
            {
                // Parse the Stripe event - the webhook secret is passed to ConstructEvent for verification
                Stripe.Event stripeEvent = Stripe.EventUtility.ConstructEvent(
                    payload,
                    signature,
                    webhookSecret
                );

                _logger.LogInformation("Processing Stripe webhook event: {EventType}", stripeEvent.Type);

                // Process based on event type
                return stripeEvent.Type.ToLowerInvariant() switch
                {
                    "payment_intent.succeeded" => await HandlePaymentIntentSucceededAsync(stripeEvent, cancellationToken),
                    "payment_intent.payment_failed" => await HandlePaymentIntentFailedAsync(stripeEvent, cancellationToken),
                    "payment_intent.canceled" => await HandlePaymentIntentCanceledAsync(stripeEvent, cancellationToken),
                    "charge.refunded" => await HandleChargeRefundedAsync(stripeEvent, cancellationToken),
                    _ => new WebhookProcessingResult
                    {
                        Success = true,
                        StatusCode = System.Net.HttpStatusCode.OK,
                        ErrorMessage = "Event type not handled"
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Invalid Stripe webhook signature");
                return new WebhookProcessingResult
                {
                    Success = false,
                    ErrorMessage = "Invalid signature",
                    StatusCode = System.Net.HttpStatusCode.Unauthorized
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
            Stripe.EventUtility.ConstructEvent(payload, signature, webhookSecret);
            return true;
        }
        catch
        {
            return false;
        }
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

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandleOrderUpdatedEventAsync(
        OrderWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Stripe doesn't send order updates
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandleOrderCompletedEventAsync(
        OrderWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Stripe doesn't send order completion events
        return Task.FromResult(new WebhookProcessingResult { Success = true });
    }

    /// <inheritdoc />
    public Task<WebhookProcessingResult> HandleProductUpdatedEventAsync(
        ProductWebhookData data,
        CancellationToken cancellationToken = default)
    {
        // Stripe doesn't send product updates
        return Task.FromResult(new WebhookProcessingResult { Success = true });
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

            // Note: Refund status update would go here when payment status tracking is implemented
            // For now, the order status remains unchanged - refunds are handled via Stripe dashboard

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
}
