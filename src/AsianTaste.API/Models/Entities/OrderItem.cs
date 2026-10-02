namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a single menu item within an order.
/// </summary>
public class OrderItem
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Foreign key to the order.</summary>
    public int OrderId { get; set; }

    /// <summary>Foreign key to the menu item (for reference).</summary>
    public int MenuItemId { get; set; }

    /// <summary>Denormalized menu item name (preserves history if item is renamed).</summary>
    public string MenuItemName { get; set; } = string.Empty;

    /// <summary>Number of items ordered.</summary>
    public int Quantity { get; set; }

    /// <summary>Unit price at time of order (preserves history if price changes).</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Total price for this line item (UnitPrice + modifiers) * Quantity.</summary>
    public decimal TotalPrice { get; set; }

    /// <summary>Customer's special instructions for this item.</summary>
    public string? SpecialInstructions { get; set; }

    /// <summary>
    /// True once a cook has marked this dish done on the kitchen board.
    /// </summary>
    /// <remarks>
    /// A pass mark, not a fulfilment status. It is deliberately reversible: the board
    /// lets a mistap be taken back, and unticking a line does not move the order
    /// backwards. The rule for what the tick MEANS (an order whose every line is
    /// ticked is ready, and the customer is told once) lives in OrderService — this
    /// column only records the fact.
    /// </remarks>
    public bool IsCompleted { get; set; }

    /// <summary>When the line was ticked, or null while it is still to be cooked.</summary>
    public DateTime? CompletedAt { get; set; }

    /// <summary>
    /// The kitchen's working state for this dish: Queued, Cooking or Done.
    /// </summary>
    /// <remarks>
    /// Stored as text to mirror the `cook_state` column, which is a VARCHAR with a CHECK
    /// rather than a Postgres enum — an enum needs ALTER TYPE, which cannot run inside the
    /// migration service's transaction. Kept in step with <see cref="IsCompleted"/> at the
    /// write, so the older boolean path keeps working and the two cannot disagree.
    /// </remarks>
    public string CookState { get; set; } = "Queued";

    /// <summary>When a cook started this dish. Set once, and not cleared when it finishes.</summary>
    public DateTime? StartedAt { get; set; }

    /// <summary>Who started, then finished, this dish. A username, denormalised on purpose.</summary>
    public string? CookedBy { get; set; }

    /// <summary>A note written BY the kitchen about this dish — not the customer's instructions.</summary>
    public string? KitchenNote { get; set; }

    /// <summary>Who wrote the kitchen note.</summary>
    public string? NoteBy { get; set; }

    // ==================== LIGHTSPEED SYNC FIELDS (Phase 3) ====================

    /// <summary>Lightspeed product ID for this order line item.</summary>
    public int? LightspeedProductId { get; set; }

    // ==================== NAVIGATION PROPERTIES ====================

    /// <summary>Navigation property to the order.</summary>
    public Order? Order { get; set; }

    /// <summary>Navigation property to selected modifiers.</summary>
    public List<OrderItemModifier> Modifiers { get; set; } = new();
}
