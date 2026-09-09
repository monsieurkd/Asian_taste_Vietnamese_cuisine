using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a single menu item that customers can order.
/// </summary>
public class MenuItem
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Foreign key to the category this item belongs to.</summary>
    public int CategoryId { get; set; }

    /// <summary>Item name (e.g., "Crispy Pork Roll").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of the item.</summary>
    public string? Description { get; set; }

    /// <summary>Base price in AUD (e.g., 10.50).</summary>
    public decimal BasePrice { get; set; }

    /// <summary>Optional URL to the item's image.</summary>
    public string? ImageUrl { get; set; }

    /// <summary>Whether this item is currently available for ordering.</summary>
    public bool IsAvailable { get; set; } = true;

    /// <summary>Whether to show "Popular" badge on this item.</summary>
    public bool IsPopular { get; set; }

    /// <summary>Whether this item is gluten-free.</summary>
    public bool IsGlutenFree { get; set; }

    /// <summary>Spicy level from 0 (none) to 3 (very hot).</summary>
    public int SpicyLevel { get; set; }

    /// <summary>Whether this item is vegetarian.</summary>
    public bool IsVegetarian { get; set; }

    /// <summary>Whether this item is vegan.</summary>
    public bool IsVegan { get; set; }

    /// <summary>Navigation property to the category.</summary>
    public Category? Category { get; set; }

    /// <summary>Navigation property to modifier groups (customization options).</summary>
    public List<ModifierGroup> ModifierGroups { get; set; } = new();
}
