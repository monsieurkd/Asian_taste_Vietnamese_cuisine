namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a menu category (e.g., "Banh Mi", "Noodle Soup").
/// </summary>
public class Category
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Category display name (e.g., "Banh Mi Vietnamese Meat Rolls").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of the category.</summary>
    public string? Description { get; set; }

    /// <summary>Order in which categories are displayed on the menu.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Whether this category is currently active/visible.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Navigation property to menu items in this category.</summary>
    public List<MenuItem> MenuItems { get; set; } = new();
}
