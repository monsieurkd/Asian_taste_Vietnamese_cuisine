using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// DTOs for admin menu management operations.
/// </summary>

// ==================== CATEGORY DTOs ====================

/// <summary>
/// DTO for creating a new category.
/// </summary>
public class CreateCategoryDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }

    public int? DisplayOrder { get; set; }
}

/// <summary>
/// DTO for updating an existing category.
/// </summary>
public class UpdateCategoryDto
{
    [Required]
    [StringLength(100)]
    public string? Name { get; set; }

    [StringLength(500)]
    public string? Description { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsActive { get; set; }
}

// ==================== MENU ITEM DTOs ====================

/// <summary>
/// DTO for creating a new menu item.
/// </summary>
public class CreateMenuItemDto
{
    [Required]
    [StringLength(255)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Required]
    [Range(0.01, 9999.99)]
    public decimal Price { get; set; }

    [Required]
    public int CategoryId { get; set; }

    [StringLength(500)]
    public string? ImageUrl { get; set; }

    public bool? IsActive { get; set; }

    public bool? IsSpicy { get; set; }

    public int? SpicyLevel { get; set; }

    public bool? IsVegetarian { get; set; }

    public bool? IsVegan { get; set; }

    public bool? IsGlutenFree { get; set; }

    public string? CategoryName { get; set; }

    public List<CreateModifierGroupDto>? ModifierGroups { get; set; }
}

/// <summary>
/// DTO for updating an existing menu item.
/// </summary>
public class UpdateMenuItemDto
{
    [StringLength(255)]
    public string? Name { get; set; }

    [StringLength(1000)]
    public string? Description { get; set; }

    [Range(0.01, 9999.99)]
    public decimal? Price { get; set; }

    public int? CategoryId { get; set; }

    [StringLength(500)]
    public string? ImageUrl { get; set; }

    public bool? IsActive { get; set; }

    public bool? IsSpicy { get; set; }

    public int? SpicyLevel { get; set; }

    public bool? IsVegetarian { get; set; }

    public bool? IsVegan { get; set; }

    public bool? IsGlutenFree { get; set; }

    public List<UpdateModifierGroupDto>? ModifierGroups { get; set; }
}

/// <summary>
/// DTO for toggling item availability.
/// </summary>
public class ToggleAvailabilityDto
{
    public bool IsActive { get; set; }
}

// ==================== MODIFIER GROUP DTOs ====================

/// <summary>
/// DTO for creating a new modifier group.
/// </summary>
public class CreateModifierGroupDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 10)]
    public int? MinRequired { get; set; }

    [Range(1, 10)]
    public int? MaxAllowed { get; set; }

    public int? DisplayOrder { get; set; }

    public List<CreateModifierDto>? Modifiers { get; set; }
}

/// <summary>
/// DTO for updating a modifier group.
/// </summary>
public class UpdateModifierGroupDto
{
    [StringLength(100)]
    public string? Name { get; set; }

    [Range(0, 10)]
    public int? MinRequired { get; set; }

    [Range(1, 10)]
    public int? MaxAllowed { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsActive { get; set; }
}

// ==================== MODIFIER DTOs ====================

/// <summary>
/// DTO for creating a new modifier.
/// </summary>
public class CreateModifierDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 99.99)]
    public decimal? PriceAdjustment { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsDefault { get; set; }
}

/// <summary>
/// DTO for updating a modifier.
/// </summary>
public class UpdateModifierDto
{
    [StringLength(100)]
    public string? Name { get; set; }

    [Range(0, 99.99)]
    public decimal? PriceAdjustment { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsDefault { get; set; }

    public bool? IsActive { get; set; }
}
