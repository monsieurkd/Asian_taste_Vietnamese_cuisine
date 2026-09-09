namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Data transfer object for modifiers (individual options).
/// </summary>
public class ModifierDto
{
    public int Id { get; set; }
    public int ModifierGroupId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal PriceAdjustment { get; set; }
    public bool IsDefault { get; set; }
    public int DisplayOrder { get; set; }
}

/// <summary>
/// Data transfer object for modifier groups (e.g., "Choose your drink").
/// </summary>
public class ModifierGroupDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsRequired { get; set; }
    public int MinSelect { get; set; }
    public int MaxSelect { get; set; }
    public int MinRequired { get; set; }
    public int MaxAllowed { get; set; }
    public int DisplayOrder { get; set; }
    public List<ModifierDto> Modifiers { get; set; } = new();
}
