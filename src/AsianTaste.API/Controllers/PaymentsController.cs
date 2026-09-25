using System.ComponentModel.DataAnnotations;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Payment.Interfaces;
using Microsoft.AspNetCore.Mvc;
using IPaymentStatus = AsianTaste.API.Services.Payment.Interfaces.PaymentStatus;
using IPaymentMethodType = AsianTaste.API.Services.Payment.Interfaces.PaymentMethodType;
using IRefundStatus = AsianTaste.API.Services.Payment.Interfaces.RefundStatus;
using IOrderType = AsianTaste.API.Services.Payment.Interfaces.OrderType;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for handling payment operations.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly IPaymentGatewayService _paymentGateway;
    private readonly IOrderRepository _orderRepository;
    private readonly ILogger<PaymentsController> _logger;

    public PaymentsController(
        IPaymentGatewayService paymentGateway,
        IOrderRepository orderRepository,
        ILogger<PaymentsController> logger)
    {
        _paymentGateway = paymentGateway;
        _orderRepository = orderRepository;
        _logger = logger;
    }

    /// <summary>
    /// Creates a Stripe PaymentIntent before order creation (for frontend checkout flow).
    /// POST: /api/payments/create-intent
    /// </summary>
    /// <param name="request">Payment intent creation request.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Payment intent creation result with client secret.</returns>
    [HttpPost("create-intent")]
    [ProducesResponseType(typeof(CreatePaymentIntentResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CreatePaymentIntentResponseDto>> CreatePaymentIntent(
        [FromBody] CreatePaymentIntentRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.Amount <= 0)
        {
            return BadRequest(new { error = "Amount must be greater than 0" });
        }

        // Generate a temporary order ID for the payment intent
        var tempOrderId = $"TEMP_{Guid.NewGuid():N}";
        var tempOrderNumber = $"PENDING_{DateTime.UtcNow:yyyyMMddHHmmss}";

        // Build payment request
        var paymentRequest = new PaymentRequest
        {
            OrderId = tempOrderId,
            OrderNumber = tempOrderNumber,
            Amount = request.Amount, // Already in cents from frontend
            Currency = request.Currency ?? "aud",
            PaymentMethodType = IPaymentMethodType.Card,
            OrderType = IOrderType.Pickup,
            CustomerEmail = request.CustomerEmail,
            CustomerPhone = null,
            Metadata = new Dictionary<string, string>
            {
                { "temp_order", "true" },
                { "customer_email", request.CustomerEmail ?? "" }
            },
            IdempotencyKey = $"INTENT_{tempOrderId}_{Guid.NewGuid():N}"
        };

        var result = await _paymentGateway.InitiatePaymentAsync(paymentRequest, cancellationToken);

        _logger.LogInformation("Payment intent created: {PaymentId}, success: {Success}",
            result.PaymentId, result.Success);

        return Ok(new CreatePaymentIntentResponseDto
        {
            Success = result.Success,
            ClientSecret = result.ClientSecret,
            PaymentIntentId = result.PaymentId,
            ErrorMessage = result.ErrorMessage
        });
    }

    /// <summary>
    /// Initiates payment for an existing order.
    /// POST: /api/payments/initiate
    /// </summary>
    /// <param name="request">Payment initiation request.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Payment initiation result with payment ID or error details.</returns>
    [HttpPost("initiate")]
    [ProducesResponseType(typeof(InitiatePaymentResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<InitiatePaymentResponseDto>> InitiatePayment(
        [FromBody] InitiatePaymentRequestDto request,
        CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetOrderByIdAsync(request.OrderId, cancellationToken);
        if (order == null)
        {
            return NotFound(new { error = "Order not found" });
        }

        // Check if order is already paid
        if (order.PaymentStatus == Models.Enums.PaymentStatus.Succeeded)
        {
            return BadRequest(new InitiatePaymentResponseDto
            {
                Success = false,
                PaymentId = string.Empty,
                ErrorMessage = "Order is already paid",
                PaymentStatus = IPaymentStatus.Succeeded
            });
        }

        // For cash payments, mark accordingly
        if (request.PaymentMethodType == IPaymentMethodType.Cash)
        {
            _logger.LogInformation("Cash payment initiated for order {OrderId}", order.Id);

            return Ok(new InitiatePaymentResponseDto
            {
                Success = true,
                PaymentId = $"CASH_{order.Id}_{Guid.NewGuid():N}",
                PaymentStatus = IPaymentStatus.Pending,
                RequiresAction = false
            });
        }

        // Build payment request
        var paymentRequest = new PaymentRequest
        {
            OrderId = order.Id.ToString(),
            OrderNumber = order.OrderNumber,
            Amount = (int)(order.Total * 100), // Convert to cents
            Currency = "USD",
            PaymentMethodType = request.PaymentMethodType,
            OrderType = (IOrderType)order.OrderType,
            CustomerEmail = order.CustomerEmail,
            CustomerPhone = order.CustomerPhone,
            Metadata = new Dictionary<string, string>
            {
                { "order_number", order.OrderNumber },
                { "customer_name", order.CustomerName }
            },
            IdempotencyKey = $"PAY_{order.OrderNumber}_{Guid.NewGuid():N}"
        };

        var result = await _paymentGateway.InitiatePaymentAsync(paymentRequest, cancellationToken);

        // TODO: Update order with payment details in repository
        // This would be done through a new method in IOrderRepository

        _logger.LogInformation("Payment {PaymentId} initiated for order {OrderId}, success: {Success}",
            result.PaymentId, order.Id, result.Success);

        return Ok(new InitiatePaymentResponseDto
        {
            Success = result.Success,
            PaymentId = result.PaymentId,
            ClientSecret = result.ClientSecret,
            RedirectUrl = result.RedirectUrl,
            ErrorMessage = result.ErrorMessage,
            RequiresAction = result.RequiresAction,
            PaymentStatus = result.PaymentStatus
        });
    }

    /// <summary>
    /// Captures a previously authorized payment (for dine-in orders).
    /// POST: /api/payments/{paymentId}/capture
    /// </summary>
    /// <param name="paymentId">External payment ID from authorization.</param>
    /// <param name="request">Capture request with amount.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Capture result.</returns>
    [HttpPost("{paymentId}/capture")]
    [ProducesResponseType(typeof(CapturePaymentResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CapturePaymentResponseDto>> CapturePayment(
        string paymentId,
        [FromBody] CapturePaymentRequestDto request,
        CancellationToken cancellationToken)
    {
        // For cash payments, just return success
        if (paymentId.StartsWith("CASH_"))
        {
            _logger.LogInformation("Cash payment captured for {PaymentId}", paymentId);
            return Ok(new CapturePaymentResponseDto
            {
                Success = true,
                CaptureId = $"CAPTURE_{paymentId}",
                Amount = request.Amount / 100m // Convert cents to dollars
            });
        }

        var result = await _paymentGateway.CapturePaymentAsync(
            paymentId,
            request.Amount / 100m, // Convert cents to dollars
            cancellationToken);

        // TODO: Update order with capture status

        _logger.LogInformation("Payment capture {CaptureId} for payment {PaymentId}, success: {Success}",
            result.CaptureId, paymentId, result.Success);

        return Ok(new CapturePaymentResponseDto
        {
            Success = result.Success,
            CaptureId = result.CaptureId,
            ErrorMessage = result.ErrorMessage,
            Amount = result.Amount
        });
    }

    /// <summary>
    /// Refunds a payment (full or partial).
    /// POST: /api/payments/{paymentId}/refund
    /// </summary>
    /// <param name="paymentId">External payment ID to refund.</param>
    /// <param name="request">Refund request with amount (null for full refund).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Refund result.</returns>
    [HttpPost("{paymentId}/refund")]
    [ProducesResponseType(typeof(RefundPaymentResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RefundPaymentResponseDto>> RefundPayment(
        string paymentId,
        [FromBody] RefundPaymentRequestDto request,
        CancellationToken cancellationToken)
    {
        decimal? refundAmount = request.Amount.HasValue
            ? request.Amount.Value / 100m // Convert cents to dollars
            : null;

        var result = await _paymentGateway.RefundPaymentAsync(
            paymentId,
            refundAmount,
            cancellationToken);

        // Record the refund against the order.
        //
        // This used to be a `// TODO: Update order with refund status`, so a refunded
        // order kept reading as paid — the dashboard's numbers and the order's own
        // payment column disagreed with Stripe, which is the accounting nobody can
        // reconcile later. The schema already had `payment_status = Refunded` /
        // `PartiallyRefunded`; nothing was setting it.
        //
        // Deliberately best-effort: the money has already moved at this point, so a
        // failure to record it must NOT turn a successful refund into a 500 the caller
        // retries. A retry cannot un-refund, and the webhook (`charge.refunded`) is the
        // authoritative path that will converge the same row.
        if (result.Success)
        {
            await TryRecordRefundAsync(paymentId, result, cancellationToken);
        }

        _logger.LogInformation("Payment refund {RefundId} for payment {PaymentId}, amount: {Amount}, success: {Success}",
            result.RefundId, paymentId, result.Amount, result.Success);

        return Ok(new RefundPaymentResponseDto
        {
            Success = result.Success,
            RefundId = result.RefundId,
            Amount = result.Amount,
            ErrorMessage = result.ErrorMessage,
            Status = result.Status
        });
    }

    /// <summary>
    /// Marks the refunded order's payment status, if the order can be found.
    /// </summary>
    /// <remarks>
    /// Never throws: the refund has already succeeded at the gateway, so failing to
    /// record it here must not surface as an error to the caller. It logs loudly instead,
    /// and the <c>charge.refunded</c> webhook remains the authoritative convergence path.
    /// </remarks>
    private async Task TryRecordRefundAsync(
        string paymentId,
        PaymentRefundResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            var order = await _orderRepository.GetOrderByExternalPaymentIdAsync(paymentId, cancellationToken);
            if (order is null)
            {
                _logger.LogWarning(
                    "Refund succeeded for payment {PaymentId} but no order carries that payment id; " +
                    "the order will not show as refunded",
                    paymentId);
                return;
            }

            // Partial vs full is decided by comparing the refunded total against what was
            // actually paid, not against the order total: a cart can be priced differently
            // from what was captured, and `paid_amount` is the money that really moved.
            var refundedTotal = result.Amount;
            var paid = order.PaidAmount ?? order.Total;

            order.PaymentStatus = refundedTotal >= paid
                ? Models.Enums.PaymentStatus.Refunded
                : Models.Enums.PaymentStatus.PartiallyRefunded;
            order.UpdatedAt = DateTime.UtcNow;

            await _orderRepository.UpdateOrderAsync(order, cancellationToken);

            _logger.LogInformation(
                "Order {OrderNumber} marked {PaymentStatus} after refund of {Refunded}",
                order.OrderNumber, order.PaymentStatus, refundedTotal);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Refund for payment {PaymentId} succeeded but recording it against the order failed. " +
                "The charge.refunded webhook should converge this.",
                paymentId);
        }
    }

    /// <summary>
    /// Gets the current status of a payment.
    /// GET: /api/payments/{paymentId}/status
    /// </summary>
    /// <param name="paymentId">External payment ID.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Current payment status.</returns>
    [HttpGet("{paymentId}/status")]
    [ProducesResponseType(typeof(PaymentStatusResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PaymentStatusResponseDto>> GetPaymentStatus(
        string paymentId,
        CancellationToken cancellationToken)
    {
        var result = await _paymentGateway.GetPaymentStatusAsync(paymentId, cancellationToken);

        return Ok(new PaymentStatusResponseDto
        {
            Status = result.Status,
            PaidAmount = result.PaidAmount,
            PaidAt = result.PaidAt,
            Currency = result.Currency,
            ErrorMessage = result.ErrorMessage
        });
    }

    /// <summary>
    /// Gets payment details for an order.
    /// GET: /api/payments/order/{orderId}
    /// </summary>
    /// <param name="orderId">Internal order ID.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Order payment details.</returns>
    [HttpGet("order/{orderId}")]
    [ProducesResponseType(typeof(OrderPaymentDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderPaymentDetailsDto>> GetOrderPaymentDetails(
        int orderId,
        CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order == null)
        {
            return NotFound(new { error = "Order not found" });
        }

        return Ok(new OrderPaymentDetailsDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Total = order.Total,
            PaymentMethod = order.PaymentMethod,
            PaymentStatus = order.PaymentStatus,
            PaidAmount = order.PaidAmount,
            PaidAt = order.PaidAt,
            ExternalPaymentId = order.ExternalPaymentId,
        });
    }
}
