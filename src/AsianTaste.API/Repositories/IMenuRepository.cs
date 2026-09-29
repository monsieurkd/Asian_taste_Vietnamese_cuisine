using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Repositories;

/// <summary>
/// The editable fields of a dish.
///
/// A dedicated type rather than the request DTO, so the repository's contract is not
/// tied to the shape of one HTTP request — and so a future caller (an import, a POS
/// sync) is not forced to invent DTO fields it does not have.
///
/// Every property is nullable and means "leave this alone when null". That is what
/// makes a partial edit safe: the console sends only what changed, and a field the
/// screen did not render cannot be blanked by accident.
/// </summary>
public record MenuItemUpdate
{
    public string? Name { get; init; }
    public string? Description { get; init; }
    public decimal? BasePrice { get; init; }
    public int? CategoryId { get; init; }
    public string? ImageUrl { get; init; }

    public bool? IsAvailable { get; init; }
    public bool? IsPopular { get; init; }
    public bool? IsGlutenFree { get; init; }
    public bool? IsVegetarian { get; init; }
    public bool? IsVegan { get; init; }
    public int? SpicyLevel { get; init; }
}

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

    // ── Writes ───────────────────────────────────────────────────────────────
    //
    // These exist because the admin controller advertised them and implemented none:
    // ten endpoints logged "Updating menu item" and returned 204 WITHOUT writing a row.
    // A switch that reports success and changes nothing is worse than an absent
    // feature — the owner believes the price is updated and finds out from a customer.

    /// <summary>
    /// Sets whether a dish can be ordered, and returns false when the dish does not exist.
    /// </summary>
    /// <remarks>
    /// Availability rather than deletion is the common case: the kitchen runs out of a
    /// dish and wants it off the menu for the rest of service, not gone.
    /// </remarks>
    Task<bool> SetItemAvailabilityAsync(int id, bool isAvailable, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the fields a printed-menu change actually touches: name, description,
    /// price, category, image and the dietary flags.
    /// </summary>
    /// <returns>The updated dish, or null when it does not exist.</returns>
    Task<MenuItemDetailDto?> UpdateItemAsync(int id, MenuItemUpdate update, CancellationToken cancellationToken = default);

    /// <summary>
    /// Current name and price for a set of dishes, for re-pricing an existing order.
    /// </summary>
    /// <remarks>
    /// Needed by order editing, which must price the replacement lines from the CURRENT
    /// menu rather than from whatever the client claims. A caller that could name its own
    /// prices could edit an order to any total it liked.
    /// </remarks>
    Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(
        IReadOnlyCollection<int> menuItemIds,
        CancellationToken cancellationToken = default);
}
