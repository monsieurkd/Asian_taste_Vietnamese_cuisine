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
