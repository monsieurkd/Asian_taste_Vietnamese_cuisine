using System.Net;
using System.Text;
using AsianTaste.API.Services.Webhooks;
using Microsoft.AspNetCore.Mvc;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for handling webhook endpoints from external services.
/// </summary>
[ApiController]
[Route("api/webhook")]
public class WebhookController : ControllerBase
{
    private readonly ILogger<WebhookController> _logger;
    private readonly StripeWebhookService _webhookService;

    public WebhookController(ILogger<WebhookController> logger, StripeWebhookService webhookService)
    {
        _logger = logger;
        _webhookService = webhookService;
    }

    /// <summary>
    /// Stripe webhook endpoint.
    /// POST: /api/webhook/stripe
    /// Handles real-time payment events from Stripe including:
    /// - payment_intent.succeeded
    /// - payment_intent.payment_failed
    /// - payment_intent.canceled
    /// - charge.refunded
    /// </summary>
    /// <remarks>
    /// Expected headers:
    /// - Stripe-Signature: Stripe webhook signature (t={timestamp},v1={signature})
    ///
    /// Expected events:
    /// - payment_intent.succeeded: Payment completed successfully
    /// - payment_intent.payment_failed: Payment failed
    /// - charge.refunded: Refund processed
    /// </remarks>
    /// <returns>200 OK if webhook was accepted, 401 Unauthorized if signature is invalid.</returns>
    [HttpPost("stripe")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> HandleStripeWebhook()
    {
        using var reader = new StreamReader(HttpContext.Request.Body, leaveOpen: true);
        var payload = await reader.ReadToEndAsync();

        if (string.IsNullOrWhiteSpace(payload))
        {
            _logger.LogWarning("Empty Stripe webhook payload received");
            return BadRequest(new { error = "Empty payload" });
        }

        var signature = HttpContext.Request.Headers["Stripe-Signature"].FirstOrDefault();
        var sourceIp = HttpContext.Connection.RemoteIpAddress?.ToString();

        _logger.LogInformation("Received Stripe webhook from {SourceIp}", sourceIp);

        if (string.IsNullOrEmpty(signature))
        {
            _logger.LogWarning("Stripe webhook received without signature from {SourceIp}", sourceIp);
            return Unauthorized(new { error = "Missing signature" });
        }

        var result = await _webhookService.ProcessWebhookAsync(payload, signature);

        return result.StatusCode switch
        {
            HttpStatusCode.OK => Ok(new { message = "Webhook processed successfully" }),
            HttpStatusCode.Unauthorized => Unauthorized(new { error = result.ErrorMessage ?? "Invalid signature" }),
            HttpStatusCode.BadRequest => BadRequest(new { error = result.ErrorMessage }),
            _ => StatusCode((int)result.StatusCode, new { error = result.ErrorMessage })
        };
    }

    /// <summary>
    /// Test endpoint for webhook verification.
    /// GET: /api/webhook/test
    /// Can be used to verify webhook endpoint is reachable.
    /// </summary>
    [HttpGet("test")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult TestWebhookEndpoint()
    {
        return Ok(new
        {
            message = "Webhook endpoint is reachable",
            timestamp = DateTime.UtcNow,
            endpoints = new
            {
                stripe = "/api/webhook/stripe"
            }
        });
    }

    /// <summary>
    /// Simulates a Stripe webhook for testing purposes.
    /// POST: /api/webhook/simulate
    /// Only available to local requests.
    /// </summary>
    /// <param name="eventType">Type of event to simulate (default: payment_intent.succeeded)</param>
    /// <param name="orderId">Order ID to attach to the simulated event.</param>
    /// <returns>200 OK with simulation result</returns>
    [HttpPost("simulate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SimulateWebhook(
        [FromQuery] string eventType = "payment_intent.succeeded",
        [FromQuery] int orderId = 1)
    {
        if (!HttpContext.Request.IsFromLocal())
        {
            return Forbid();
        }

        var paymentIntentId = $"pi_test_{Guid.NewGuid():N}";
        var status = eventType.ToLowerInvariant() switch
        {
            "payment_intent.payment_failed" => "requires_payment_method",
            "payment_intent.canceled" => "canceled",
            _ => "succeeded",
        };

        _logger.LogInformation("Simulating Stripe webhook event: {EventType} for order {OrderId}", eventType, orderId);

        // Run the handler directly rather than signing and verifying a mock JSON
        // payload: Stripe's SDK deserializer rejects synthetic event JSON. The
        // signature-verification path is covered by unit tests and real deliveries.
        var result = await _webhookService.SimulateEventAsync(eventType, paymentIntentId, orderId, status);

        return Ok(new
        {
            message = "Stripe webhook simulation completed",
            eventType,
            orderId,
            success = result.Success,
            error = result.ErrorMessage
        });
    }

}

/// <summary>
/// Extension methods for HTTP request validation.
/// </summary>
internal static class WebhookRequestExtensions
{
    /// <summary>
    /// Checks if the request is from a local source (for development/testing).
    /// </summary>
    public static bool IsFromLocal(this HttpRequest request)
    {
        var remoteIp = request.HttpContext.Connection.RemoteIpAddress;
        if (remoteIp == null) return false;

        // Check for localhost (IPv4 and IPv6)
        return System.Net.IPAddress.IsLoopback(remoteIp);
    }
}
