namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Response DTO for the full menu with categories and items.
/// </summary>
public class MenuResponseDto
{
    public List<CategoryWithItemsDto> Categories { get; set; } = new();
}

/// <summary>
/// Category with its associated menu items.
/// </summary>
public class CategoryWithItemsDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public List<MenuItemSummaryDto> Items { get; set; } = new();
}

/// <summary>
/// Response DTO for a single menu item with full details including modifiers.
/// </summary>
public class MenuItemDetailDto
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal BasePrice { get; set; }
    public decimal Price { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsAvailable { get; set; }
    public bool IsActive { get; set; }
    public bool IsPopular { get; set; }
    public bool IsGlutenFree { get; set; }
    public bool IsVegetarian { get; set; }
    public bool IsVegan { get; set; }
    public bool IsSpicy { get; set; }
    public int SpicyLevel { get; set; }
    public List<ModifierGroupDto> ModifierGroups { get; set; } = new();
}
