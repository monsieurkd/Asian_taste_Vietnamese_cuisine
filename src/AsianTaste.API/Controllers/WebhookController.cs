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
    private readonly IWebhookService _webhookService;

    public WebhookController(ILogger<WebhookController> logger, IWebhookService webhookService)
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
    /// Only available in development mode.
    /// </summary>
    /// <param name="eventType">Type of event to simulate (default: payment_intent.succeeded)</param>
    /// <returns>200 OK with simulation result</returns>
    [HttpPost("simulate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SimulateWebhook([FromQuery] string eventType = "payment_intent.succeeded")
    {
        if (!HttpContext.Request.IsFromLocal())
        {
            return Forbid();
        }

        // Create a mock Stripe event payload
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var orderId = 1; // Default test order ID
        var paymentIntentId = $"pi_test_{Guid.NewGuid():N}";

        string payload = eventType.ToLowerInvariant() switch
        {
            "payment_intent.succeeded" => CreateMockStripeEvent("payment_intent.succeeded", paymentIntentId, orderId, "succeeded"),
            "payment_intent.payment_failed" => CreateMockStripeEvent("payment_intent.payment_failed", paymentIntentId, orderId, "requires_payment_method"),
            "payment_intent.canceled" => CreateMockStripeEvent("payment_intent.canceled", paymentIntentId, orderId, "canceled"),
            "charge.refunded" => CreateMockRefundEvent(paymentIntentId),
            _ => CreateMockStripeEvent(eventType, paymentIntentId, orderId, "succeeded")
        };

        var testSignature = ComputeTestStripeSignature(payload, timestamp);

        _logger.LogInformation("Simulating Stripe webhook event: {EventType}", eventType);

        var result = await _webhookService.ProcessWebhookAsync(payload, testSignature);

        return Ok(new
        {
            message = "Stripe webhook simulation completed",
            eventType = eventType,
            success = result.Success,
            error = result.ErrorMessage
        });
    }

    /// <summary>
    /// Creates a mock Stripe event payload for testing.
    /// </summary>
    private string CreateMockStripeEvent(string eventType, string paymentIntentId, int orderId, string status)
    {
        var mockEvent = new
        {
            id = $"evt_test_{Guid.NewGuid():N}",
            @object = "event",
            api_version = "2020-08-27",
            created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            type = eventType,
            data = new
            {
                @object = "payment_intent",
                id = paymentIntentId,
                status = status,
                amount = 2550, // $25.50 in cents
                currency = "aud",
                metadata = new
                {
                    order_id = orderId.ToString(),
                    order_number = $"AT-{orderId:D6}"
                }
            }
        };

        return System.Text.Json.JsonSerializer.Serialize(mockEvent);
    }

    /// <summary>
    /// Creates a mock Stripe refund event payload for testing.
    /// </summary>
    private string CreateMockRefundEvent(string paymentIntentId)
    {
        var mockEvent = new
        {
            id = $"evt_test_{Guid.NewGuid():N}",
            @object = "event",
            api_version = "2020-08-27",
            created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            type = "charge.refunded",
            data = new
            {
                @object = "charge",
                id = $"ch_test_{Guid.NewGuid():N}",
                amount = 2550,
                amount_refunded = 2550,
                currency = "aud",
                payment_intent = paymentIntentId,
                refunded = true
            }
        };

        return System.Text.Json.JsonSerializer.Serialize(mockEvent);
    }

    /// <summary>
    /// Computes a test Stripe webhook signature for simulation.
    /// </summary>
    private string ComputeTestStripeSignature(string payload, long timestamp)
    {
        // For testing, we use the test webhook secret
        const string testSecret = "whsec_test_webhook_secret_for_development";
        var payloadToSign = $"{timestamp}.{payload}";

        using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(testSecret));
        var hash = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(payloadToSign));
        var signature = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();

        return $"t={timestamp},v1={signature}";
    }

    /// <summary>
    /// Computes a test signature for webhook simulation.
    /// In production, this would use the actual webhook secret.
    /// </summary>
    private string ComputeTestSignature(string payload)
    {
        // For testing, we use a fixed test secret
        const string testSecret = "test_webhook_secret_for_development";
        using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(testSecret));
        var hash = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(payload));
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
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
