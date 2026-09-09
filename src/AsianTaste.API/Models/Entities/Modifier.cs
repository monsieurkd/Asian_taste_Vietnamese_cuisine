namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a single modifier option within a modifier group.
/// </summary>
public class Modifier
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Foreign key to the modifier group this belongs to.</summary>
    public int ModifierGroupId { get; set; }

    /// <summary>Option name (e.g., "Coke", "Extra Cheese").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Price adjustment added to base price (can be negative for discount).</summary>
    public decimal PriceAdjustment { get; set; }

    /// <summary>Whether this modifier is currently available.</summary>
    public bool IsAvailable { get; set; } = true;

    /// <summary>Display order within the group.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Navigation property to the modifier group.</summary>
    public ModifierGroup? ModifierGroup { get; set; }
}
