using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Dapper-based repository for menu data access.
/// </summary>
public class MenuRepository : IMenuRepository
{
    private readonly IDbConnectionFactory _dbConnectionFactory;

    public MenuRepository(IDbConnectionFactory dbConnectionFactory)
    {
        _dbConnectionFactory = dbConnectionFactory;
    }

    public async Task<MenuResponseDto> GetFullMenuAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        var categories = await connection.QueryAsync<dynamic>(
            @"
            SELECT
                c.id,
                c.name,
                c.description,
                c.display_order,
                COALESCE(COUNT(mi.id), 0) as item_count
            FROM categories c
            LEFT JOIN menu_items mi ON mi.category_id = c.id AND mi.is_available = TRUE
            WHERE c.is_active = TRUE
            GROUP BY c.id, c.name, c.description, c.display_order
            ORDER BY c.display_order ASC;
            ");

        var result = new MenuResponseDto();

        foreach (var cat in categories)
        {
            var categoryId = (int)cat.id;
            var items = await GetItemsByCategoryAsync(categoryId, cancellationToken);

            result.Categories.Add(new CategoryWithItemsDto
            {
                Id = categoryId,
                Name = cat.name,
                Description = cat.description,
                DisplayOrder = cat.display_order,
                Items = items
            });
        }

        return result;
    }

    public async Task<List<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        var categories = await connection.QueryAsync<CategoryDto>(
            @"
            SELECT
                c.id as Id,
                c.name as Name,
                c.description as Description,
                c.display_order as DisplayOrder,
                COALESCE(COUNT(mi.id), 0) as ItemCount
            FROM categories c
            LEFT JOIN menu_items mi ON mi.category_id = c.id AND mi.is_available = TRUE
            WHERE c.is_active = TRUE
            GROUP BY c.id, c.name, c.description, c.display_order
            ORDER BY c.display_order ASC;
            ");

        return categories.AsList();
    }

    public async Task<List<MenuItemSummaryDto>> GetItemsByCategoryAsync(int categoryId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        var items = await connection.QueryAsync<MenuItemSummaryDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel,
                COALESCE(EXISTS(
                    SELECT 1 FROM modifier_groups mg
                    WHERE mg.menu_item_id = mi.id
                    LIMIT 1
                ), FALSE) as HasModifiers
            FROM menu_items mi
            WHERE mi.category_id = @CategoryId
                AND mi.is_available = TRUE
            ORDER BY mi.id ASC, mi.name ASC;
            ",
            new { CategoryId = categoryId });

        return items.AsList();
    }

    public async Task<MenuItemDetailDto?> GetItemByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Get the item with category name
        var item = await connection.QueryFirstOrDefaultAsync<MenuItemDetailDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                c.name as CategoryName,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel
            FROM menu_items mi
            INNER JOIN categories c ON c.id = mi.category_id
            WHERE mi.id = @Id;
            ",
            new { Id = id });

        if (item == null) return null;

        // Get modifier groups for this item
        var modifierGroups = await connection.QueryAsync<
            ModifierGroupDto,
            ModifierDto,
            ModifierGroupDto>(
            @"
            SELECT
                mg.id as Id,
                mg.name as Name,
                mg.is_required as IsRequired,
                mg.min_select as MinSelect,
                mg.max_select as MaxSelect,
                m.id as Id,
                m.name as Name,
                m.price_adjustment as PriceAdjustment,
                m.is_available as IsAvailable
            FROM modifier_groups mg
            LEFT JOIN modifiers m ON m.modifier_group_id = mg.id AND m.is_available = TRUE
            WHERE mg.menu_item_id = @ItemId
            ORDER BY mg.display_order ASC, m.display_order ASC;
            ",
            (group, modifier) =>
            {
                group.Modifiers.Add(modifier);
                return group;
            },
            new { ItemId = id },
            splitOn: "Id");

        // Group modifiers by their group (Dapper flat mapping workaround)
        var grouped = new List<ModifierGroupDto>();
        foreach (var group in modifierGroups)
        {
            var existing = grouped.FirstOrDefault(g => g.Id == group.Id);
            if (existing == null)
            {
                grouped.Add(group);
            }
            else
            {
                foreach (var modifier in group.Modifiers)
                {
                    if (!existing.Modifiers.Any(m => m.Id == modifier.Id))
                    {
                        existing.Modifiers.Add(modifier);
                    }
                }
            }
        }

        item.ModifierGroups = grouped;
        return item;
    }

    public async Task<List<MenuItemSummaryDto>> SearchItemsAsync(string query, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        var searchQuery = $"%{query}%";

        var items = await connection.QueryAsync<MenuItemSummaryDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel,
                COALESCE(EXISTS(
                    SELECT 1 FROM modifier_groups mg
                    WHERE mg.menu_item_id = mi.id
                    LIMIT 1
                ), FALSE) as HasModifiers
            FROM menu_items mi
            WHERE mi.is_available = TRUE
                AND (mi.name ILIKE @Query OR mi.description ILIKE @Query)
            ORDER BY
                CASE WHEN mi.name ILIKE @ExactQuery THEN 0 ELSE 1 END,
                mi.name ASC;
            ",
            new { Query = searchQuery, ExactQuery = query });

        return items.AsList();
    }

    public async Task<List<MenuItemSummaryDto>> GetPopularItemsAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var items = await connection.QueryAsync<MenuItemSummaryDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel,
                COALESCE(EXISTS(
                    SELECT 1 FROM modifier_groups mg
                    WHERE mg.menu_item_id = mi.id
                    LIMIT 1
                ), FALSE) as HasModifiers
            FROM menu_items mi
            WHERE mi.is_available = TRUE
                AND mi.is_popular = TRUE
            ORDER BY mi.category_id ASC, mi.name ASC;
            ");

        return items.AsList();
    }

    public async Task<List<MenuItemSummaryDto>> GetAvailableItemsAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var items = await connection.QueryAsync<MenuItemSummaryDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel,
                COALESCE(EXISTS(
                    SELECT 1 FROM modifier_groups mg
                    WHERE mg.menu_item_id = mi.id
                    LIMIT 1
                ), FALSE) as HasModifiers
            FROM menu_items mi
            WHERE mi.is_available = TRUE
            ORDER BY mi.category_id ASC, mi.name ASC;
            ");

        return items.AsList();
    }

    public async Task<List<MenuItemSummaryDto>> SearchItemsAdvancedAsync(SearchParametersDto parameters, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Build dynamic SQL based on parameters
        var sql = new System.Text.StringBuilder();
        var conditions = new List<string>();
        var orderByClauses = new List<string>();

        // Main query structure
        sql.AppendLine(@"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel,
                COALESCE(EXISTS(
                    SELECT 1 FROM modifier_groups mg
                    WHERE mg.menu_item_id = mi.id
                    LIMIT 1
                ), FALSE) as HasModifiers
            FROM menu_items mi");

        // Join with modifiers if searching by modifier names
        if (parameters.IncludeModifiers == true && !string.IsNullOrWhiteSpace(parameters.Query))
        {
            sql.AppendLine("            LEFT JOIN modifier_groups mg ON mg.menu_item_id = mi.id");
            sql.AppendLine("            LEFT JOIN modifiers m ON m.modifier_group_id = mg.id AND m.is_available = TRUE");
        }

        // Start WHERE clause
        conditions.Add("mi.is_available = TRUE");

        // Query search (name, description, optionally modifiers)
        if (!string.IsNullOrWhiteSpace(parameters.Query))
        {
            var searchQuery = $"%{parameters.Query}%";

            if (parameters.IncludeModifiers == true)
            {
                // Search in name, description, AND modifier names
                conditions.Add(@"
                    (mi.name ILIKE @Query
                    OR mi.description ILIKE @Query
                    OR EXISTS (
                        SELECT 1 FROM modifier_groups mg_inner
                        INNER JOIN modifiers m_inner ON m_inner.modifier_group_id = mg_inner.id
                        WHERE mg_inner.menu_item_id = mi.id
                        AND m_inner.name ILIKE @Query
                        LIMIT 1
                    ))");
            }
            else
            {
                conditions.Add("(mi.name ILIKE @Query OR mi.description ILIKE @Query)");
            }

            // For relevance sorting: prioritize exact name matches
            orderByClauses.Add("CASE WHEN mi.name ILIKE @ExactQuery THEN 0 ELSE 1 END");
        }

        // Dietary filter
        if (!string.IsNullOrWhiteSpace(parameters.Dietary))
        {
            switch (parameters.Dietary.ToLower())
            {
                case "vegetarian":
                    conditions.Add("mi.is_vegetarian = TRUE");
                    break;
                case "vegan":
                    conditions.Add("mi.is_vegan = TRUE");
                    break;
                case "glutenfree":
                case "gluten-free":
                    conditions.Add("mi.is_gluten_free = TRUE");
                    break;
            }
        }

        // Price range filter
        if (parameters.MinPrice.HasValue)
        {
            conditions.Add("mi.base_price >= @MinPrice");
        }

        if (parameters.MaxPrice.HasValue)
        {
            conditions.Add("mi.base_price <= @MaxPrice");
        }

        // Spicy level filter
        if (parameters.MinSpicyLevel.HasValue)
        {
            conditions.Add("mi.spicy_level >= @MinSpicyLevel");
        }

        if (parameters.MaxSpicyLevel.HasValue)
        {
            conditions.Add("mi.spicy_level <= @MaxSpicyLevel");
        }

        // Category filter
        if (parameters.CategoryId.HasValue)
        {
            conditions.Add("mi.category_id = @CategoryId");
        }

        // Popular items only
        if (parameters.OnlyPopular == true)
        {
            conditions.Add("mi.is_popular = TRUE");
        }

        // Add WHERE clause
        if (conditions.Count > 0)
        {
            sql.AppendLine("            WHERE " + string.Join(" AND ", conditions));
        }

        // Build ORDER BY clause
        string sortBy = (parameters.SortBy ?? "relevance").ToLower();
        string sortOrder = (parameters.SortOrder ?? "asc").ToLower();
        bool isDescending = sortOrder == "desc";

        if (sortBy == "price")
        {
            orderByClauses.Add($"mi.base_price {(isDescending ? "DESC" : "ASC")}");
        }
        else if (sortBy == "spicy")
        {
            orderByClauses.Add($"mi.spicy_level {(isDescending ? "DESC" : "ASC")}");
        }
        else if (sortBy == "popularity")
        {
            orderByClauses.Add("mi.is_popular DESC");
            orderByClauses.Add($"mi.name {(isDescending ? "DESC" : "ASC")}");
        }
        else // relevance or name (default)
        {
            if (sortBy == "name")
            {
                orderByClauses.Clear();
            }
            orderByClauses.Add($"mi.name {(isDescending ? "DESC" : "ASC")}");
        }

        sql.AppendLine("            ORDER BY " + string.Join(", ", orderByClauses) + ";");

        // Build parameters
        var dynamicParams = new DynamicParameters();
        if (!string.IsNullOrWhiteSpace(parameters.Query))
        {
            dynamicParams.Add("Query", $"%{parameters.Query}%");
            dynamicParams.Add("ExactQuery", parameters.Query);
        }
        if (parameters.MinPrice.HasValue) dynamicParams.Add("MinPrice", parameters.MinPrice.Value);
        if (parameters.MaxPrice.HasValue) dynamicParams.Add("MaxPrice", parameters.MaxPrice.Value);
        if (parameters.MinSpicyLevel.HasValue) dynamicParams.Add("MinSpicyLevel", parameters.MinSpicyLevel.Value);
        if (parameters.MaxSpicyLevel.HasValue) dynamicParams.Add("MaxSpicyLevel", parameters.MaxSpicyLevel.Value);
        if (parameters.CategoryId.HasValue) dynamicParams.Add("CategoryId", parameters.CategoryId.Value);

        var items = await connection.QueryAsync<MenuItemSummaryDto>(
            sql.ToString(),
            dynamicParams
        );

        return items.AsList();
    }
}
