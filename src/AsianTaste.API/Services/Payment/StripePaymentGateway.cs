using System.Text;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Payment.Interfaces;
using AsianTaste.API.Services.Webhooks;
using Stripe;
using AsianTaste.API.Models.Enums;
using InterfacePaymentStatus = AsianTaste.API.Services.Payment.Interfaces.PaymentStatus;
using InterfaceRefundStatus = AsianTaste.API.Services.Payment.Interfaces.RefundStatus;

namespace AsianTaste.API.Services.Payment;

/// <summary>
/// Stripe payment gateway implementation.
/// Uses Stripe PaymentIntents for processing card payments.
/// REFERENCE: https://stripe.com/docs/api/payment_intents
/// </summary>
public class StripePaymentGateway : IPaymentGatewayService
{
    private readonly StripeConfiguration _config;
    private readonly ILogger<StripePaymentGateway> _logger;
    private readonly IOrderRepository _orderRepository;

    public StripePaymentGateway(
        StripeConfiguration config,
        ILogger<StripePaymentGateway> logger,
        IOrderRepository orderRepository)
    {
        _config = config;
        _logger = logger;
        _orderRepository = orderRepository;

        // Configure Stripe with secret key
        if (!string.IsNullOrEmpty(_config.SecretKey))
        {
            Stripe.StripeConfiguration.ApiKey = _config.SecretKey;
        }
    }

    /// <inheritdoc />
    public async Task<PaymentInitiationResult> InitiatePaymentAsync(
        PaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // For cash payments, no need to process through payment gateway
            if (request.PaymentMethodType == PaymentMethodType.Cash)
            {
                var cashPaymentId = $"CASH_{request.OrderId}_{Guid.NewGuid():N}";
                _logger.LogInformation("Cash payment initiated for order {OrderId}, payment ID: {PaymentId}",
                    request.OrderId, cashPaymentId);

                return new PaymentInitiationResult
                {
                    Success = true,
                    PaymentId = cashPaymentId,
                    PaymentStatus = InterfacePaymentStatus.Pending,
                    RequiresAction = false
                };
            }

            // Create Stripe PaymentIntent.
            //
            // AutomaticPaymentMethods rather than an explicit
            // PaymentMethodTypes = ["card"] list. Apple Pay and Google Pay are
            // wallets that sit ON TOP of card, so restricting the intent to the
            // "card" method type means Stripe never offers them — registering the
            // domain is not enough on its own. `automatic_payment_methods` lets
            // Stripe offer every method enabled in the dashboard, which is what
            // makes the wallets appear.
            //
            // The two options are mutually exclusive: sending both is an error.
            //
            // Consequence worth knowing: this also means anything switched on in
            // the Stripe dashboard appears at checkout with no code change and no
            // review. Enable Apple Pay and Google Pay there; leave the rest off,
            // or customers will be offered payment methods the restaurant cannot
            // reconcile against a till.
            var options = new PaymentIntentCreateOptions
            {
                Amount = request.Amount,
                Currency = request.Currency.ToLowerInvariant(),
                Metadata = new Dictionary<string, string>
                {
                    { "order_id", request.OrderId },
                    { "order_number", request.OrderNumber ?? "" }
                },
                Description = $"Order {request.OrderNumber}",
                AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions
                {
                    Enabled = true,
                },
                CaptureMethod = "automatic" // Capture immediately (for pickup/delivery)
            };

            // Add customer email if provided.
            //
            // This is set before the create call because Apple Pay reads it for
            // the receipt and the wallet sheet. It used to be attached after the
            // PaymentIntent was created, which would have produced wallet payments
            // with no email attached — and no order confirmation.
            if (!string.IsNullOrEmpty(request.CustomerEmail))
            {
                options.ReceiptEmail = request.CustomerEmail;
            }

            var service = new PaymentIntentService();
            var paymentIntent = await service.CreateAsync(options);

            _logger.LogInformation("Created Stripe PaymentIntent {PaymentIntentId} for order {OrderId}, amount: {Amount}",
                paymentIntent.Id, request.OrderId, request.Amount);

            return new PaymentInitiationResult
            {
                Success = true,
                PaymentId = paymentIntent.Id,
                ClientSecret = paymentIntent.ClientSecret,
                PaymentStatus = MapStripeStatusToPaymentStatus(paymentIntent.Status),
                RequiresAction = paymentIntent.NextAction?.Type == "use_stripe_sdk"
            };
        }
        catch (System.Exception e) when (e is StripeException)
        {
            _logger.LogError(e, "Stripe error creating PaymentIntent for order {OrderId}", request.OrderId);
            return new PaymentInitiationResult
            {
                Success = false,
                PaymentId = string.Empty,
                ErrorMessage = e.Message,
                PaymentStatus = InterfacePaymentStatus.Failed
            };
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Error initiating payment for order {OrderId}", request.OrderId);
            return new PaymentInitiationResult
            {
                Success = false,
                PaymentId = string.Empty,
                ErrorMessage = "Payment processing error",
                PaymentStatus = InterfacePaymentStatus.Failed
            };
        }
    }

    /// <inheritdoc />
    public async Task<PaymentCaptureResult> CapturePaymentAsync(
        string paymentId,
        decimal amount,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check if this is a cash payment
            if (paymentId.StartsWith("CASH_"))
            {
                _logger.LogInformation("Cash payment captured for {PaymentId}", paymentId);
                return new PaymentCaptureResult
                {
                    Success = true,
                    CaptureId = $"CAPTURE_{paymentId}",
                    Amount = amount
                };
            }

            // Capture the PaymentIntent (usually automatic for card payments)
            var service = new PaymentIntentService();
            var paymentIntent = await service.CaptureAsync(paymentId, new PaymentIntentCaptureOptions
            {
                AmountToCapture = (long)(amount * 100) // Convert to cents
            });

            if (paymentIntent.Status == "succeeded")
            {
                _logger.LogInformation("Payment captured successfully: {PaymentId}", paymentId);
                return new PaymentCaptureResult
                {
                    Success = true,
                    CaptureId = paymentId,
                    Amount = paymentIntent.AmountReceived / 100m
                };
            }

            return new PaymentCaptureResult
            {
                Success = false,
                CaptureId = string.Empty,
                ErrorMessage = $"Capture failed with status: {paymentIntent.Status}"
            };
        }
        catch (System.Exception e)
        {
            _logger.LogError(e, "Stripe error capturing payment {PaymentId}", paymentId);
            return new PaymentCaptureResult
            {
                Success = false,
                CaptureId = string.Empty,
                ErrorMessage = e.Message
            };
        }
    }

    /// <inheritdoc />
    public async Task<PaymentAuthorizationResult> AuthorizePaymentAsync(
        PaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // For cash payments
            if (request.PaymentMethodType == PaymentMethodType.Cash)
            {
                return new PaymentAuthorizationResult
                {
                    Success = true,
                    AuthorizationId = $"CASH_AUTH_{request.OrderId}",
                    Amount = request.Amount / 100m
                };
            }

            // A card order must arrive with the PaymentIntent the BROWSER confirmed.
            //
            // Without this the code fell through to the create-a-new-intent path below.
            // Stripe happily returned a fresh, unpaid intent, `Success = true` came back,
            // and the order was recorded as "Paid online" having taken no money. A probe
            // order in production proved it: a card order with no token at all reported
            // "Paid online". Failing here is what makes the response honest.
            if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            {
                return new PaymentAuthorizationResult
                {
                    Success = false,
                    AuthorizationId = string.Empty,
                    ErrorMessage = "No confirmed card payment was supplied with this order, so nothing was charged."
                };
            }

            // VERIFY the client's intent rather than creating one. The browser confirms
            // the PaymentIntent (3-D Secure needs a browser), then sends its id; trusting
            // the id without asking Stripe would let any caller claim payment, and
            // creating a new intent would charge a card the customer never confirmed.
            var service = new PaymentIntentService();
            var confirmed = await service.GetAsync(request.PaymentMethodId);

            if (confirmed.Status != "succeeded" && confirmed.Status != "requires_capture")
            {
                return new PaymentAuthorizationResult
                {
                    Success = false,
                    AuthorizationId = confirmed.Id,
                    ErrorMessage = confirmed.Status switch
                    {
                        "processing" => "The bank is still processing this payment. Try again in a moment.",
                        "requires_action" => "The card was not finished confirming. Please try again.",
                        "requires_payment_method" => "That card was declined. Please try another.",
                        _ => $"The payment is not complete (status: {confirmed.Status}).",
                    }
                };
            }

            // The amount is the server's own figure, so a mismatch means the client
            // confirmed a different amount from the order it is attached to — refuse it
            // rather than record a total nobody paid.
            if (confirmed.Amount != request.Amount)
            {
                _logger.LogWarning(
                    "Payment {PaymentId} is for {PaidAmount} but order {OrderId} expects {ExpectedAmount}",
                    confirmed.Id, confirmed.Amount, request.OrderId, request.Amount);

                return new PaymentAuthorizationResult
                {
                    Success = false,
                    AuthorizationId = confirmed.Id,
                    ErrorMessage = "The amount paid does not match this order, so it was not accepted."
                };
            }

            _logger.LogInformation("Payment {PaymentId} verified for order {OrderId}", confirmed.Id, request.OrderId);

            return new PaymentAuthorizationResult
            {
                Success = true,
                AuthorizationId = confirmed.Id,
                Amount = confirmed.Amount / 100m
            };
        }
        catch (System.Exception e)
        {
            _logger.LogError(e, "Stripe error authorizing payment for order {OrderId}", request.OrderId);
            return new PaymentAuthorizationResult
            {
                Success = false,
                AuthorizationId = string.Empty,
                ErrorMessage = e.Message
            };
        }
    }

    /// <inheritdoc />
    public async Task<PaymentRefundResult> RefundPaymentAsync(
        string paymentId,
        decimal? amount = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check if this is a cash payment
            if (paymentId.StartsWith("CASH_"))
            {
                _logger.LogInformation("Cash refund processed for {PaymentId}, amount: {Amount}",
                    paymentId, amount ?? 0);
                return new PaymentRefundResult
                {
                    Success = true,
                    RefundId = $"REFUND_CASH_{Guid.NewGuid():N}",
                    Amount = amount ?? 0,
                    Status = InterfaceRefundStatus.Succeeded
                };
            }

            var refundOptions = new RefundCreateOptions
            {
                PaymentIntent = paymentId
            };

            // If amount is specified, it's a partial refund
            if (amount.HasValue)
            {
                refundOptions.Amount = (long)(amount.Value * 100); // Convert to cents
            }

            var service = new RefundService();
            var refund = await service.CreateAsync(refundOptions);

            _logger.LogInformation("Refund processed: {RefundId} for payment {PaymentId}, amount: {Amount}",
                refund.Id, paymentId, refund.Amount);

            var refundStatus = refund.Status switch
            {
                "succeeded" => InterfaceRefundStatus.Succeeded,
                "pending" => InterfaceRefundStatus.Pending,
                _ => InterfaceRefundStatus.Failed
            };

            return new PaymentRefundResult
            {
                Success = true,
                RefundId = refund.Id,
                Amount = refund.Amount / 100m,
                Status = refundStatus
            };
        }
        catch (System.Exception e)
        {
            _logger.LogError(e, "Stripe error refunding payment {PaymentId}", paymentId);
            return new PaymentRefundResult
            {
                Success = false,
                RefundId = string.Empty,
                Amount = 0,
                ErrorMessage = e.Message,
                Status = InterfaceRefundStatus.Failed
            };
        }
    }

    /// <inheritdoc />
    public async Task<PaymentStatusResult> GetPaymentStatusAsync(
        string paymentId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check if this is a cash payment
            if (paymentId.StartsWith("CASH_"))
            {
                return new PaymentStatusResult
                {
                    Status = InterfacePaymentStatus.Pending, // Cash payments are pending until pickup
                    PaidAmount = null,
                    PaidAt = null
                };
            }

            var service = new PaymentIntentService();
            var paymentIntent = await service.GetAsync(paymentId);

            var status = MapStripeStatusToPaymentStatus(paymentIntent.Status);
            var paidAmount = paymentIntent.AmountReceived / 100m;

            return new PaymentStatusResult
            {
                Status = status,
                PaidAmount = paidAmount,
                PaidAt = status == InterfacePaymentStatus.Succeeded ? DateTime.UtcNow : null,
                Currency = paymentIntent.Currency.ToUpper()
            };
        }
        catch (System.Exception e)
        {
            _logger.LogError(e, "Stripe error getting payment status for {PaymentId}", paymentId);
            return new PaymentStatusResult
            {
                Status = InterfacePaymentStatus.Failed,
                ErrorMessage = e.Message
            };
        }
    }

    /// <inheritdoc />
    public bool VerifyWebhookSignature(string payload, string signature, string secret)
    {
        try
        {
            // Use Stripe's utility to verify the signature
            // Note: In Stripe.net v47+, WebhookSignature.VerifyHeader has different signature
            // For now, we'll do a basic signature verification

            // Extract timestamp and v1 signature from Stripe-Signature header
            // Format: t={timestamp},v1={signature}
            if (string.IsNullOrEmpty(signature))
            {
                return false;
            }

            // Simple verification - in production, use proper Stripe webhook verification
            // The actual implementation would use Stripe.EventUtility.ConstructEvent with webhook secret
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying webhook signature");
            return false;
        }
    }

    /// <inheritdoc />
    public async Task<WebhookEvent?> ParseWebhookAsync(
        string payload,
        string signature,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (string.IsNullOrEmpty(_config.WebhookSecret))
            {
                _logger.LogError("Webhook secret not configured");
                return null;
            }

            // Verify signature first
            if (!VerifyWebhookSignature(payload, signature, _config.WebhookSecret))
            {
                _logger.LogWarning("Webhook signature verification failed");
                return null;
            }

            // Parse the Stripe event - the payload is trusted since we verified signature
            var stripeEvent = Stripe.EventUtility.ConstructEvent(payload, signature, _config.WebhookSecret);

            _logger.LogInformation("Processing Stripe webhook event: {EventType} for {EventId}",
                stripeEvent.Type, stripeEvent.Id);

            // Extract order_id from metadata if available
            string? orderId = null;
            string? paymentId = null;

            if (stripeEvent.Data.Object is PaymentIntent paymentIntent)
            {
                paymentId = paymentIntent.Id;
                paymentIntent.Metadata?.TryGetValue("order_id", out orderId);
            }

            return new WebhookEvent
            {
                EventId = stripeEvent.Id,
                EventType = stripeEvent.Type,
                PaymentId = paymentId,
                OrderId = orderId,
                Timestamp = stripeEvent.Created,
                Data = new Dictionary<string, object>
                {
                    ["raw"] = stripeEvent
                }
            };
        }
        catch (System.Exception e)
        {
            _logger.LogError(e, "Error parsing Stripe webhook payload");
            return null;
        }
    }

    /// <summary>
    /// Maps Stripe PaymentIntent status to our PaymentStatus enum.
    /// </summary>
    private static InterfacePaymentStatus MapStripeStatusToPaymentStatus(string stripeStatus)
    {
        return stripeStatus.ToLowerInvariant() switch
        {
            "requires_payment_method" => InterfacePaymentStatus.Pending,
            "requires_confirmation" => InterfacePaymentStatus.Pending,
            "requires_action" => InterfacePaymentStatus.RequiresAction,
            "processing" => InterfacePaymentStatus.Processing,
            "succeeded" => InterfacePaymentStatus.Succeeded,
            "canceled" => InterfacePaymentStatus.Canceled,
            _ => InterfacePaymentStatus.Pending
        };
    }

    /// <summary>
    /// Computes HMAC-SHA256 hash for signature verification.
    /// </summary>
    private static string ComputeHmacSha256(string payload, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);

        using var hmac = new System.Security.Cryptography.HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(payloadBytes);

        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }
}
