using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Represents available payment methods for orders.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PaymentMethod
{
    /// <summary>Pay with credit/debit card online.</summary>
    Card = 0,

    /// <summary>Pay with cash on pickup.</summary>
    Cash = 1
}
