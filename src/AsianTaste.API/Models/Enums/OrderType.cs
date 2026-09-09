using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Defines how the customer will receive their order.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OrderType
{
    /// <summary>Customer picks up the order at the restaurant.</summary>
    Pickup = 0,

    /// <summary>Customer dines in at the restaurant.</summary>
    DineIn = 1
}
