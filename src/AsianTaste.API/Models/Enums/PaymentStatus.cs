using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Payment status throughout the payment lifecycle.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PaymentStatus
{
    /// <summary>Payment initiated but not yet processed.</summary>
    Pending = 0,

    /// <summary>Payment is being processed by the gateway.</summary>
    Processing = 1,

    /// <summary>Payment completed successfully.</summary>
    Succeeded = 2,

    /// <summary>Payment failed.</summary>
    Failed = 3,

    /// <summary>Payment fully refunded.</summary>
    Refunded = 4,

    /// <summary>Payment partially refunded.</summary>
    PartiallyRefunded = 5,

    /// <summary>Payment requires additional action (3D Secure, etc.).</summary>
    RequiresAction = 6,

    /// <summary>Payment was canceled.</summary>
    Canceled = 7
}
