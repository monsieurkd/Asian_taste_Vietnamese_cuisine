namespace AsianTaste.API.Services.Payment;

/// <summary>
/// Stripe payment gateway configuration.
/// Loaded from the "Stripe" section in appsettings.json.
/// </summary>
public class StripeConfiguration
{
    /// <summary>
    /// Stripe secret key (starts with sk_test_ for test mode, sk_live_ for production).
    /// Used for server-side API calls.
    /// </summary>
    public string SecretKey { get; set; } = string.Empty;

    /// <summary>
    /// Stripe publishable key (starts with pk_test_ for test mode, pk_live_ for production).
    /// Safe to expose to frontend.
    /// </summary>
    public string PublishableKey { get; set; } = string.Empty;

    /// <summary>
    /// Webhook signing secret for verifying Stripe webhook signatures.
    /// Starts with whsec_.
    /// </summary>
    public string WebhookSecret { get; set; } = string.Empty;

    /// <summary>
    /// Currency code for payments (default: aud for Australian Dollars).
    /// </summary>
    public string Currency { get; set; } = "aud";

    /// <summary>
    /// Validates that required configuration is present.
    /// </summary>
    public bool IsValid()
    {
        return !string.IsNullOrEmpty(SecretKey) &&
               !string.IsNullOrEmpty(PublishableKey);
    }

    /// <summary>
    /// Checks if the configuration is in test mode.
    /// </summary>
    public bool IsTestMode()
    {
        return SecretKey.StartsWith("sk_test_", StringComparison.OrdinalIgnoreCase);
    }
}
