namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Data transfer object for menu items.
/// </summary>
public class MenuItemDto
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsAvailable { get; set; }
    public bool IsPopular { get; set; }
    public bool IsGlutenFree { get; set; }
    public bool IsVegetarian { get; set; }
    public bool IsVegan { get; set; }
    public int SpicyLevel { get; set; }
    public List<ModifierGroupDto> ModifierGroups { get; set; } = new();
}

/// <summary>
/// Simplified DTO for menu listing (without full modifier details).
/// </summary>
public class MenuItemSummaryDto
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsAvailable { get; set; }
    public bool IsPopular { get; set; }
    public bool IsGlutenFree { get; set; }
    public bool IsVegetarian { get; set; }
    public bool IsVegan { get; set; }
    public int SpicyLevel { get; set; }
    public bool HasModifiers { get; set; }
}
