using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Dapper-based repository for order data access.
/// </summary>
public class OrderRepository : IOrderRepository
{
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IRestaurantSettingsRepository _settingsRepository;

    public OrderRepository(IDbConnectionFactory dbConnectionFactory, IRestaurantSettingsRepository settingsRepository)
    {
        _dbConnectionFactory = dbConnectionFactory;
        _settingsRepository = settingsRepository;
    }

    public async Task<Order?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id,
                   order_number as OrderNumber,
                   customer_id as CustomerId,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_method::text as PaymentMethod,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   payment_intent_id as PaymentIntentId,
                   payment_failure_reason as PaymentFailureReason,
                   email_confirmation_sent as EmailConfirmationSent,
                   notes as Notes,
                   created_at as CreatedAt,
                   updated_at as UpdatedAt
            FROM orders
            WHERE order_number = @OrderNumber";

        var order = await connection.QueryFirstOrDefaultAsync<Order>(
            new CommandDefinition(sql, new { OrderNumber = orderNumber }, cancellationToken: cancellationToken));

        // Load the line items (with their modifiers). Without this the order carries
        // an empty Items list, and anything that consumes it -- the POS push, the
        // confirmation email -- silently sees an order with no dishes on it.
        if (order is not null)
        {
            order.Items = await GetOrderItemsAsync(order.Id, cancellationToken);
        }

        return order;
    }

    public async Task<Order?> GetOrderByIdAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Use column aliases that match C# property names exactly
        // Dapper maps columns by name (case-insensitive), but aliases help avoid ambiguity
        const string sql = @"
            SELECT id,
                   order_number as OrderNumber,
                   customer_id as CustomerId,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_method::text as PaymentMethod,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   payment_intent_id as PaymentIntentId,
                   payment_failure_reason as PaymentFailureReason,
                   email_confirmation_sent as EmailConfirmationSent,
                   notes as Notes,
                   created_at as CreatedAt,
                   updated_at as UpdatedAt
            FROM orders
            WHERE id = @OrderId";

        var order = await connection.QueryFirstOrDefaultAsync<Order>(
            new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        // Items and their modifiers are a separate query rather than a join, because
        // Dapper would otherwise map the flattened rows onto one OrderItem each.
        // See GetOrderByNumberAsync for why this matters.
        if (order is not null)
        {
            order.Items = await GetOrderItemsAsync(order.Id, cancellationToken);
        }

        return order;
    }

    public async Task<Order> CreateOrderAsync(CreateCheckoutOrderDto request, string orderNumber, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        using var transaction = connection.BeginTransaction();

        int orderId;

        try
        {
            // Get all modifier IDs from all items
            var allModifierIds = request.Items
                .SelectMany(i => i.SelectedModifierIds)
                .Distinct()
                .ToList();

            // Fetch modifier details for pricing
            Dictionary<int, (string name, decimal price)> modifierDetails = new();
            if (allModifierIds.Any())
            {
                var modifierPlaceholders = string.Join(",", allModifierIds.Select((_, i) => $"@mod{i}"));
                var modifierParams = new DynamicParameters();
                for (int i = 0; i < allModifierIds.Count; i++)
                {
                    modifierParams.Add($"mod{i}", allModifierIds[i]);
                }

                var modifiers = await connection.QueryAsync<ModifierDetails>(
                    new CommandDefinition(
                        $"SELECT id, name, price_adjustment FROM modifiers WHERE id IN ({modifierPlaceholders})",
                        modifierParams,
                        transaction,
                        commandTimeout: null,
                        cancellationToken: cancellationToken));

                modifierDetails = modifiers.ToDictionary(m => m.id, m => (m.name, m.price_adjustment));
            }

            // Get menu items to calculate prices and get names
            var menuItemIds = request.Items.Select(i => i.MenuItemId).Distinct().ToList();

            // Build IN clause for query
            var idPlaceholders = string.Join(",", menuItemIds.Select((_, i) => $"@id{i}"));
            var idParams = new DynamicParameters();
            for (int i = 0; i < menuItemIds.Count; i++)
            {
                idParams.Add($"id{i}", menuItemIds[i]);
            }

            var menuItems = await connection.QueryAsync<MenuItemsForPricing>(
                new CommandDefinition(
                    $"SELECT id, name, base_price FROM menu_items WHERE id IN ({idPlaceholders})",
                    idParams,
                    transaction,
                    commandTimeout: null,
                    cancellationToken: cancellationToken));

            var menuItemPrices = menuItems.ToDictionary(m => m.id, m => m.base_price);
            var menuItemNames = menuItems.ToDictionary(m => m.id, m => m.name);

            // Calculate totals including modifier prices
            decimal subtotal = 0;
            foreach (var item in request.Items)
            {
                if (!menuItemPrices.TryGetValue(item.MenuItemId, out var price))
                {
                    throw new InvalidOperationException($"Menu item {item.MenuItemId} not found");
                }

                // Calculate modifier prices
                decimal modifierPrice = item.SelectedModifierIds
                    .Where(modifierId => modifierDetails.ContainsKey(modifierId))
                    .Sum(modifierId => modifierDetails[modifierId].price);

                subtotal += (price + modifierPrice) * item.Quantity;
            }

            decimal tax = 0; // No tax for now
            decimal total = subtotal + tax;

            // Create order
            const string orderSql = @"
                INSERT INTO orders (
                    order_number, customer_name, customer_phone, customer_email,
                    order_type, requested_time, notes, payment_method,
                    subtotal, tax, total, status, created_at
                ) VALUES (
                    @OrderNumber, @CustomerName, @CustomerPhone, @CustomerEmail,
                    @OrderType::order_type, @RequestedTime, @Notes, @PaymentMethod::payment_method,
                    @Subtotal, @Tax, @Total, @Status::order_status, @CreatedAt
                ) RETURNING id";

            orderId = await connection.QuerySingleAsync<int>(
                new CommandDefinition(
                    orderSql,
                    new
                    {
                        OrderNumber = orderNumber,
                        CustomerName = request.CustomerName,
                        CustomerPhone = request.CustomerPhone,
                        CustomerEmail = request.CustomerEmail,
                        OrderType = request.OrderType.ToString(),
                        RequestedTime = PickupTime.ResolveRequestedTime(request.PickupTime),
                        Notes = request.SpecialInstructions,
                        PaymentMethod = request.PaymentMethod.ToString(),
                        Subtotal = subtotal,
                        Tax = tax,
                        Total = total,
                        Status = "Pending",
                        CreatedAt = DateTime.UtcNow
                    },
                    transaction,
                    commandTimeout: null,
                    cancellationToken: cancellationToken));

            // Create order items
            const string itemSql = @"
                INSERT INTO order_items (
                    order_id, menu_item_id, menu_item_name, quantity,
                    unit_price, total_price, special_instructions
                ) VALUES (
                    @OrderId, @MenuItemId, @MenuItemName, @Quantity,
                    @UnitPrice, @TotalPrice, @SpecialInstructions
                ) RETURNING id";

            const string modifierSql = @"
                INSERT INTO order_item_modifiers (
                    order_item_id, modifier_id, modifier_name, price_adjustment
                ) VALUES (
                    @OrderItemId, @ModifierId, @ModifierName, @PriceAdjustment
                )";

            foreach (var item in request.Items)
            {
                var basePrice = menuItemPrices[item.MenuItemId];

                // Calculate modifier prices for this item
                decimal modifierPrice = item.SelectedModifierIds
                    .Where(modifierId => modifierDetails.ContainsKey(modifierId))
                    .Sum(modifierId => modifierDetails[modifierId].price);

                var unitPrice = basePrice + modifierPrice;
                var totalPrice = unitPrice * item.Quantity;
                var itemName = menuItemNames.TryGetValue(item.MenuItemId, out var name) ? name : $"Item {item.MenuItemId}";

                var orderItemId = await connection.QuerySingleAsync<int>(
                    new CommandDefinition(
                        itemSql,
                        new
                        {
                            OrderId = orderId,
                            MenuItemId = item.MenuItemId,
                            MenuItemName = itemName,
                            Quantity = item.Quantity,
                            UnitPrice = unitPrice,
                            TotalPrice = totalPrice,
                            SpecialInstructions = item.SpecialInstructions
                        },
                        transaction,
                        commandTimeout: null,
                        cancellationToken: cancellationToken));

                // Insert order item modifiers
                foreach (var modifierId in item.SelectedModifierIds)
                {
                    if (modifierDetails.TryGetValue(modifierId, out var modifier))
                    {
                        await connection.ExecuteAsync(
                            new CommandDefinition(
                                modifierSql,
                                new
                                {
                                    OrderItemId = orderItemId,
                                    ModifierId = modifierId,
                                    ModifierName = modifier.name,
                                    PriceAdjustment = modifier.price
                                },
                                transaction,
                                commandTimeout: null,
                                cancellationToken: cancellationToken));
                    }
                }
            }

            transaction.Commit();
        }
        catch
        {
            // Only rollback if the transaction is still active
            if (transaction.Connection != null)
            {
                transaction.Rollback();
            }
            throw;
        }

        // Retrieve the created order outside the transaction
        return await GetOrderByIdAsync(orderId, cancellationToken) ?? throw new InvalidOperationException("Failed to retrieve created order");
    }

    public async Task UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // The status column is a PostgreSQL enum (order_status). The parameter is
        // sent as text, so cast explicitly to avoid:
        //   42804: column "status" is of type order_status but expression is of type text
        const string sql = @"
            UPDATE orders
            SET status = @Status::order_status, updated_at = @UpdatedAt
            WHERE id = @OrderId";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    OrderId = orderId,
                    Status = status.ToString(),
                    UpdatedAt = DateTime.UtcNow
                },
                cancellationToken: cancellationToken));
    }

    public async Task<List<Order>> GetOrdersByCustomerEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Cast enum columns to text to avoid Npgsql enum mapping issues
        // Use LOWER() for case-insensitive email matching
        const string sql = @"
            SELECT id, order_number, customer_id, customer_name, customer_phone, customer_email,
                   order_type::text as order_type, requested_time, status::text as status,
                   payment_method::text as payment_method, subtotal, tax, total,
                   payment_intent_id, payment_failure_reason, square_payment_id, square_order_id,
                   third_party_reference, lightspeed_sent_at, email_confirmation_sent,
                   notes, created_at, updated_at
            FROM orders
            WHERE LOWER(customer_email) = LOWER(@Email)
            ORDER BY created_at DESC";

        var orders = await connection.QueryAsync<Order>(
            new CommandDefinition(sql, new { Email = email }, cancellationToken: cancellationToken));

        return orders.AsList();
    }

    public async Task<List<OrderItem>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Column aliases, not `SELECT *`. Dapper matches by property name and this
        // connection does not enable underscore-to-PascalCase mapping, so the
        // snake_case columns (menu_item_name, unit_price) map to nothing and every
        // OrderItem comes back with an empty name and a price of 0. That is silent:
        // the row count is right, so it looked like it worked. The rest of this file
        // aliases for the same reason.
        const string sql = @"
            SELECT id,
                   order_id as OrderId,
                   menu_item_id as MenuItemId,
                   menu_item_name as MenuItemName,
                   quantity as Quantity,
                   unit_price as UnitPrice,
                   total_price as TotalPrice,
                   special_instructions as SpecialInstructions,
                   lightspeed_product_id as LightspeedProductId,
                   created_at as CreatedAt
            FROM order_items
            WHERE order_id = @OrderId
            ORDER BY id ASC";

        var items = await connection.QueryAsync<OrderItem>(
            new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        var itemsList = items.AsList();

        // Fetch modifiers for each item
        foreach (var item in itemsList)
        {
            // Aliased for the same reason as the item query above.
            const string modifiersSql = @"
                SELECT id,
                       order_item_id as OrderItemId,
                       modifier_id as ModifierId,
                       modifier_name as ModifierName,
                       price_adjustment as PriceAdjustment
                FROM order_item_modifiers
                WHERE order_item_id = @OrderItemId
                ORDER BY id ASC";

            var modifiers = await connection.QueryAsync<OrderItemModifier>(
                new CommandDefinition(modifiersSql, new { OrderItemId = item.Id }, cancellationToken: cancellationToken));

            item.Modifiers = modifiers.AsList();
        }

        return itemsList;
    }

    public async Task MarkEmailConfirmationSentAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE orders
            SET email_confirmation_sent = TRUE,
                updated_at = @UpdatedAt
            WHERE id = @OrderId";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new { OrderId = orderId, UpdatedAt = DateTime.UtcNow },
                cancellationToken: cancellationToken));
    }

    /// <summary>
    /// DTO for menu item pricing queries.
    /// </summary>
    private class MenuItemsForPricing
    {
        public int id { get; set; }
        public string name { get; set; } = string.Empty;
        public decimal base_price { get; set; }
    }

    // Admin methods

    /// <summary>
    /// Escapes the LIKE/ILIKE wildcards in a user-supplied search term.
    /// </summary>
    /// <remarks>
    /// Without this, searching for <c>50%</c> becomes the pattern <c>%50%%</c>, which matches
    /// every order whose number merely starts with "50" — and a term of just <c>%</c> would
    /// match the entire table. The backslash is escaped first so it cannot double-escape the
    /// characters added after it. Callers must pair this with <c>ESCAPE '\'</c> in the SQL.
    ///
    /// This is not the injection defence — parameters are. It is there so a wildcard in a
    /// search box means a literal character, which is what the person typing it expects.
    /// </remarks>
    internal static string EscapeLikePattern(string term) =>
        term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    public async Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var conditions = new List<string>();
        var parameters = new DynamicParameters();

        if (status.HasValue)
        {
            conditions.Add("status = @Status::order_status");
            parameters.Add("Status", status.Value.ToString());
        }

        if (fromDate.HasValue)
        {
            conditions.Add("created_at >= @FromDate");
            parameters.Add("FromDate", fromDate.Value);
        }

        if (toDate.HasValue)
        {
            conditions.Add("created_at <= @ToDate");
            parameters.Add("ToDate", toDate.Value.AddDays(1).AddTicks(-1));
        }

        // Order-number lookup.
        //
        // Two forms are supported because staff type it both ways: the full number
        // ("AT-20260312-0042") and the short form they read off the docket
        // ("0042", or just "42"). A plain equality check would match neither
        // reliably — staff searching "42" expect order 42, not a prefix accident.
        //
        // ILIKE with a parameter is used rather than any string interpolation: the
        // term arrives straight from a query string, so building the pattern into
        // the SQL would be an injection point. The wildcards are added to the
        // *parameter value* instead, which is the whole point of parameterisation.
        //
        // `%` and `_` are escaped so a search for "50%" cannot become a wildcard.
        if (!string.IsNullOrWhiteSpace(orderNumber))
        {
            conditions.Add(@"order_number ILIKE @OrderNumberPattern ESCAPE '\'");
            parameters.Add("OrderNumberPattern", $"%{EscapeLikePattern(orderNumber.Trim())}%");
        }

        var whereClause = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        // Alias every column to the DTO property name, matching GetOrderByIdAsync.
        //
        // Without these aliases Dapper maps by exact name: order_number does not
        // match OrderNumber, so the admin order list returned OrderNumber = ""
        // and CustomerName = "" for EVERY row. The list still rendered, with
        // correct totals and empty Order # and Customer columns, so it looked like
        // missing data rather than a mapping bug. A kitchen cannot work from a
        // list where no order has a number.
        //
        // Dapper's underscore matching is deliberately left off: enabling it
        // globally would change mapping for every query in this file at once,
        // including ones that currently work, so the fix stays local to the query
        // that was broken. Cast enum columns to text to avoid Npgsql enum issues.
        //
        // `payment_status` is selected because the console has to be able to tell a
        // declined card from a paid one. Inferring it from payment_method reads a
        // failed charge as a sale.
        var sql = $@"
            SELECT id,
                   order_number as OrderNumber,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_method::text as PaymentMethod,
                   payment_status::text as PaymentStatus,
                   subtotal as Subtotal,
                   total as Total,
                   notes as Notes,
                   created_at as CreatedAt
            FROM orders
            {whereClause}
            ORDER BY created_at DESC
            LIMIT @Limit OFFSET @Offset";

        parameters.Add("Limit", limit);
        parameters.Add("Offset", offset);

        var orders = await connection.QueryAsync<AdminOrderListDto>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        return orders.AsList();
    }

    public async Task<AdminOrderDetailDto?> GetAdminOrderDetailAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Every column is aliased to the DTO's property name, for the reason spelled
        // out in GetAllOrdersAsync: Dapper maps by exact name and underscore matching
        // is off, so `order_number` maps to nothing.
        //
        // This query was the worst case of it. It aliased nothing at all, and it is
        // the one the kitchen's ticket is built from — so every ticket showed a blank
        // order number, a blank customer, a blank status and a blank address, and the
        // only fields that survived were the ones that happen to be single words
        // (subtotal, tax, total, notes). The screen still rendered, which is why it
        // read as "no data" rather than "wrong query".
        //
        // It also did not select the payment columns, so the ticket could not tell a
        // declined card from a paid one and said "Paid online" for both. Statuses and
        // amounts now come from the row itself.
        const string orderSql = @"
            SELECT id as Id,
                   order_number as OrderNumber,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_method::text as PaymentMethod,
                   payment_status::text as PaymentStatus,
                   paid_amount as PaidAmount,
                   paid_at as PaidAt,
                   payment_failure_reason as PaymentFailureReason,
                   payment_intent_id as PaymentIntentId,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   notes as Notes,
                   created_at as CreatedAt,
                   updated_at as UpdatedAt
            FROM orders
            WHERE id = @OrderId";

        var order = await connection.QueryFirstOrDefaultAsync<AdminOrderDetailDto>(
            new CommandDefinition(orderSql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        if (order == null) return null;

        // Get order items with modifiers. `oi.id` and `oim.id` are both projected, so
        // both are aliased — two columns named `id` in one result set is exactly how a
        // modifier id ends up standing in for an item id.
        const string itemsSql = @"
            SELECT
                oi.id as ItemId,
                oi.menu_item_id as MenuItemId,
                oi.menu_item_name as MenuItemName,
                oi.quantity as Quantity,
                oi.unit_price as UnitPrice,
                oi.total_price as TotalPrice,
                oi.special_instructions as SpecialInstructions,
                oim.id as ModifierRowId,
                oim.modifier_id as ModifierId,
                oim.modifier_name as ModifierName,
                oim.price_adjustment as PriceAdjustment
            FROM order_items oi
            LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
            WHERE oi.order_id = @OrderId
            ORDER BY oi.id ASC, oim.id ASC";

        var itemsData = await connection.QueryAsync(
            new CommandDefinition(itemsSql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        // Group items with their modifiers
        var itemsDict = new Dictionary<int, AdminOrderItemDto>();
        foreach (var row in itemsData)
        {
            var itemId = (int)row.ItemId;
            if (!itemsDict.ContainsKey(itemId))
            {
                itemsDict[itemId] = new AdminOrderItemDto
                {
                    Id = itemId,
                    MenuItemId = (int)row.MenuItemId,
                    MenuItemName = (string)row.MenuItemName,
                    Quantity = (int)row.Quantity,
                    UnitPrice = (decimal)row.UnitPrice,
                    TotalPrice = (decimal)row.TotalPrice,
                    SpecialInstructions = (string?)row.SpecialInstructions,
                    Modifiers = new List<AdminOrderItemModifierDto>()
                };
            }

            // The LEFT JOIN produces one all-null modifier row for an item that has
            // none, so the check is on the modifier's own id rather than the row.
            if (row.ModifierRowId != null)
            {
                itemsDict[itemId].Modifiers.Add(new AdminOrderItemModifierDto
                {
                    Id = (int)row.ModifierRowId,
                    ModifierId = (int)row.ModifierId,
                    ModifierName = (string)row.ModifierName,
                    PriceAdjustment = (decimal)row.PriceAdjustment
                });
            }
        }

        order.Items = itemsDict.Values.ToList();
        return order;
    }

    /// <summary>
    /// The start of "today" in the restaurant's own timezone, as an instant.
    /// </summary>
    /// <remarks>
    /// "Today" on a dashboard is a business day, not a UTC day, and for an Adelaide
    /// kitchen the two differ for the last nine and a half hours of every trading
    /// evening. Using UTC meant dinner service was reported as TOMORROW's trade: the
    /// owner read the day's takings while orders were still arriving and saw only the
    /// trade from before 9:30am, which for an evening service is zero.
    ///
    /// The setting is read once per call and falls back to UTC if it is missing or
    /// unreadable, so a settings outage degrades the figure rather than breaking the
    /// dashboard.
    /// </remarks>
    private async Task<DateTime> GetLocalDayStartUtcAsync(DateTime localNow, CancellationToken cancellationToken)
    {
        try
        {
            var timezoneId = await _settingsRepository.GetAsync("timezone", cancellationToken);
            if (!string.IsNullOrWhiteSpace(timezoneId))
            {
                var tz = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
                var localMidnight = DateTime.SpecifyKind(localNow.Date, DateTimeKind.Unspecified);
                return TimeZoneInfo.ConvertTimeToUtc(localMidnight, tz);
            }
        }
        catch
        {
            // Deliberately silent: the caller's own fallback is the whole contract of
            // this helper, and a dashboard that cannot read a timezone must still draw.
        }

        return DateTime.UtcNow.Date;
    }

    public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // The trading day, in the restaurant's timezone. See GetLocalDayStartUtcAsync:
        // a UTC "today" reports an Adelaide dinner service as tomorrow's takings.
        var today = await GetLocalDayStartUtcAsync(DateTime.UtcNow, cancellationToken);
        var yesterday = today.AddDays(-1);

        // Today's revenue
        const string revenueSql = @"
            SELECT COALESCE(SUM(total), 0) as revenue
            FROM orders
            WHERE created_at >= @Today
            AND status != 'Cancelled'";

        var todayRevenue = await connection.QuerySingleAsync<decimal>(
            new CommandDefinition(revenueSql, new { Today = today }, cancellationToken: cancellationToken));

        // Yesterday's revenue for comparison
        var yesterdayRevenue = await connection.QuerySingleAsync<decimal>(
            new CommandDefinition(revenueSql, new { Today = yesterday }, cancellationToken: cancellationToken));

        decimal? revenueChange = null;
        if (yesterdayRevenue > 0)
        {
            revenueChange = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
        }

        // Active orders (Pending + Confirmed + Preparing)
        const string activeOrdersSql = @"
            SELECT COUNT(*)
            FROM orders
            WHERE status IN ('Pending', 'Confirmed', 'Preparing')";

        var activeOrders = await connection.QuerySingleAsync<int>(
            new CommandDefinition(activeOrdersSql, cancellationToken: cancellationToken));

        // Completed orders today
        const string completedOrdersSql = @"
            SELECT COUNT(*)
            FROM orders
            WHERE created_at >= @Today
            AND status = 'Completed'";

        var completedOrdersToday = await connection.QuerySingleAsync<int>(
            new CommandDefinition(completedOrdersSql, new { Today = today }, cancellationToken: cancellationToken));

        // Average order value today
        const string avgOrderValueSql = @"
            SELECT COALESCE(AVG(total), 0)
            FROM orders
            WHERE created_at >= @Today
            AND status != 'Cancelled'";

        var avgOrderValue = await connection.QuerySingleAsync<decimal>(
            new CommandDefinition(avgOrderValueSql, new { Today = today }, cancellationToken: cancellationToken));

        // Orders by status
        const string statusCountsSql = @"
            SELECT status::text as status, COUNT(*) as count
            FROM orders
            WHERE created_at >= @Today
            GROUP BY status";

        var statusCounts = await connection.QueryAsync<dynamic>(
            new CommandDefinition(statusCountsSql, new { Today = today }, cancellationToken: cancellationToken));

        var ordersByStatus = new Dictionary<string, int>();
        foreach (var row in statusCounts)
        {
            ordersByStatus[(string)row.status] = (int)row.count;
        }

        // Recent orders
        const string recentOrdersSql = @"
            SELECT id, order_number, customer_name, status::text as status, total, created_at, order_type::text as order_type
            FROM orders
            ORDER BY created_at DESC
            LIMIT 10";

        var recentOrders = await connection.QueryAsync<dynamic>(
            new CommandDefinition(recentOrdersSql, cancellationToken: cancellationToken));

        var recentOrdersList = new List<RecentOrderDto>();
        foreach (var row in recentOrders)
        {
            recentOrdersList.Add(new RecentOrderDto
            {
                Id = (int)row.id,
                OrderNumber = (string)row.order_number,
                CustomerName = (string)row.customer_name,
                Status = (string)row.status,
                Total = (decimal)row.total,
                CreatedAt = (DateTime)row.created_at,
                OrderType = (string)row.order_type
            });
        }

        return new DashboardSummaryDto
        {
            TodayRevenue = todayRevenue,
            RevenueChangePercent = revenueChange,
            ActiveOrders = activeOrders,
            CompletedOrdersToday = completedOrdersToday,
            AverageOrderValue = avgOrderValue,
            OrdersByStatus = ordersByStatus,
            RecentOrders = recentOrdersList
        };
    }

    // Webhook support methods (Phase 4)

    public async Task<Order?> GetOrderByExternalPaymentIdAsync(string externalPaymentId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id,
                   order_number as OrderNumber,
                   customer_id as CustomerId,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_status::text as PaymentStatus,
                   payment_method::text as PaymentMethod,
                   external_payment_id as ExternalPaymentId,
                   external_transaction_id as ExternalTransactionId,
                   paid_amount as PaidAmount,
                   paid_at as PaidAt,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   notes as Notes,
                   created_at as CreatedAt,
                   updated_at as UpdatedAt
            FROM orders
            WHERE external_payment_id = @ExternalPaymentId";

        return await connection.QueryFirstOrDefaultAsync<Order>(
            new CommandDefinition(sql, new { ExternalPaymentId = externalPaymentId }, cancellationToken: cancellationToken));
    }

    public async Task<Order?> GetOrderByPaymentIntentIdAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Same explicit aliases as every other order query in this file. Without them Dapper
        // maps by exact name, so `order_number` would not land on `OrderNumber` and the caller
        // would receive an order with a blank number and no customer — the bug that
        // OrderQueryColumnMappingTests exists to catch.
        const string sql = @"
            SELECT id,
                   order_number as OrderNumber,
                   customer_id as CustomerId,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   requested_time as RequestedTime,
                   status::text as Status,
                   payment_status::text as PaymentStatus,
                   payment_method::text as PaymentMethod,
                   payment_intent_id as PaymentIntentId,
                   external_payment_id as ExternalPaymentId,
                   external_transaction_id as ExternalTransactionId,
                   paid_amount as PaidAmount,
                   paid_at as PaidAt,
                   payment_failure_reason as PaymentFailureReason,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   notes as Notes,
                   created_at as CreatedAt,
                   updated_at as UpdatedAt
            FROM orders
            WHERE payment_intent_id = @PaymentIntentId";

        return await connection.QueryFirstOrDefaultAsync<Order>(
            new CommandDefinition(sql, new { PaymentIntentId = paymentIntentId }, cancellationToken: cancellationToken));
    }

    public async Task UpdateOrderAsync(Order order, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE orders
            SET status = @Status::order_status,
                payment_status = @PaymentStatus::payment_status,
                external_payment_id = @ExternalPaymentId,
                external_transaction_id = @ExternalTransactionId,
                paid_amount = @PaidAmount,
                paid_at = @PaidAt,
                payment_failure_reason = @PaymentFailureReason,
                notes = @Notes,
                updated_at = @UpdatedAt
            WHERE id = @Id";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    Id = order.Id,
                    Status = order.Status.ToString(),
                    PaymentStatus = order.PaymentStatus.ToString(),
                    ExternalPaymentId = order.ExternalPaymentId,
                    ExternalTransactionId = order.ExternalTransactionId,
                    PaidAmount = order.PaidAmount,
                    PaidAt = order.PaidAt,
                    PaymentFailureReason = order.PaymentFailureReason,
                    Notes = order.Notes,
                    UpdatedAt = DateTime.UtcNow
                },
                cancellationToken: cancellationToken));
    }

    public async Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE orders
            SET customer_id = @CustomerId,
                updated_at = @UpdatedAt
            WHERE order_number = @OrderNumber";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    CustomerId = customerId,
                    OrderNumber = orderNumber,
                    UpdatedAt = DateTime.UtcNow
                },
                cancellationToken: cancellationToken));
    }

    /// <summary>
    /// DTO for modifier details queries.
    /// </summary>
    private class ModifierDetails
    {
        public int id { get; set; }
        public string name { get; set; } = string.Empty;
        public decimal price_adjustment { get; set; }
    }
}
