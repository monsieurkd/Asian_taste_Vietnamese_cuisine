using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Synchronization status for orders with external systems (Lightspeed POS).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SyncStatus
{
    /// <summary>Order has not been synced to external system yet.</summary>
    NotSynced = 0,

    /// <summary>Order is pending sync to external system.</summary>
    Pending = 1,

    /// <summary>Order successfully synced to external system.</summary>
    Synced = 2,

    /// <summary>Order sync failed.</summary>
    Failed = 3,

    /// <summary>Order sync is in progress.</summary>
    InProgress = 4
}
