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
                   payment_status::text as PaymentStatus,
                   paid_amount as PaidAmount,
                   paid_at as PaidAt,
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
                    order_type, requested_time, notes, allergy_declaration, payment_method,
                    subtotal, tax, total, status, created_at
                ) VALUES (
                    @OrderNumber, @CustomerName, @CustomerPhone, @CustomerEmail,
                    @OrderType::order_type, @RequestedTime, @Notes, @AllergyDeclaration, @PaymentMethod::payment_method,
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
                        AllergyDeclaration = request.AllergyDeclaration,
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

    /// <summary>
    /// Ticks or unticks one line, and reports what that leaves the order looking like.
    /// </summary>
    /// <remarks>
    /// Everything happens in one transaction, and the order row is locked, because the
    /// answer to "is this the last line?" decides whether an order moves and whether a
    /// customer is emailed. Two cooks ticking the last two lines of the same ticket at the
    /// same moment is a real event on a busy pass: without the lock both read "one line
    /// still open", both conclude they are not the last, and the order never becomes ready
    /// — food sits on the counter and nobody is told.
    ///
    /// The counts are read AFTER the write, in the same transaction, so they describe the
    /// state the tick produced rather than the state before it.
    ///
    /// The order's own status comes back too, and it is deliberately the status as of the
    /// tick — before any move the caller is about to make. That is what lets the caller
    /// tell "already Ready" (nothing to announce) from "still being cooked" (announce it).
    /// </remarks>
    /// <returns>
    /// The line's order id and new state, plus the order's line counts and status — or
    /// null when the line does not exist or does not belong to that order.
    /// </returns>
    public async Task<OrderItemCompletionResult?> SetOrderItemCompletedAsync(
        int orderId,
        int orderItemId,
        bool isCompleted,
        CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            // The `AND order_id = @OrderId` is not decoration: it is what stops a tick for
            // one order landing on a line of another. Without it the line id alone would
            // be enough, and the two ids arrive from different places on the client.
            var updated = await connection.ExecuteAsync(
                new CommandDefinition(
                    @"UPDATE order_items
                         SET is_completed = @IsCompleted,
                             completed_at = CASE WHEN @IsCompleted THEN @Now ELSE NULL END
                       WHERE id = @OrderItemId AND order_id = @OrderId",
                    new { OrderId = orderId, OrderItemId = orderItemId, IsCompleted = isCompleted, Now = DateTime.UtcNow },
                    transaction,
                    cancellationToken: cancellationToken));

            if (updated == 0)
            {
                transaction.Rollback();
                return null;
            }

            // Lock the order for the rest of the transaction, so no other tick can land
            // between the counts below and the caller's decision to finish the order.
            var statusText = await connection.ExecuteScalarAsync<string?>(
                new CommandDefinition(
                    "SELECT status::text FROM orders WHERE id = @OrderId FOR UPDATE",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (statusText is null)
            {
                transaction.Rollback();
                return null;
            }

            var counts = await connection.QuerySingleAsync<(int Total, int Done)>(
                new CommandDefinition(
                    @"SELECT COUNT(*)::int as Total,
                             COUNT(*) FILTER (WHERE is_completed)::int as Done
                        FROM order_items
                       WHERE order_id = @OrderId",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            transaction.Commit();

            return new OrderItemCompletionResult
            {
                OrderId = orderId,
                OrderItemId = orderItemId,
                IsCompleted = isCompleted,
                TotalLines = counts.Total,
                DoneLines = counts.Done,
                OrderStatus = statusText,
            };
        }
        catch
        {
            if (transaction.Connection != null) transaction.Rollback();
            throw;
        }
    }

    /// <summary>
    /// Records that the customer has been told this order is ready.
    /// </summary>
    /// <remarks>
    /// Returns whether THIS call is the one that set it. The UPDATE is guarded on the
    /// column still being null, so two requests that both believe they are the last tick
    /// cannot both send an email — the second updates zero rows and is told so. That
    /// guard, rather than the caller's own reasoning, is what makes the message
    /// exactly-once.
    /// </remarks>
    public async Task<bool> TryMarkReadyNotifiedAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var rows = await connection.ExecuteAsync(
            new CommandDefinition(
                @"UPDATE orders
                     SET ready_notified_at = @Now
                   WHERE id = @OrderId AND ready_notified_at IS NULL",
                new { OrderId = orderId, Now = DateTime.UtcNow },
                cancellationToken: cancellationToken));

        return rows > 0;
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

    public async Task<List<AdminOrderListDto>> GetAllOrdersAsync(OrderStatus? status, DateTime? fromDate, DateTime? toDate, int limit, int offset, string? orderNumber = null, bool includeItems = false, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        var conditions = new List<string>();
        var parameters = new DynamicParameters();

        if (status.HasValue)
        {
            conditions.Add("o.status = @Status::order_status");
            parameters.Add("Status", status.Value.ToString());
        }

        if (fromDate.HasValue)
        {
            conditions.Add("o.created_at >= @FromDate");
            parameters.Add("FromDate", fromDate.Value);
        }

        if (toDate.HasValue)
        {
            conditions.Add("o.created_at <= @ToDate");
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
            conditions.Add(@"o.order_number ILIKE @OrderNumberPattern ESCAPE '\'");
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
        //
        // The per-ticket line progress comes from correlated subqueries rather than a
        // second round trip: the board asks for up to a hundred orders at a time, and one
        // query per order is a hundred queries per refresh. "Not yet ticked" is counted
        // first so the partial index from 16_add_item_completion.sql serves it, and the
        // arithmetic happens in SQL so an order with no lines reports 0 of 0 rather than
        // dividing by nothing.
        //
        // `@IncludeItems` gates whether the lines themselves come back. Dapper maps a NULL
        // column to a null list (NOT to an empty one), which is exactly the distinction the
        // DTO documents: the Orders table renders no lines and does not pay for them, the
        // board renders them and does.
        // NOTE ON `o.` — every reference to the order is qualified, and the orders table is
        // aliased `o`. This is not style. The progress counters below are correlated
        // subqueries, and an unqualified `id` inside one resolves to the INNER table's id
        // (order_items.id), not to the order's. That made `tally.order_id = id` compare a
        // line's order to the line's own id — so the counters read 0 on every order while
        // the query ran happily and the endpoint answered 200. A board where every ticket
        // says "0 of 0" and nothing to cook is the result.
        var sql = $@"
            SELECT o.id,
                   o.order_number as OrderNumber,
                   o.customer_name as CustomerName,
                   o.customer_phone as CustomerPhone,
                   o.customer_email as CustomerEmail,
                   o.order_type::text as OrderType,
                   o.requested_time as RequestedTime,
                   o.status::text as Status,
                   o.payment_method::text as PaymentMethod,
                   o.payment_status::text as PaymentStatus,
                   o.subtotal as Subtotal,
                   o.total as Total,
                   o.notes as Notes,
                   o.allergy_declaration as AllergyDeclaration,
                   (SELECT COUNT(*)::int FROM order_items tally
                     WHERE tally.order_id = o.id) as ItemsDoneTotal,
                   (SELECT COUNT(*) FILTER (WHERE tally.is_completed)::int
                      FROM order_items tally
                     WHERE tally.order_id = o.id) as ItemsDoneDone,
                   CASE WHEN @IncludeItems THEN (
                       SELECT json_agg(built ORDER BY built.""Id"")
                       FROM (
                           SELECT li.id as ""Id"",
                                  li.menu_item_name as ""MenuItemName"",
                                  li.quantity as ""Quantity"",
                                  li.special_instructions as ""SpecialInstructions"",
                                  li.is_completed as ""IsCompleted"",
                                  (SELECT string_agg(md.modifier_name, ', ' ORDER BY md.id)
                                     FROM order_item_modifiers md
                                    WHERE md.order_item_id = li.id) as ""Modifiers""
                           FROM order_items li
                           WHERE li.order_id = o.id
                       ) built
                   ) END as ItemsJson,
                   o.created_at as CreatedAt
            FROM orders o
            {whereClause}
            ORDER BY o.created_at DESC
            LIMIT @Limit OFFSET @Offset";

        parameters.Add("Limit", limit);
        parameters.Add("Offset", offset);
        parameters.Add("IncludeItems", includeItems, DbType.Boolean);

        // The counters come back as two FLAT columns and are assembled into the nested DTO
        // by hand below.
        //
        // Dapper 2.1.35 maps columns to properties of the queried type; it does NOT turn a
        // dotted alias (`"ItemsDone.Total"`) into a nested object, which is a different
        // library's feature. Relying on it is how every ticket on the board read "0 of 0"
        // while this SQL returned the right numbers.
        var rows = (await connection.QueryAsync<AdminOrderListRow>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken))).AsList();

        return rows.Select(row => new AdminOrderListDto
        {
            Id = row.Id,
            OrderNumber = row.OrderNumber,
            CustomerName = row.CustomerName,
            CustomerPhone = row.CustomerPhone,
            CustomerEmail = row.CustomerEmail,
            OrderType = row.OrderType,
            RequestedTime = row.RequestedTime,
            Status = row.Status,
            PaymentMethod = row.PaymentMethod,
            PaymentStatus = row.PaymentStatus,
            Subtotal = row.Subtotal,
            Total = row.Total,
            Notes = row.Notes,
            AllergyDeclaration = row.AllergyDeclaration,
            ItemsDone = new OrderItemProgressDto { Done = row.ItemsDoneDone, Total = row.ItemsDoneTotal },
            // Null when the caller did not ask for lines, which is NOT the same as an empty
            // list: an empty array renders as a ticket with nothing to cook.
            Items = string.IsNullOrEmpty(row.ItemsJson)
                ? null
                : System.Text.Json.JsonSerializer.Deserialize<List<AdminOrderListLineDto>>(
                    row.ItemsJson, JsonOptions),
            CreatedAt = row.CreatedAt,
        }).ToList();
    }

    /// <summary>
    /// How the line subquery's JSON is read back.
    /// </summary>
    /// <remarks>
    /// Case-INsensitive is the default and is what is wanted here: the SQL projects the
    /// keys as `"MenuItemName"` to match the DTO property, and pinning the comparison means
    /// a future rename on either side fails loudly rather than producing silently null
    /// dish names on every ticket.
    /// </remarks>
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    // ══ Back-of-house (§18) ══════════════════════════════════════════════════════

    /// <summary>
    /// The kitchen's board: live orders with their dishes, cook state and holds.
    /// </summary>
    /// <remarks>
    /// Built on the same outer-select discipline as <see cref="GetAllOrdersAsync"/>, and for
    /// the same reason: inside these correlated subqueries an unqualified `id` resolves to
    /// the INNER table's column, which silently produced "0 of 0" on every ticket once
    /// already. The orders table is aliased `o` and every reference is qualified.
    ///
    /// The dishes are aggregated to JSON in the database and deserialised here, because
    /// Dapper will not map `json_agg` onto a List<T> — it throws InvalidCastException. That
    /// is the second half of the same lesson.
    /// </remarks>
    public async Task<List<KitchenTicketDto>> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // "Not finished" is expressed as "not collected and not cancelled" rather than as a
        // list of live stages, so a stage added later cannot silently fall out of the board.
        var finishedClause = includeFinished
            ? string.Empty
            : "WHERE o.status NOT IN ('Completed'::order_status, 'Cancelled'::order_status)";

        var sql = $@"
            SELECT o.id,
                   o.order_number as OrderNumber,
                   o.customer_name as CustomerName,
                   o.customer_phone as CustomerPhone,
                   o.customer_email as CustomerEmail,
                   o.order_type::text as OrderType,
                   o.requested_time as RequestedTime,
                   o.status::text as Status,
                   o.payment_method::text as PaymentMethod,
                   o.payment_status::text as PaymentStatus,
                   o.subtotal as Subtotal,
                   o.total as Total,
                   o.notes as Notes,
                   o.allergy_declaration as AllergyDeclaration,
                   o.created_at as CreatedAt,
                   o.held_at as HeldAt,
                   o.held_reason as HeldReason,
                   o.held_by as HeldBy,
                   (o.held_at IS NOT NULL) as IsHeld,
                   (SELECT COUNT(*) FILTER (WHERE li.cook_state <> 'Done')::int
                      FROM order_items li WHERE li.order_id = o.id) as RemainingLines,
                   (SELECT COUNT(*) FILTER (WHERE li.cook_state = 'Cooking')::int
                      FROM order_items li WHERE li.order_id = o.id) as CookingLines,
                   (SELECT COUNT(*)::int FROM order_items li WHERE li.order_id = o.id) as ItemsDoneTotal,
                   (SELECT COUNT(*) FILTER (WHERE li.cook_state = 'Done')::int
                      FROM order_items li WHERE li.order_id = o.id) as ItemsDoneDone,
                   CASE WHEN @IncludeItems THEN (
                       SELECT json_agg(built ORDER BY built.""Id"")
                       FROM (
                           SELECT li.id as ""Id"",
                                  li.menu_item_name as ""MenuItemName"",
                                  li.quantity as ""Quantity"",
                                  li.special_instructions as ""SpecialInstructions"",
                                  li.kitchen_note as ""KitchenNote"",
                                  li.note_by as ""NoteBy"",
                                  li.cook_state as ""CookState"",
                                  li.is_completed as ""IsCompleted"",
                                  li.started_at as ""StartedAt"",
                                  li.completed_at as ""CompletedAt"",
                                  li.cooked_by as ""CookedBy"",
                                  (SELECT string_agg(md.modifier_name, ', ' ORDER BY md.id)
                                     FROM order_item_modifiers md
                                    WHERE md.order_item_id = li.id) as ""Modifiers""
                           FROM order_items li
                           WHERE li.order_id = o.id
                       ) built
                   ) END as ItemsJson
            FROM orders o
            {finishedClause}
            ORDER BY o.requested_time ASC, o.created_at ASC";

        var parameters = new DynamicParameters();
        parameters.Add("IncludeItems", true, DbType.Boolean);

        var rows = (await connection.QueryAsync<KitchenTicketRow>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken))).AsList();

        if (rows.Count == 0) return new List<KitchenTicketDto>();

        // Overdue is judged against the WANTED time, not the placed time: an order for 7pm
        // placed at 4pm is not late at 4:05pm, it is early. Only requested_time can tell
        // those apart, which is why the ordering above is by it.
        var now = DateTime.UtcNow;

        return rows.Select(row => new KitchenTicketDto
        {
            Id = row.Id,
            OrderNumber = row.OrderNumber,
            CustomerName = row.CustomerName,
            CustomerPhone = row.CustomerPhone,
            CustomerEmail = row.CustomerEmail,
            OrderType = row.OrderType,
            RequestedTime = row.RequestedTime,
            Status = row.Status,
            PaymentMethod = row.PaymentMethod,
            PaymentStatus = row.PaymentStatus,
            Subtotal = row.Subtotal,
            Total = row.Total,
            Notes = row.Notes,
            AllergyDeclaration = row.AllergyDeclaration,
            CreatedAt = row.CreatedAt,
            HeldAt = row.HeldAt,
            HeldReason = row.HeldReason,
            HeldBy = row.HeldBy,
            IsHeld = row.IsHeld,
            RemainingLines = row.RemainingLines,
            CookingLines = row.CookingLines,
            ItemsDone = new OrderItemProgressDto { Done = row.ItemsDoneDone, Total = row.ItemsDoneTotal },
            Items = string.IsNullOrEmpty(row.ItemsJson)
                ? null
                : System.Text.Json.JsonSerializer.Deserialize<List<KitchenItemDto>>(row.ItemsJson, JsonOptions),
            AgeMinutes = (int)Math.Max(0, (now - DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc)).TotalMinutes),
            // The same five-minute rule the board uses to tell a scheduled order from an
            // immediate one, so the two screens agree about what "ASAP" means.
            IsScheduled = row.RequestedTime - row.CreatedAt > TimeSpan.FromMinutes(5),
        }).ToList();
    }

    /// <summary>
    /// Moves a dish to a cook state, in one transaction with the order locked.
    /// </summary>
    /// <remarks>
    /// The lock and the counts exist for the same reason they do in
    /// <see cref="SetOrderItemCompletedAsync"/>: "is this the last dish?" decides whether
    /// the order moves, and two cooks finishing the last two dishes at once must not both
    /// conclude they are not last.
    ///
    /// `is_completed` is kept in step with `cook_state` rather than replaced, so the write
    /// path that shipped in migration 16 keeps working and nothing that reads the boolean
    /// has to learn a second concept. The two are updated together, in one statement, so
    /// they cannot disagree.
    /// </remarks>
    public async Task<CookStateResult?> SetItemCookStateAsync(
        int orderId,
        int orderItemId,
        string state,
        string? actor,
        CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            var now = DateTime.UtcNow;
            var done = state == "Done";

            // The `AND order_id = @OrderId` scoping is not decoration: it is what stops a
            // move for one order landing on a line of another, and the two ids arrive from
            // different places on the client.
            //
            // `started_at` is set the first time a dish enters Cooking and NOT cleared when
            // it moves on to Done — "when did this go on the wok" is the question a
            // post-mortem asks, and a column that forgets it cannot answer.
            var updated = await connection.ExecuteAsync(
                new CommandDefinition(
                    @"UPDATE order_items
                         SET cook_state = @State,
                             is_completed = @Done,
                             started_at = CASE
                                 WHEN @State = 'Cooking' THEN COALESCE(started_at, @Now)
                                 WHEN @State = 'Queued' THEN NULL
                                 ELSE started_at END,
                             cooked_by = CASE
                                 WHEN @State = 'Queued' THEN NULL
                                 ELSE @Actor END,
                             completed_at = CASE WHEN @Done THEN @Now ELSE NULL END
                       WHERE id = @OrderItemId AND order_id = @OrderId",
                    new { OrderId = orderId, OrderItemId = orderItemId, State = state, Done = done, Actor = actor, Now = now },
                    transaction,
                    cancellationToken: cancellationToken));

            if (updated == 0)
            {
                transaction.Rollback();
                return null;
            }

            var statusText = await connection.ExecuteScalarAsync<string?>(
                new CommandDefinition(
                    "SELECT status::text FROM orders WHERE id = @OrderId FOR UPDATE",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (statusText is null)
            {
                transaction.Rollback();
                return null;
            }

            var counts = await connection.QuerySingleAsync<(int Total, int Done, int Cooking)>(
                new CommandDefinition(
                    @"SELECT COUNT(*)::int as Total,
                             COUNT(*) FILTER (WHERE cook_state = 'Done')::int as Done,
                             COUNT(*) FILTER (WHERE cook_state = 'Cooking')::int as Cooking
                        FROM order_items
                       WHERE order_id = @OrderId",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            transaction.Commit();

            return new CookStateResult
            {
                OrderId = orderId,
                OrderItemId = orderItemId,
                State = state,
                TotalLines = counts.Total,
                DoneLines = counts.Done,
                CookingLines = counts.Cooking,
                OrderStatus = statusText,
            };
        }
        catch
        {
            if (transaction.Connection != null) transaction.Rollback();
            throw;
        }
    }

    public async Task<bool> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // An empty note clears both the text and its author: leaving the author behind on
        // a blank note would read as somebody having said something.
        var rows = await connection.ExecuteAsync(
            new CommandDefinition(
                @"UPDATE order_items
                     SET kitchen_note = @Note,
                         note_by = CASE WHEN @Note IS NULL THEN NULL ELSE @Actor END
                   WHERE id = @OrderItemId AND order_id = @OrderId",
                new { OrderId = orderId, OrderItemId = orderItemId, Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(), Actor = actor },
                cancellationToken: cancellationToken));

        return rows > 0;
    }

    public async Task<bool> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Holding stamps who and why; resuming clears all three, because a stale reason on
        // a live order is a lie the next person acts on.
        var rows = await connection.ExecuteAsync(
            new CommandDefinition(
                @"UPDATE orders
                     SET held_at = CASE WHEN @Held THEN @Now ELSE NULL END,
                         held_reason = CASE WHEN @Held THEN @Reason ELSE NULL END,
                         held_by = CASE WHEN @Held THEN @Actor ELSE NULL END,
                         updated_at = @Now
                   WHERE id = @OrderId",
                new { OrderId = orderId, Held = held, Reason = reason, Actor = actor, Now = DateTime.UtcNow },
                cancellationToken: cancellationToken));

        return rows > 0;
    }

    public async Task AddActivityAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        await connection.ExecuteAsync(
            new CommandDefinition(
                @"INSERT INTO order_activity (order_id, order_item_id, kind, detail, actor, status_at_event)
                  VALUES (@OrderId, @OrderItemId, @Kind, @Detail, @Actor, @StatusAtEvent)",
                new { OrderId = orderId, OrderItemId = orderItemId, Kind = kind, Detail = detail, Actor = actor, StatusAtEvent = statusAtEvent },
                cancellationToken: cancellationToken));
    }

    public async Task<List<OrderActivityDto>> GetActivityAsync(int orderId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Aliased exactly, for the reason every other query in this file is: Dapper maps by
        // property name with underscore matching off, so `status_at_event` maps to nothing
        // and arrives null on every row.
        const string sql = @"
            SELECT id as Id,
                   kind as Kind,
                   detail as Detail,
                   actor as Actor,
                   status_at_event as StatusAtEvent,
                   created_at as CreatedAt
            FROM order_activity
            WHERE order_id = @OrderId
            ORDER BY created_at DESC, id DESC";

        var rows = await connection.QueryAsync<OrderActivityDto>(
            new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        return rows.AsList();
    }

    /// <summary>
    /// One kitchen-board row, with the JSON and counters flattened.
    /// </summary>
    /// <remarks>
    /// A reading shape only. `GetKitchenBoardAsync` projects this and then builds the DTO,
    /// so `ItemsDone` can be assembled from two columns and the JSON deserialised — see the
    /// comment at the query for why both of those steps are necessary.
    /// </remarks>
    private sealed class KitchenTicketRow
    {
        public int Id { get; set; }
        public string OrderNumber { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string CustomerPhone { get; set; } = string.Empty;
        public string CustomerEmail { get; set; } = string.Empty;
        public string OrderType { get; set; } = string.Empty;
        public DateTime RequestedTime { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? PaymentMethod { get; set; }
        public string? PaymentStatus { get; set; }
        public decimal Subtotal { get; set; }
        public decimal Total { get; set; }
        public string? Notes { get; set; }
        public string? AllergyDeclaration { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? HeldAt { get; set; }
        public string? HeldReason { get; set; }
        public string? HeldBy { get; set; }
        public bool IsHeld { get; set; }
        public int RemainingLines { get; set; }
        public int CookingLines { get; set; }
        public int ItemsDoneTotal { get; set; }
        public int ItemsDoneDone { get; set; }
        public string? ItemsJson { get; set; }
    }

    /// <summary>
    /// One row of the admin order list, with the progress counters flattened.
    /// </summary>
    /// <remarks>
    /// A shape for reading only: `GetAllOrdersAsync` projects this and then builds the
    /// real DTO, so the nested <c>ItemsDone</c> object can be filled from two columns.
    /// See the comment at the query for why that is necessary rather than a dotted alias.
    /// </remarks>
    private sealed class AdminOrderListRow
    {
        public int Id { get; set; }
        public string OrderNumber { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string CustomerPhone { get; set; } = string.Empty;
        public string CustomerEmail { get; set; } = string.Empty;
        public string OrderType { get; set; } = string.Empty;
        public DateTime RequestedTime { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? PaymentMethod { get; set; }
        public string? PaymentStatus { get; set; }
        public decimal Subtotal { get; set; }
        public decimal Total { get; set; }
        public string? Notes { get; set; }
        public string? AllergyDeclaration { get; set; }

        /// <summary>Every line on the order.</summary>
        public int ItemsDoneTotal { get; set; }

        /// <summary>Lines ticked.</summary>
        public int ItemsDoneDone { get; set; }

        /// <summary>
        /// The lines as RAW JSON, deserialised after the query.
        /// </summary>
        /// <remarks>
        /// A string, not a list. `json_agg` comes back through Npgsql as text, and Dapper
        /// will not convert text to a List&lt;T&gt; — it throws InvalidCastException and the
        /// whole endpoint 500s. Reading it as a string and parsing it is what the driver
        /// actually supports.
        /// </remarks>
        public string? ItemsJson { get; set; }

        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// One row of the kitchen ticket's item join, mapped onto a TYPE.
    /// </summary>
    /// <remarks>
    /// Typed rather than dynamic for the reason spelled out at the query: an untyped
    /// row turns a missing column into a runtime binder failure instead of a compile
    /// error, and this query's LEFT JOIN means the modifier columns are routinely
    /// absent. Every modifier field is therefore nullable — that is what the join
    /// actually produces, and saying so is what stops the next `(decimal)` cast on a
    /// null from taking the endpoint down.
    /// </remarks>
    private sealed class AdminOrderItemRow
    {
        public int ItemId { get; set; }
        public int MenuItemId { get; set; }
        public string MenuItemName { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal TotalPrice { get; set; }
        public string? SpecialInstructions { get; set; }
        public bool IsCompleted { get; set; }
        public DateTime? CompletedAt { get; set; }

        // Null unless the dish has a modifier: the LEFT JOIN's all-null row.
        public int? ModifierRowId { get; set; }
        public int? ModifierId { get; set; }
        public string? ModifierName { get; set; }
        public decimal? PriceAdjustment { get; set; }
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
                   allergy_declaration as AllergyDeclaration,
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
                oi.is_completed as IsCompleted,
                oi.completed_at as CompletedAt,
                oim.id as ModifierRowId,
                oim.modifier_id as ModifierId,
                oim.modifier_name as ModifierName,
                oim.price_adjustment as PriceAdjustment
            FROM order_items oi
            LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
            WHERE oi.order_id = @OrderId
            ORDER BY oi.id ASC, oim.id ASC";

        // Mapped onto a TYPED row, not Dapper's dynamic one.
        //
        // This was the last untyped query in the file, and it was an outage. Read back
        // through `QueryAsync` with no type argument, every column arrives as `dynamic`,
        // so `(decimal)row.PriceAdjustment` compiles whatever the column is called — and
        // resolves at RUNTIME to a dynamic member that simply is not there. Postgres
        // folds an unquoted `as PriceAdjustment` to `priceadjustment`, so the cast found
        // nothing and threw:
        //
        //   RuntimeBinderException: Cannot convert null to 'decimal' because it is a
        //   non-nullable value type
        //
        // The row-level null check below was no defence: it skips a modifier that is not
        // there, but an order whose dishes have NO modifiers still reaches inside the
        // branch's columns — all of which are NULL from the LEFT JOIN — and the first
        // non-nullable cast dies. Every order with no modifiers on any line 500'd, which
        // on this menu is most of them: staff could see a ticket on the board and not
        // open it.
        //
        // A typed row is the fix rather than a null guard, because the type is what makes
        // the compiler reject the next version of this mistake. That is the same reason
        // AdminOrderListRow exists, and the reason this one bug is the fifth of its family
        // in this file.
        var itemsData = await connection.QueryAsync<AdminOrderItemRow>(
            new CommandDefinition(itemsSql, new { OrderId = orderId }, cancellationToken: cancellationToken));

        // Group items with their modifiers
        var itemsDict = new Dictionary<int, AdminOrderItemDto>();
        foreach (var row in itemsData)
        {
            if (!itemsDict.ContainsKey(row.ItemId))
            {
                itemsDict[row.ItemId] = new AdminOrderItemDto
                {
                    Id = row.ItemId,
                    MenuItemId = row.MenuItemId,
                    MenuItemName = row.MenuItemName,
                    Quantity = row.Quantity,
                    UnitPrice = row.UnitPrice,
                    TotalPrice = row.TotalPrice,
                    SpecialInstructions = row.SpecialInstructions,
                    IsCompleted = row.IsCompleted,
                    CompletedAt = row.CompletedAt,
                    Modifiers = new List<AdminOrderItemModifierDto>()
                };
            }

            // The LEFT JOIN produces one all-null modifier row for an item that has
            // none, so the check is on the modifier's own id rather than the row.
            // Nullable on the row type, so the check is now enforced rather than
            // remembered.
            if (row.ModifierRowId is not null)
            {
                itemsDict[row.ItemId].Modifiers.Add(new AdminOrderItemModifierDto
                {
                    Id = row.ModifierRowId.Value,
                    ModifierId = row.ModifierId ?? 0,
                    ModifierName = row.ModifierName ?? string.Empty,
                    PriceAdjustment = row.PriceAdjustment ?? 0m
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


    /// <summary>
    /// Replaces an order's lines and recomputes its total, atomically.
    /// </summary>
    /// <remarks>
    /// One transaction, for the reason in the interface: a half-written edit leaves a
    /// total that disagrees with its own lines, and nothing later can tell that it
    /// happened. Inside the transaction the old lines are deleted, the new ones
    /// inserted, and the order's subtotal and total recomputed from what was inserted.
    ///
    /// The total is recomputed from the LINE VALUES rather than summed by the caller, so
    /// the arithmetic happens in one place and cannot drift from the rows it describes.
    /// `tax` stays zero because prices are GST-inclusive (docs/TODO.md §8).
    ///
    /// Deliberately does not touch `paid_amount`: an edit changes what is owed, not what
    /// was taken. A refund is the only thing that moves money, and conflating the two
    /// would let an edit silently rewrite a payment record.
    /// </remarks>
    public async Task<(decimal Subtotal, decimal Total)?> ReplaceOrderItemsAsync(
        int orderId,
        IReadOnlyList<OrderLineWrite> lines,
        CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            // The order must exist, and be locked for the duration: two concurrent edits
            // otherwise interleave their delete/insert pairs and produce a total that
            // matches neither.
            var exists = await connection.ExecuteScalarAsync<int?>(
                new CommandDefinition(
                    "SELECT id FROM orders WHERE id = @OrderId FOR UPDATE",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            if (exists is null)
            {
                transaction.Rollback();
                return null;
            }

            // Old lines go first. `order_item_modifiers` is removed explicitly rather
            // than relying on a cascade, so the deletion is visible in this file and does
            // not depend on a constraint someone might later drop.
            await connection.ExecuteAsync(
                new CommandDefinition(
                    @"DELETE FROM order_item_modifiers
                      WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = @OrderId)",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            await connection.ExecuteAsync(
                new CommandDefinition(
                    "DELETE FROM order_items WHERE order_id = @OrderId",
                    new { OrderId = orderId },
                    transaction,
                    cancellationToken: cancellationToken));

            // Re-attach modifiers by id, priced from the menu — the same source of truth
            // the checkout uses.
            var allModifierIds = lines.SelectMany(l => l.ModifierIds).Distinct().ToList();
            var modifierDetails = new Dictionary<int, (string name, decimal price)>();
            if (allModifierIds.Count > 0)
            {
                var modifierPlaceholders = string.Join(",", allModifierIds.Select((_, i) => $"@mod{i}"));
                var modifierParams = new DynamicParameters();
                for (var i = 0; i < allModifierIds.Count; i++) modifierParams.Add($"mod{i}", allModifierIds[i]);

                var modifiers = await connection.QueryAsync<ModifierDetails>(
                    new CommandDefinition(
                        $"SELECT id, name, price_adjustment FROM modifiers WHERE id IN ({modifierPlaceholders})",
                        modifierParams,
                        transaction,
                        cancellationToken: cancellationToken));

                modifierDetails = modifiers.ToDictionary(m => m.id, m => (m.name, m.price_adjustment));
            }

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

            decimal subtotal = 0;

            foreach (var line in lines)
            {
                var modifierPrice = line.ModifierIds
                    .Where(id => modifierDetails.ContainsKey(id))
                    .Sum(id => modifierDetails[id].price);

                var unitPrice = line.UnitPrice + modifierPrice;
                var totalPrice = unitPrice * line.Quantity;
                subtotal += totalPrice;

                var orderItemId = await connection.QuerySingleAsync<int>(
                    new CommandDefinition(
                        itemSql,
                        new
                        {
                            OrderId = orderId,
                            MenuItemId = line.MenuItemId,
                            MenuItemName = line.MenuItemName,
                            Quantity = line.Quantity,
                            UnitPrice = unitPrice,
                            TotalPrice = totalPrice,
                            SpecialInstructions = line.SpecialInstructions,
                        },
                        transaction,
                        cancellationToken: cancellationToken));

                foreach (var modifierId in line.ModifierIds)
                {
                    if (!modifierDetails.TryGetValue(modifierId, out var modifier)) continue;

                    await connection.ExecuteAsync(
                        new CommandDefinition(
                            modifierSql,
                            new
                            {
                                OrderItemId = orderItemId,
                                ModifierId = modifierId,
                                ModifierName = modifier.name,
                                PriceAdjustment = modifier.price,
                            },
                            transaction,
                            cancellationToken: cancellationToken));
                }
            }

            var total = subtotal; // GST-inclusive: see docs/TODO.md §8. Tax is a label, not an addition.

            await connection.ExecuteAsync(
                new CommandDefinition(
                    @"UPDATE orders
                      SET subtotal = @Subtotal,
                          tax = 0,
                          total = @Total,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE id = @OrderId",
                    new { OrderId = orderId, Subtotal = subtotal, Total = total },
                    transaction,
                    cancellationToken: cancellationToken));

            transaction.Commit();

            return (subtotal, total);
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
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
                allergy_declaration = @AllergyDeclaration,
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
                    AllergyDeclaration = order.AllergyDeclaration,
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
