using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Services.Payment;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for Stripe-related endpoints.
/// Provides configuration and setup information for the frontend.
/// </summary>
[ApiController]
[Route("api/stripe")]
public class StripeController : ControllerBase
{
    private readonly StripeConfiguration _config;
    private readonly ILogger<StripeController> _logger;

    public StripeController(
        StripeConfiguration config,
        ILogger<StripeController> logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Gets Stripe configuration for the frontend.
    /// GET: /api/stripe/config
    /// Returns the publishable key needed to initialize Stripe.js on the client.
    /// </summary>
    /// <returns>Stripe configuration with publishable key.</returns>
    [HttpGet("config")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public IActionResult GetStripeConfig()
    {
        try
        {
            // Only return the publishable key (safe to expose to frontend)
            // Never return the secret key
            return Ok(new
            {
                publishableKey = _config.PublishableKey,
                currency = _config.Currency,
                isTestMode = _config.IsTestMode()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving Stripe configuration");
            return StatusCode(500, new { error = "Failed to retrieve payment configuration" });
        }
    }

    /// <summary>
    /// Validates Stripe configuration status.
    /// GET: /api/stripe/status
    /// Can be used to check if Stripe is properly configured.
    /// </summary>
    /// <returns>Status indicating if Stripe is configured and ready.</returns>
    [HttpGet("status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult GetStripeStatus()
    {
        var isValid = _config.IsValid();

        return Ok(new
        {
            isConfigured = isValid,
            hasSecretKey = !string.IsNullOrEmpty(_config.SecretKey),
            hasPublishableKey = !string.IsNullOrEmpty(_config.PublishableKey),
            hasWebhookSecret = !string.IsNullOrEmpty(_config.WebhookSecret),
            currency = _config.Currency,
            isTestMode = _config.IsTestMode()
        });
    }
}
