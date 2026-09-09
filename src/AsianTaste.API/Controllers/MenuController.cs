using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Repositories;
using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for menu operations.
/// </summary>
[ApiController]
[Route("api/menu")]
[Produces("application/json")]
public class MenuController : ControllerBase
{
    private readonly IMenuRepository _menuRepository;
    private readonly ILogger<MenuController> _logger;

    public MenuController(IMenuRepository menuRepository, ILogger<MenuController> logger)
    {
        _menuRepository = menuRepository;
        _logger = logger;
    }

    /// <summary>
    /// Gets the full menu with all categories and items.
    /// </summary>
    /// <response code="200">Returns the full menu</response>
    [HttpGet]
    [ProducesResponseType(typeof(MenuResponseDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<MenuResponseDto>> GetFullMenu(CancellationToken cancellationToken)
    {
        try
        {
            var menu = await _menuRepository.GetFullMenuAsync(cancellationToken);
            return Ok(menu);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving full menu");
            return StatusCode(500, new { error = "An error occurred while retrieving the menu" });
        }
    }

    /// <summary>
    /// Gets all active menu categories.
    /// </summary>
    /// <response code="200">Returns list of categories</response>
    [HttpGet("categories")]
    [ProducesResponseType(typeof(List<CategoryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<CategoryDto>>> GetCategories(CancellationToken cancellationToken)
    {
        try
        {
            var categories = await _menuRepository.GetCategoriesAsync(cancellationToken);
            return Ok(categories);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving categories");
            return StatusCode(500, new { error = "An error occurred while retrieving categories" });
        }
    }

    /// <summary>
    /// Gets menu items for a specific category.
    /// </summary>
    /// <param name="categoryId">The category ID</param>
    /// <response code="200">Returns list of menu items</response>
    /// <response code="404">Category not found</response>
    [HttpGet("categories/{categoryId}/items")]
    [ProducesResponseType(typeof(List<MenuItemSummaryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<MenuItemSummaryDto>>> GetItemsByCategory(
        int categoryId,
        CancellationToken cancellationToken)
    {
        try
        {
            var items = await _menuRepository.GetItemsByCategoryAsync(categoryId, cancellationToken);
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving items for category {CategoryId}", categoryId);
            return StatusCode(500, new { error = "An error occurred while retrieving menu items" });
        }
    }

    /// <summary>
    /// Gets a single menu item with full details including modifiers.
    /// </summary>
    /// <param name="id">The menu item ID</param>
    /// <response code="200">Returns the menu item details</response>
    /// <response code="404">Menu item not found</response>
    [HttpGet("items/{id}")]
    [ProducesResponseType(typeof(MenuItemDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MenuItemDetailDto>> GetItemById(
        int id,
        CancellationToken cancellationToken)
    {
        try
        {
            var item = await _menuRepository.GetItemByIdAsync(id, cancellationToken);
            if (item == null)
            {
                return NotFound(new { error = $"Menu item with ID {id} not found" });
            }
            return Ok(item);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving menu item {ItemId}", id);
            return StatusCode(500, new { error = "An error occurred while retrieving the menu item" });
        }
    }

    /// <summary>
    /// Searches menu items by name or description.
    /// </summary>
    /// <param name="q">The search query</param>
    /// <response code="200">Returns list of matching menu items</response>
    [HttpGet("search")]
    [ProducesResponseType(typeof(List<MenuItemSummaryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<MenuItemSummaryDto>>> SearchItems(
        [FromQuery(Name = "q")] string query,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { error = "Search query 'q' is required" });
        }

        try
        {
            var items = await _menuRepository.SearchItemsAsync(query, cancellationToken);
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching menu items with query {Query}", query);
            return StatusCode(500, new { error = "An error occurred while searching menu items" });
        }
    }

    /// <summary>
    /// Searches menu items with advanced filters and sorting options.
    /// </summary>
    /// <param name="q">Search query for name, description, or modifier names</param>
    /// <param name="sortBy">Sort by: 'name', 'price', 'popularity', 'spicy', 'relevance' (default)</param>
    /// <param name="sortOrder">Sort order: 'asc' (default) or 'desc'</param>
    /// <param name="dietary">Dietary filter: 'vegetarian', 'vegan', 'glutenFree'</param>
    /// <param name="minPrice">Minimum price filter</param>
    /// <param name="maxPrice">Maximum price filter</param>
    /// <param name="minSpicyLevel">Minimum spicy level (0-3)</param>
    /// <param name="maxSpicyLevel">Maximum spicy level (0-3)</param>
    /// <param name="categoryId">Filter by category ID</param>
    /// <param name="onlyPopular">Only show popular items</param>
    /// <param name="includeModifiers">Include items where modifier names match the query</param>
    /// <response code="200">Returns list of matching menu items</response>
    [HttpGet("search/advanced")]
    [ProducesResponseType(typeof(List<MenuItemSummaryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<MenuItemSummaryDto>>> SearchItemsAdvanced(
        [FromQuery(Name = "q")] string? query,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] string? dietary,
        [FromQuery] decimal? minPrice,
        [FromQuery] decimal? maxPrice,
        [FromQuery] int? minSpicyLevel,
        [FromQuery] int? maxSpicyLevel,
        [FromQuery] int? categoryId,
        [FromQuery] bool? onlyPopular,
        [FromQuery] bool? includeModifiers,
        CancellationToken cancellationToken)
    {
        try
        {
            var parameters = new SearchParametersDto
            {
                Query = query ?? string.Empty,
                SortBy = sortBy,
                SortOrder = sortOrder,
                Dietary = dietary,
                MinPrice = minPrice,
                MaxPrice = maxPrice,
                MinSpicyLevel = minSpicyLevel,
                MaxSpicyLevel = maxSpicyLevel,
                CategoryId = categoryId,
                OnlyPopular = onlyPopular,
                IncludeModifiers = includeModifiers ?? true // Default to true for advanced search
            };

            var items = await _menuRepository.SearchItemsAdvancedAsync(parameters, cancellationToken);
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in advanced search with query {Query}", query);
            return StatusCode(500, new { error = "An error occurred while searching menu items" });
        }
    }

    /// <summary>
    /// Gets popular items across all categories.
    /// </summary>
    /// <response code="200">Returns list of popular menu items</response>
    [HttpGet("popular")]
    [ProducesResponseType(typeof(List<MenuItemSummaryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<MenuItemSummaryDto>>> GetPopularItems(CancellationToken cancellationToken)
    {
        try
        {
            var items = await _menuRepository.GetPopularItemsAsync(cancellationToken);
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving popular items");
            return StatusCode(500, new { error = "An error occurred while retrieving popular items" });
        }
    }
}
