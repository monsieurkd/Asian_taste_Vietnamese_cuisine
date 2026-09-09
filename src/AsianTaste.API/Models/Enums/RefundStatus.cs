using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// Refund status for payment refunds.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RefundStatus
{
    /// <summary>Refund initiated.</summary>
    Pending = 0,

    /// <summary>Refund completed successfully.</summary>
    Succeeded = 1,

    /// <summary>Refund failed.</summary>
    Failed = 2
}
