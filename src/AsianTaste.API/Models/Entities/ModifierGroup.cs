namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a group of modifier options (e.g., "Choose your drink", "Add extras").
/// </summary>
public class ModifierGroup
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Foreign key to the menu item this group belongs to.</summary>
    public int MenuItemId { get; set; }

    /// <summary>Group name displayed to customer (e.g., "Choose your drink").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Whether customer must select at least MinSelect options.</summary>
    public bool IsRequired { get; set; }

    /// <summary>Minimum number of options customer must select.</summary>
    public int MinSelect { get; set; } = 1;

    /// <summary>Maximum number of options customer can select.</summary>
    public int MaxSelect { get; set; } = 1;

    /// <summary>Display order for this group.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Navigation property to the menu item.</summary>
    public MenuItem? MenuItem { get; set; }

    /// <summary>Navigation property to available modifiers in this group.</summary>
    public List<Modifier> Modifiers { get; set; } = new();
}
