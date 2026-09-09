using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository interface for menu data access.
/// </summary>
public interface IMenuRepository
{
    /// <summary>Gets the full menu with categories and items.</summary>
    Task<MenuResponseDto> GetFullMenuAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets all active categories ordered by display order.</summary>
    Task<List<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets menu items by category ID.</summary>
    Task<List<MenuItemSummaryDto>> GetItemsByCategoryAsync(int categoryId, CancellationToken cancellationToken = default);

    /// <summary>Gets a single menu item with full details including modifiers.</summary>
    Task<MenuItemDetailDto?> GetItemByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Searches menu items by name or description.</summary>
    Task<List<MenuItemSummaryDto>> SearchItemsAsync(string query, CancellationToken cancellationToken = default);

    /// <summary>Searches menu items with advanced filters and sorting options.</summary>
    Task<List<MenuItemSummaryDto>> SearchItemsAdvancedAsync(SearchParametersDto parameters, CancellationToken cancellationToken = default);

    /// <summary>Gets popular items across all categories.</summary>
    Task<List<MenuItemSummaryDto>> GetPopularItemsAsync(CancellationToken cancellationToken = default);

    /// <summary>Gets available items (for current order type).</summary>
    Task<List<MenuItemSummaryDto>> GetAvailableItemsAsync(CancellationToken cancellationToken = default);
}
