namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a modifier selected for an order item.
/// </summary>
public class OrderItemModifier
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Foreign key to the order item.</summary>
    public int OrderItemId { get; set; }

    /// <summary>Foreign key to the modifier (for reference).</summary>
    public int ModifierId { get; set; }

    /// <summary>Denormalized modifier name (preserves history).</summary>
    public string ModifierName { get; set; } = string.Empty;

    /// <summary>Price adjustment at time of order (preserves history).</summary>
    public decimal PriceAdjustment { get; set; }

    /// <summary>Navigation property to the order item.</summary>
    public OrderItem? OrderItem { get; set; }
}
