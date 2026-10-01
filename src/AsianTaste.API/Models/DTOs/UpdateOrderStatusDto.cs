using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// DTO for updating order status.
/// </summary>
public class UpdateOrderStatusDto
{
    /// <summary>New order status.</summary>
    [Required(ErrorMessage = "Status is required")]
    public string Status { get; set; } = string.Empty;

    /// <summary>Optional reason for status change (required for cancellation).</summary>
    public string? Reason { get; set; }
}

/// <summary>
/// DTO for ticking one dish off, or putting it back on the cook's list.
/// </summary>
public class SetOrderItemCompletedDto
{
    /// <summary>
    /// The state the line should be in. Sent rather than assumed, because the control is
    /// a toggle: unticking is how a mistap is taken back, and it has to be sayable.
    /// </summary>
    public bool IsCompleted { get; set; }
}
