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

    // ==================== LIGHTSPEED SYNC FIELDS (Phase 3) ====================

    /// <summary>Lightspeed product ID for this order line item.</summary>
    public int? LightspeedProductId { get; set; }

    // ==================== NAVIGATION PROPERTIES ====================

    /// <summary>Navigation property to the order.</summary>
    public Order? Order { get; set; }

    /// <summary>Navigation property to selected modifiers.</summary>
    public List<OrderItemModifier> Modifiers { get; set; } = new();
}
