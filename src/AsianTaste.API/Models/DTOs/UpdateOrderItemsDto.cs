using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// A request to replace an order's contents — the "the customer rang and changed
/// their mind" path.
/// </summary>
/// <remarks>
/// Replaces the lines WHOLESALE rather than exposing add/remove operations. The console
/// shows the order as it should end up, so sending that is what the operator means;
/// a sequence of deltas would apply differently depending on the order it arrived in,
/// and a lost or retried request would leave a different order than the one on screen.
///
/// The CLIENT NEVER SENDS PRICES. It says which dish and how many; the server reads the
/// current menu and computes the money. A request that could name its own prices could
/// edit an order to any total it liked.
/// </remarks>
public class UpdateOrderItemsDto
{
    [Required]
    [MinLength(1, ErrorMessage = "An order needs at least one item. Cancel it instead.")]
    public List<UpdateOrderItemDto> Items { get; set; } = new();

    /// <summary>
    /// New pickup time, or null to leave the existing one alone.
    /// </summary>
    /// <remarks>
    /// Null means "unchanged" rather than "clear it", because an order always has a
    /// requested time — clearing it would leave the kitchen with no idea when the food
    /// is wanted.
    /// </remarks>
    public PickupTimeDto? PickupTime { get; set; }

    /// <summary>
    /// Why the order changed, for the kitchen's benefit and the audit trail.
    /// </summary>
    /// <remarks>
    /// Encouraged rather than required: an edited ticket that does not say why is how
    /// the kitchen ends up cooking from a printout that no longer matches the screen.
    /// </remarks>
    [StringLength(500)]
    public string? Reason { get; set; }
}

/// <summary>
/// One line of a replacement order.
/// </summary>
public class UpdateOrderItemDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Choose a dish.")]
    public int MenuItemId { get; set; }

    /// <summary>
    /// Upper bound matches the checkout's, so an edit cannot create a line the original
    /// order could never have carried.
    /// </summary>
    [Range(1, 10, ErrorMessage = "Quantity must be between 1 and 10.")]
    public int Quantity { get; set; } = 1;

    [StringLength(500)]
    public string? SpecialInstructions { get; set; }

    public List<int> ModifierIds { get; set; } = new();
}

/// <summary>
/// The result of editing an order.
/// </summary>
public class UpdateOrderItemsResponseDto
{
    public int OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;

    /// <summary>The recomputed figures, read back from the stored row.</summary>
    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }

    /// <summary>
    /// What the change did to the money, in words the operator can act on.
    /// </summary>
    /// <remarks>
    /// An edit that raises the total on an order whose card was already charged is the
    /// case that needs saying out loud: the customer now owes the difference, and
    /// nothing in this app will collect it. Leaving that implicit is how a shop quietly
    /// under-charges.
    /// </remarks>
    public string PaymentNote { get; set; } = string.Empty;

    /// <summary>True when the new total exceeds what was captured.</summary>
    public bool AmountDueAtCounter { get; set; }
}
