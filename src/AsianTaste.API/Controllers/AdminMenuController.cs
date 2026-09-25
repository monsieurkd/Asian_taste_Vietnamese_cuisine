using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Repositories;
using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for admin menu management operations (CRUD).
/// </summary>
[ApiController]
[Route("api/admin/menu")]
[Authorize]
[Produces("application/json")]
public class AdminMenuController : ControllerBase
{
    private readonly IMenuRepository _menuRepository;
    private readonly ILogger<AdminMenuController> _logger;

    public AdminMenuController(IMenuRepository menuRepository, ILogger<AdminMenuController> logger)
    {
        _menuRepository = menuRepository;
        _logger = logger;
    }

    // ==================== CATEGORIES ====================

    /// <summary>
    /// Gets all categories for admin management.
    /// </summary>
    [HttpGet("categories")]
    [ProducesResponseType(typeof(List<CategoryDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<CategoryDto>>> GetCategoriesAdmin(CancellationToken cancellationToken)
    {
        try
        {
            var categories = await _menuRepository.GetCategoriesAsync(cancellationToken);
            return Ok(categories);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving admin categories");
            return StatusCode(500, new { error = "An error occurred while retrieving categories" });
        }
    }

    /// <summary>
    /// Creates a new category.
    /// </summary>
    [HttpPost("categories")]
    [ProducesResponseType(typeof(CategoryDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CategoryDto>> CreateCategory(
        [FromBody] CreateCategoryDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            // Validate required fields
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { error = "Category name is required" });
            }

            // Use the repository to create the category
            // For now, we'll return a success response
            // TODO: Implement IMenuRepository.CreateCategoryAsync
            _logger.LogInformation("Creating new category: {Name}", dto.Name);

            var newCategory = new CategoryDto
            {
                Id = 0, // Will be set by database
                Name = dto.Name,
                Description = dto.Description,
                DisplayOrder = dto.DisplayOrder ?? 0,
                IsActive = true
            };

            // Return created category (implementation would need DB insert)
            return Created($"api/admin/menu/categories/{newCategory.Id}", newCategory);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating category");
            return StatusCode(500, new { error = "An error occurred while creating category" });
        }
    }

    /// <summary>
    /// Updates an existing category.
    /// </summary>
    [HttpPut("categories/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> UpdateCategory(
            int id,
            [FromBody] UpdateCategoryDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Implement IMenuRepository.UpdateCategoryAsync
            _logger.LogInformation("Updating category {CategoryId}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category {CategoryId}", id);
            return StatusCode(500, new { error = "An error occurred while updating category" });
        }
    }

    /// <summary>
    /// Deletes a category.
    /// </summary>
    [HttpDelete("categories/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> DeleteCategory(
            int id,
            CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Implement IMenuRepository.DeleteCategoryAsync
            _logger.LogInformation("Deleting category {CategoryId}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting category {CategoryId}", id);
            return StatusCode(500, new { error = "An error occurred while deleting category" });
        }
    }

    // ==================== MENU ITEMS ====================

    /// <summary>
    /// Gets all menu items for admin management.
    /// </summary>
    [HttpGet("items")]
    [ProducesResponseType(typeof(List<MenuItemDetailDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<MenuItemDetailDto>>> GetAllMenuItemsAdmin(
            [FromQuery] int? categoryId,
            CancellationToken cancellationToken)
    {
        try
        {
            // Get all items, optionally filtered by category
            // TODO: Add IMenuRepository.GetAllItemsForAdminAsync
            var items = categoryId.HasValue
                ? await _menuRepository.GetItemsByCategoryAsync(categoryId.Value, cancellationToken)
                : await _menuRepository.GetPopularItemsAsync(cancellationToken); // Temporary - using popular items

            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving admin menu items");
            return StatusCode(500, new { error = "An error occurred while retrieving menu items" });
        }
    }

    /// <summary>
    /// Gets a single menu item by ID with all details.
    /// </summary>
    [HttpGet("items/{id}")]
    [ProducesResponseType(typeof(MenuItemDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MenuItemDetailDto>> GetMenuItemById(
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
            return StatusCode(500, new { error = "An error occurred while retrieving menu item" });
        }
    }

    /// <summary>
    /// Creates a new menu item.
    /// </summary>
    [HttpPost("items")]
    [ProducesResponseType(typeof(MenuItemDetailDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MenuItemDetailDto>> CreateMenuItem(
            [FromBody] CreateMenuItemDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            // Validate required fields
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { error = "Menu item name is required" });
            }
            if (dto.Price <= 0)
            {
                return BadRequest(new { error = "Price must be greater than zero" });
            }
            if (dto.CategoryId <= 0)
            {
                return BadRequest(new { error = "Valid category ID is required" });
            }

            // TODO: Implement IMenuRepository.CreateMenuItemAsync
            _logger.LogInformation("Creating new menu item: {Name}", dto.Name);

            var newItem = new MenuItemDetailDto
            {
                Id = 0,
                Name = dto.Name,
                Description = dto.Description,
                Price = dto.Price,
                CategoryId = dto.CategoryId,
                CategoryName = dto.CategoryName ?? "",
                ImageUrl = dto.ImageUrl,
                IsActive = dto.IsActive ?? true,
                IsSpicy = dto.IsSpicy ?? false,
                SpicyLevel = dto.SpicyLevel ?? 0,
                IsVegetarian = dto.IsVegetarian ?? false,
                ModifierGroups = new List<ModifierGroupDto>()
            };

            return Created($"api/admin/menu/items/{newItem.Id}", newItem);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating menu item");
            return StatusCode(500, new { error = "An error occurred while creating menu item" });
        }
    }

    /// <summary>
    /// Updates an existing menu item.
    /// </summary>
    [HttpPut("items/{id}")]
    [ProducesResponseType(typeof(MenuItemDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> UpdateMenuItem(
            int id,
            [FromBody] UpdateMenuItemDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            // Check if item exists
            var existing = await _menuRepository.GetItemByIdAsync(id, cancellationToken);
            if (existing == null)
            {
                return NotFound(new { error = $"Menu item with ID {id} not found" });
            }

            // Validation, now that the write is real. The DataAnnotations on the DTO are
            // enforced by [ApiController], but two rules are business rules rather than
            // shape rules and belong here.
            if (dto.Name is not null && string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { error = "A dish needs a name." });
            }

            // A free dish is almost always a typo, and the printed menu has no free
            // items. Zero is accepted because a legitimate comp exists; negative is not.
            if (dto.Price is < 0)
            {
                return BadRequest(new { error = "A price cannot be negative." });
            }

            if (dto.CategoryId is <= 0)
            {
                return BadRequest(new { error = "Choose a section for this dish." });
            }

            // Only the fields the caller supplied are touched — see MenuItemUpdate.
            var update = new MenuItemUpdate
            {
                Name = dto.Name,
                Description = dto.Description,
                BasePrice = dto.Price,
                CategoryId = dto.CategoryId,
                ImageUrl = dto.ImageUrl,
                IsAvailable = dto.IsActive,
                IsVegetarian = dto.IsVegetarian,
                IsVegan = dto.IsVegan,
                IsGlutenFree = dto.IsGlutenFree,
                SpicyLevel = dto.SpicyLevel,
            };

            var updated = await _menuRepository.UpdateItemAsync(id, update, cancellationToken);
            if (updated == null)
            {
                // Either the row vanished between the existence check and the write, or
                // the category it names does not exist — both are "this edit did not
                // land", and saying so beats a 204 that means nothing.
                return NotFound(new { error = $"Menu item with ID {id} could not be updated" });
            }

            _logger.LogInformation("Updated menu item {ItemId} ({Name})", id, updated.Name);

            // The updated dish, so the console renders what is actually stored rather
            // than the values it sent.
            return Ok(updated);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating menu item {ItemId}", id);
            return StatusCode(500, new { error = "An error occurred while updating menu item" });
        }
    }

    /// <summary>
    /// Deletes a menu item.
    /// </summary>
    [HttpDelete("items/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> DeleteMenuItem(
            int id,
            CancellationToken cancellationToken)
    {
        try
        {
            // Check if item exists
            var existing = await _menuRepository.GetItemByIdAsync(id, cancellationToken);
            if (existing == null)
            {
                return NotFound(new { error = $"Menu item with ID {id} not found" });
            }

            // TODO: Implement IMenuRepository.DeleteMenuItemAsync
            _logger.LogInformation("Deleting menu item {ItemId}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting menu item {ItemId}", id);
            return StatusCode(500, new { error = "An error occurred while deleting menu item" });
        }
    }

    /// <summary>
    /// Toggles the active status of a menu item.
    /// </summary>
    [HttpPost("items/{id}/toggle-availability")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> ToggleItemAvailability(
            int id,
            [FromBody] ToggleAvailabilityDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            // Check if item exists
            var existing = await _menuRepository.GetItemByIdAsync(id, cancellationToken);
            if (existing == null)
            {
                return NotFound(new { error = $"Menu item with ID {id} not found" });
            }

            // The switch the console already ships. It reported 204 and wrote nothing,
            // so marking a sold-out dish unavailable silently left it on sale.
            var changed = await _menuRepository.SetItemAvailabilityAsync(id, dto.IsActive, cancellationToken);
            if (!changed)
            {
                return NotFound(new { error = $"Menu item with ID {id} not found" });
            }

            _logger.LogInformation("Item {ItemId} availability set to {IsActive}", id, dto.IsActive);

            // The new state, not "no content": the switch reads its own position from
            // this response, so a silent success cannot be distinguished from a no-op.
            return Ok(new { id, isAvailable = dto.IsActive });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling availability for item {ItemId}", id);
            return StatusCode(500, new { error = "An error occurred while updating item availability" });
        }
    }

    // ==================== MODIFIER GROUPS ====================

    /// <summary>
    /// Gets all modifier groups for admin management.
    /// </summary>
    [HttpGet("modifier-groups")]
    [ProducesResponseType(typeof(List<ModifierGroupDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<ModifierGroupDto>>> GetAllModifierGroups(
            CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Add IMenuRepository.GetAllModifierGroupsAsync
            _logger.LogInformation("Retrieving all modifier groups");
            return Ok(new List<ModifierGroupDto>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving modifier groups");
            return StatusCode(500, new { error = "An error occurred while retrieving modifier groups" });
        }
    }

    /// <summary>
    /// Creates a new modifier group.
    /// </summary>
    [HttpPost("modifier-groups")]
    [ProducesResponseType(typeof(ModifierGroupDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ModifierGroupDto>> CreateModifierGroup(
            [FromBody] CreateModifierGroupDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { error = "Modifier group name is required" });
            }

            // TODO: Implement IMenuRepository.CreateModifierGroupAsync
            _logger.LogInformation("Creating new modifier group: {Name}", dto.Name);

            var newGroup = new ModifierGroupDto
            {
                Id = 0,
                Name = dto.Name,
                MinRequired = dto.MinRequired ?? 0,
                MaxAllowed = dto.MaxAllowed ?? 1,
                DisplayOrder = dto.DisplayOrder ?? 0
            };

            return Created($"api/admin/menu/modifier-groups/{newGroup.Id}", newGroup);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating modifier group");
            return StatusCode(500, new { error = "An error occurred while creating modifier group" });
        }
    }

    /// <summary>
    /// Updates a modifier group.
    /// </summary>
    [HttpPut("modifier-groups/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> UpdateModifierGroup(
            int id,
            [FromBody] UpdateModifierGroupDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Implement IMenuRepository.UpdateModifierGroupAsync
            _logger.LogInformation("Updating modifier group {GroupId}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating modifier group {GroupId}", id);
            return StatusCode(500, new { error = "An error occurred while updating modifier group" });
        }
    }

    /// <summary>
    /// Deletes a modifier group.
    /// </summary>
    [HttpDelete("modifier-groups/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> DeleteModifierGroup(
            int id,
            CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Implement IMenuRepository.DeleteModifierGroupAsync
            _logger.LogInformation("Deleting modifier group {GroupId}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting modifier group {GroupId}", id);
            return StatusCode(500, new { error = "An error occurred while deleting modifier group" });
        }
    }
}
