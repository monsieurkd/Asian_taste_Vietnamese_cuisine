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


    /// <summary>
    /// Sets whether a dish can be ordered.
    /// </summary>
    /// <remarks>
    /// Availability rather than deletion, because that is the real situation: the
    /// kitchen runs out of a dish mid-service and needs it off the menu until it is
    /// restocked, not gone from the printed menu.
    ///
    /// This is the endpoint the console's switch already called. It used to log and
    /// return 204 without writing anything, so a switch that looked like it worked
    /// did nothing at all.
    /// </remarks>
    public async Task<bool> SetItemAvailabilityAsync(int id, bool isAvailable, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var affected = await connection.ExecuteAsync(
            new CommandDefinition(
                @"UPDATE menu_items
                  SET is_available = @IsAvailable,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = @Id",
                new { Id = id, IsAvailable = isAvailable },
                cancellationToken: cancellationToken));

        return affected > 0;
    }

    /// <summary>
    /// Updates the editable fields of a dish.
    /// </summary>
    /// <remarks>
    /// Built as a partial UPDATE: the SET list is assembled from the fields the caller
    /// actually supplied, so a caller cannot blank a column by omitting it. The
    /// alternative — an UPDATE naming every column — turns "the console did not render
    /// the image field" into "delete the image", which is how a menu quietly loses its
    /// data during an unrelated edit.
    ///
    /// The variable names are generated (`@p0`, `@p1`, …) and their VALUES are always
    /// parameters. The column names come from this method's own literal strings, never
    /// from the caller, so this is not an interpolation point.
    /// </remarks>
    public async Task<MenuItemDetailDto?> UpdateItemAsync(int id, MenuItemUpdate update, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var sets = new List<string>();
        var parameters = new DynamicParameters();
        parameters.Add("Id", id);

        void Add(string column, string value, object? parameter)
        {
            if (parameter is null) return;
            var name = $"p{sets.Count}";
            sets.Add($"{column} = @{name}");
            parameters.Add(name, value);
        }

        // Text fields are NOT skipped when empty: clearing a description is a legitimate
        // edit. They are only skipped when the caller did not supply the field at all,
        // which is what null means here.
        if (update.Name is not null) Add("name", update.Name.Trim(), update.Name);
        if (update.Description is not null) Add("description", update.Description.Trim(), update.Description);
        if (update.BasePrice is not null) Add("base_price", "x", update.BasePrice.Value);
        if (update.CategoryId is not null) Add("category_id", "x", update.CategoryId.Value);
        if (update.ImageUrl is not null) Add("image_url", update.ImageUrl.Trim(), update.ImageUrl);
        if (update.IsAvailable is not null) Add("is_available", "x", update.IsAvailable.Value);
        if (update.IsPopular is not null) Add("is_popular", "x", update.IsPopular.Value);
        if (update.IsGlutenFree is not null) Add("is_gluten_free", "x", update.IsGlutenFree.Value);
        if (update.IsVegetarian is not null) Add("is_vegetarian", "x", update.IsVegetarian.Value);
        if (update.IsVegan is not null) Add("is_vegan", "x", update.IsVegan.Value);
        if (update.SpicyLevel is not null) Add("spicy_level", "x", update.SpicyLevel.Value);

        if (sets.Count == 0)
        {
            // Nothing to change. Return the dish as it stands rather than reporting a
            // write that did not happen — the console shows the result, so it must be
            // the current row.
            return await GetItemByIdAsync(id, cancellationToken);
        }

        sets.Add("updated_at = CURRENT_TIMESTAMP");

        var sql = $"UPDATE menu_items SET {string.Join(", ", sets)} WHERE id = @Id";

        var affected = await connection.ExecuteAsync(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        if (affected == 0) return null;

        // Read back rather than echo the request: the caller sees what is stored, which
        // is the only thing that proves the write landed.
        return await GetItemByIdAsync(id, cancellationToken);
    }


    /// <summary>
    /// Current name and price for a set of dishes.
    /// </summary>
    /// <remarks>
    /// Prices come from the database, never from the caller: order editing prices the
    /// replacement lines from the menu as it stands, so a client cannot choose its own
    /// total. Dishes that no longer exist are simply absent from the result, and the
    /// caller treats that as "cannot be added" rather than guessing a price.
    /// </remarks>
    public async Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(
        IReadOnlyCollection<int> menuItemIds,
        CancellationToken cancellationToken = default)
    {
        if (menuItemIds.Count == 0) return new Dictionary<int, (string, decimal)>();

        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // The IN list is built from generated placeholders while the VALUES stay
        // parameters, which is the same shape CreateOrderAsync uses to re-price a cart.
        var placeholders = string.Join(",", menuItemIds.Select((_, i) => $"@id{i}"));
        var parameters = new DynamicParameters();
        var index = 0;
        foreach (var id in menuItemIds) parameters.Add($"id{index++}", id);

        var rows = await connection.QueryAsync<(int Id, string Name, decimal BasePrice)>(
            new CommandDefinition(
                $"SELECT id, name, base_price FROM menu_items WHERE id IN ({placeholders})",
                parameters,
                cancellationToken: cancellationToken));

        return rows.ToDictionary(r => r.Id, r => (r.Name, r.BasePrice));
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

        // Replace the group-with-modifiers join with two flat queries.
        //
        // The single LEFT JOIN this used to run was silently wrong, and had been
        // since the schema was written — it only became visible once migration 13
        // actually seeded option groups, because before that every dish returned
        // an empty list and nothing exercised the mapping.
        //
        // The cause is Dapper's multi-mapping: it splits on the first column
        // named "Id", and BOTH tables select `as Id`. So the group's modifiers,
        // the group's own row, and a NULL phantom row for a group with no choices
        // (the Spice level range has none by design) all collapsed into the wrong
        // entities. Two queries remove the ambiguity entirely rather than working
        // around it with aliases that collide again the next time a column is
        // added.
        var groups = (await connection.QueryAsync<ModifierGroupDto>(
            @"
            SELECT
                mg.id as Id,
                mg.name as Name,
                mg.is_required as IsRequired,
                mg.min_select as MinSelect,
                mg.max_select as MaxSelect,
                mg.display_order as DisplayOrder
            FROM modifier_groups mg
            WHERE mg.menu_item_id = @ItemId
            ORDER BY mg.display_order ASC, mg.id ASC;
            ",
            new { ItemId = id })).ToList();

        if (groups.Count > 0)
        {
            var groupIds = groups.Select(g => g.Id).ToArray();

            var modifiers = await connection.QueryAsync<ModifierDto>(
                @"
                -- No `is_default`: ModifierDto carries the property but the
                -- table never had the column. Selecting it threw 42703 the first
                -- time this code ran, which is how it was found.
                SELECT
                    m.id as Id,
                    m.modifier_group_id as ModifierGroupId,
                    m.name as Name,
                    m.price_adjustment as PriceAdjustment,
                    m.display_order as DisplayOrder
                FROM modifiers m
                WHERE m.modifier_group_id = ANY(@GroupIds)
                  AND m.is_available = TRUE
                ORDER BY m.display_order ASC, m.id ASC;
                ",
                new { GroupIds = groupIds });

            var byGroup = modifiers
                .GroupBy(m => m.ModifierGroupId)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var group in groups)
            {
                if (byGroup.TryGetValue(group.Id, out var choices))
                {
                    group.Modifiers = choices;
                }
            }
        }

        item.ModifierGroups = groups;
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

    /// <summary>
    /// Every sellable dish, with the fields a counter till needs — category name, the
    /// price to charge, and the option groups — for the whole available menu.
    /// </summary>
    /// <remarks>
    /// This exists because the counter screen was built against `MenuItemDetailDto` and
    /// the endpoint behind it returned `MenuItemSummaryDto` for the POPULAR items only.
    /// The grid then filtered on `isActive` (absent — the field is `isAvailable`), read
    /// `categoryName` (absent), `price` (absent, it is `basePrice`) and `modifierGroups`
    /// (absent, only a `hasModifiers` boolean), so it filtered every dish away and mapped
    /// over an empty array. The screen rendered its frame with an empty grid, which reads
    /// as a broken page rather than a failed request.
    ///
    /// `GetAvailableItemsAsync` is the right SET — every available dish, not the popular
    /// ones — so this is that query plus the two things the detail shape carries. The
    /// option groups are two flat queries rather than one join, for the reason spelled out
    /// on `GetItemByIdAsync`: Dapper splits multi-mapping on the first column aliased
    /// `Id`, and both tables here have one, which silently collapses groups, their
    /// modifiers and a NULL phantom row into the wrong entities.
    /// </remarks>
    public async Task<List<MenuItemDetailDto>> GetCounterMenuAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // `is_available` only. A dish the shop has run out of is not sellable, and the
        // counter is the one screen where a staff member cannot work around it — there is
        // a customer waiting, so the dish simply must not be there to tap.
        var items = (await connection.QueryAsync<MenuItemDetailDto>(
            @"
            SELECT
                mi.id as Id,
                mi.category_id as CategoryId,
                c.name as CategoryName,
                mi.name as Name,
                mi.description as Description,
                mi.base_price as BasePrice,
                mi.base_price as Price,
                mi.image_url as ImageUrl,
                mi.is_available as IsAvailable,
                TRUE as IsActive,
                mi.is_popular as IsPopular,
                mi.is_gluten_free as IsGlutenFree,
                mi.is_vegetarian as IsVegetarian,
                mi.is_vegan as IsVegan,
                mi.spicy_level as SpicyLevel
            FROM menu_items mi
            INNER JOIN categories c ON c.id = mi.category_id
            WHERE mi.is_available = TRUE
            ORDER BY c.display_order ASC, c.name ASC, mi.name ASC;
            ")).ToList();

        if (items.Count == 0) return items;

        // Option groups for the whole menu in one query rather than one per dish: 82 items
        // is 82 round trips otherwise, on a screen that has a customer standing at it.
        var itemIds = items.Select(i => i.Id).ToArray();

        var groups = (await connection.QueryAsync<CounterModifierGroupRow>(
            @"
            SELECT
                mg.id as Id,
                mg.menu_item_id as MenuItemId,
                mg.name as Name,
                mg.is_required as IsRequired,
                mg.min_select as MinSelect,
                mg.max_select as MaxSelect,
                mg.display_order as DisplayOrder
            FROM modifier_groups mg
            WHERE mg.menu_item_id = ANY(@ItemIds)
            ORDER BY mg.display_order ASC, mg.id ASC;
            ",
            new { ItemIds = itemIds })).ToList();

        if (groups.Count > 0)
        {
            var groupIds = groups.Select(g => g.Id).ToArray();

            // `is_available`, not `is_active`: the modifiers table has the former. Reading
            // the wrong one threw 42703 the first time this ran, which is how the same
            // mistake was found in GetItemByIdAsync.
            var modifiers = await connection.QueryAsync<ModifierDto>(
                @"
                SELECT
                    m.id as Id,
                    m.modifier_group_id as ModifierGroupId,
                    m.name as Name,
                    m.price_adjustment as PriceAdjustment,
                    m.display_order as DisplayOrder
                FROM modifiers m
                WHERE m.modifier_group_id = ANY(@GroupIds)
                  AND m.is_available = TRUE
                ORDER BY m.display_order ASC, m.id ASC;
                ",
                new { GroupIds = groupIds });

            var byGroup = modifiers
                .GroupBy(m => m.ModifierGroupId)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var group in groups)
            {
                if (byGroup.TryGetValue(group.Id, out var choices))
                {
                    group.Modifiers = choices;
                }
            }
        }

        var groupsByItem = groups
            .GroupBy(g => g.MenuItemId)
            .ToDictionary(g => g.Key, g => g.Select(ToGroupDto).ToList());

        foreach (var item in items)
        {
            if (groupsByItem.TryGetValue(item.Id, out var forItem))
            {
                item.ModifierGroups = forItem;
            }
        }

        return items;
    }

    /// <summary>
    /// A modifier group row with its owning dish, so the whole menu can be assembled from
    /// one query. <see cref="ModifierGroupDto"/> deliberately has no item id — it is nested
    /// under its dish on the way out — so this carries it only as far as the grouping.
    /// </summary>
    private sealed class CounterModifierGroupRow
    {
        public int Id { get; set; }
        public int MenuItemId { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsRequired { get; set; }
        public int MinSelect { get; set; }
        public int MaxSelect { get; set; }
        public int DisplayOrder { get; set; }
        public List<ModifierDto> Modifiers { get; set; } = new();
    }

    private static ModifierGroupDto ToGroupDto(CounterModifierGroupRow row) => new()
    {
        Id = row.Id,
        Name = row.Name,
        IsRequired = row.IsRequired,
        MinSelect = row.MinSelect,
        MaxSelect = row.MaxSelect,
        DisplayOrder = row.DisplayOrder,
        // Both spellings are populated because the mapper's two consumers read different
        // ones: the menu editor reads MinRequired/MaxAllowed, the counter reads MinSelect
        // via the same fields. They are the same numbers under two historical names.
        MinRequired = row.MinSelect,
        MaxAllowed = row.MaxSelect,
        Modifiers = row.Modifiers,
    };

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
