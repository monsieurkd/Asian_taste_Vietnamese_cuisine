namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Parameters for advanced menu item search.
/// </summary>
public class SearchParametersDto
{
    /// <summary>
    /// Search query for name, description, or modifier names.
    /// </summary>
    public string Query { get; set; } = string.Empty;

    /// <summary>
    /// Sort by field: 'name', 'price', 'popularity', 'spicy'.
    /// Default: 'relevance' (prioritizes name matches).
    /// </summary>
    public string? SortBy { get; set; }

    /// <summary>
    /// Sort order: 'asc' or 'desc'.
    /// Default: 'asc'.
    /// </summary>
    public string? SortOrder { get; set; }

    /// <summary>
    /// Filter by dietary preference: 'vegetarian', 'vegan', 'glutenFree'.
    /// </summary>
    public string? Dietary { get; set; }

    /// <summary>
    /// Minimum price filter.
    /// </summary>
    public decimal? MinPrice { get; set; }

    /// <summary>
    /// Maximum price filter.
    /// </summary>
    public decimal? MaxPrice { get; set; }

    /// <summary>
    /// Minimum spicy level filter (0-3).
    /// </summary>
    public int? MinSpicyLevel { get; set; }

    /// <summary>
    /// Maximum spicy level filter (0-3).
    /// </summary>
    public int? MaxSpicyLevel { get; set; }

    /// <summary>
    /// Filter by category ID.
    /// </summary>
    public int? CategoryId { get; set; }

    /// <summary>
    /// Only show popular items.
    /// </summary>
    public bool? OnlyPopular { get; set; }

    /// <summary>
    /// Include items where the modifier names match the query.
    /// </summary>
    public bool? IncludeModifiers { get; set; }
}
