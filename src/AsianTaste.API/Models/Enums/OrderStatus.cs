using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Represents the current state of an order in the fulfillment process.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OrderStatus
{
    /// <summary>Order received, awaiting confirmation.</summary>
    Pending = 0,

    /// <summary>Order accepted by restaurant.</summary>
    Confirmed = 1,

    /// <summary>Order is being prepared.</summary>
    Preparing = 2,

    /// <summary>Order is ready for pickup/dining.</summary>
    Ready = 3,

    /// <summary>Order has been completed.</summary>
    Completed = 4,

    /// <summary>Order was cancelled.</summary>
    Cancelled = 5
}
