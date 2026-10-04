using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// A request to move an order's promised pickup time, and nothing else.
/// </summary>
/// <remarks>
/// Separate from <see cref="UpdateOrderItemsDto"/> on purpose. Changing the contents of
/// an order REPLACES its lines — delete and re-insert — which wipes the kitchen's per-dish
/// ticks, cook state and notes. Moving the time is the small, common act ("the customer is
/// running late"); it must not cost the ticket its place on the line. This request carries
/// no items at all, so it cannot.
/// </remarks>
public class SetPickupTimeDto
{
    /// <summary>The new promised time, judged by the checkout's trading rule.</summary>
    [Required]
    public PickupTimeDto PickupTime { get; set; } = new();

    /// <summary>Why the time moved, for the kitchen's benefit and the audit trail.</summary>
    [StringLength(500)]
    public string? Reason { get; set; }
}

/// <summary>
/// The stored result of moving a pickup time.
/// </summary>
public class PickupTimeResponseDto
{
    public int OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;

    /// <summary>The promised time as stored, in UTC.</summary>
    public DateTime RequestedTime { get; set; }

    /// <summary>True when a specific time was chosen rather than "as soon as possible".</summary>
    public bool IsScheduled { get; set; }
}
