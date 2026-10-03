using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards that the admin order list maps its columns to the C# properties.
///
/// Regression context: <c>GetAllOrdersAsync</c> selected <c>order_number</c> and
/// <c>customer_name</c> without aliases. Dapper maps columns by exact name and
/// underscore matching is off, so those columns mapped to nothing: the admin
/// orders endpoint returned <c>"orderNumber": ""</c> and <c>"customerName": ""</c>
/// for EVERY row.
///
/// The failure was close to invisible. The list still rendered, with the correct
/// totals, the correct status and the correct row count — only the Order # and
/// Customer columns were blank, which reads like missing data rather than a
/// mapping bug. It was found by opening the deployed dashboard and noticing the
/// order numbers were empty. A kitchen cannot work from a list where no order has
/// a number.
///
/// This is a text assertion rather than a database test for the same reason the
/// seed tests are: the defect is a missing SQL clause, and asserting on it needs no
/// database. The whole class of bug is "a selected column has no alias whose name
/// matches a property", which is exactly what these checks express.
///
/// A NOTE ON THE LINE SUBQUERY. The list query now also fetches each order's lines
/// (`includeItems`), for the kitchen board's tickets. That subquery is JSON: it
/// builds `json_agg`, joins `order_item_modifiers`, and uses `string_agg` for the
/// modifiers — none of which is a column being mapped to a property, and all of
/// which is legitimately unaliased. So the two checks that scan the projection
/// compare only the OUTER select, and the subquery's own aliases are asserted on
/// separately further down. Folding both into one grep is how this guard would
/// start failing on correct SQL and get deleted by whoever hit it next.
/// </summary>
public class OrderQueryColumnMappingTests
{
    private static string OrderRepositorySource()
    {
        // Walk up from the test binary to the repo root, then read the real file.
        // Reading the shipped source keeps the test honest: it asserts on what the
        // query actually contains, not on a copy that can drift.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");

        var path = Path.Combine(dir!.FullName, "src", "AsianTaste.API", "Repositories", "OrderRepository.cs");
        Assert.True(File.Exists(path), $"OrderRepository.cs not found at {path}");

        return File.ReadAllText(path);
    }

    /// <summary>
    /// The outer projection of a query: the text between SELECT and FROM orders.
    /// </summary>
    /// <remarks>
    /// The outer projection only. A subquery inside it has its own SELECT/FROM pair, and
    /// a guard that scanned the whole thing would flag `json_agg`, `string_agg` and the
    /// line table's own column names as unaliased columns — which they are, and which is
    /// correct there, because they are JSON keys rather than mapped properties.
    ///
    /// The caller is expected to cut the subqueries out itself (see
    /// <see cref="WithoutSubqueries"/>); this just finds the outer bounds.
    /// </remarks>
    private static string OuterSelectOf(string body)
    {
        var select = body[body.IndexOf("SELECT", StringComparison.Ordinal)..];

        // Start-of-line `FROM orders`, not the first occurrence: the projections contain
        // "FROM order_items" and reference `orders.id`, so a plain IndexOf would cut the
        // projection short and report correct SQL as broken.
        var end = Regex.Match(select, @"^\s*FROM orders\b", RegexOptions.Multiline);
        Assert.True(end.Success, "Could not find the outer 'FROM orders' in the list query.");

        return select[..end.Index];
    }

    /// <summary>
    /// Drops the scalar subqueries from a projection, leaving only the columns the query
    /// maps through Dapper.
    /// </summary>
    /// <remarks>
    /// The line subquery and the two counters are JSON/SQL aggregates, not mapped columns.
    /// A guard that read them as columns would fail on correct SQL, and a guard that fails
    /// on correct SQL gets deleted by whoever hits it next — so the subqueries are removed
    /// here, and asserted on separately.
    ///
    /// Anything inside a `SELECT ( ... )` or `CASE WHEN ... THEN ( ... ) END` is treated as
    /// a subquery, which is precisely the shape the list query uses.
    /// </remarks>
    private static string WithoutSubqueries(string select)
    {
        var result = new System.Text.StringBuilder();
        var depth = 0;

        foreach (var ch in select)
        {
            if (ch == '(') depth++;
            else if (ch == ')') depth = Math.Max(0, depth - 1);

            // Only top-level text is kept.
            if (depth == 0) result.Append(ch);
        }

        return result.ToString();
    }

    /// <summary>Extracts the body of one method so assertions cannot leak across queries.</summary>
    private static string MethodBody(string source, string signature)
    {
        var start = source.IndexOf(signature, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Method not found: {signature}");

        // Walk braces from the first '{' after the signature to find the real end.
        var open = source.IndexOf('{', start);
        var depth = 0;
        for (var i = open; i < source.Length; i++)
        {
            if (source[i] == '{') depth++;
            else if (source[i] == '}')
            {
                depth--;
                if (depth == 0) return source[open..(i + 1)];
            }
        }

        throw new InvalidOperationException($"Unbalanced braces in {signature}");
    }

    [Fact]
    public void The_admin_order_list_aliases_its_snake_case_columns()
    {
        // These are the columns the admin table renders. Without the alias each
        // one arrives empty while the row itself still comes back.
        var body = OuterSelectOf(MethodBody(OrderRepositorySource(), "GetAllOrdersAsync("));

        foreach (var (column, property) in new[]
                 {
                     ("order_number", "OrderNumber"),
                     ("customer_name", "CustomerName"),
                     ("customer_phone", "CustomerPhone"),
                     ("customer_email", "CustomerEmail"),
                     ("requested_time", "RequestedTime"),
                 })
        {
            var pattern = $@"\b{column}\s+as\s+{property}\b";
            Assert.True(
                Regex.IsMatch(body, pattern, RegexOptions.IgnoreCase),
                $"GetAllOrdersAsync selects '{column}' without 'as {property}'. Dapper maps by exact " +
                $"name and underscore matching is off, so the property would be empty for every row. " +
                $"That is how the admin order list showed blank Order # and Customer columns.");
        }
    }

    [Fact]
    public void No_bare_snake_case_column_is_left_unaliased_in_the_order_list()
    {
        // Catch-all for a column added later: any snake_case identifier must be
        // followed by an alias. Enum casts (::text as X) are covered by the same
        // rule, since they also need the alias.
        var select = WithoutSubqueries(OuterSelectOf(MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(")));

        // The JSON line subquery must still be there — if it disappeared, this guard would
        // pass vacuously while the board lost the ability to show what to cook.
        Assert.Contains("IncludeItems", MethodBody(OrderRepositorySource(), "GetAllOrdersAsync("));

        // Strip aliased forms, quoted aliases and casts, then look for any leftover
        // snake_case name.
        var withoutAliases = Regex.Replace(select, """\w+(::text)?\s+as\s+"?\w+"?""", " ");
        var leftovers = Regex.Matches(withoutAliases, @"\b[a-z]+(?:_[a-z]+)+\b")
            .Select(m => m.Value)
            .Distinct()
            .ToList();

        Assert.True(
            leftovers.Count == 0,
            "These columns are selected without an alias, so they map to no property and arrive " +
            $"empty: {string.Join(", ", leftovers)}");
    }

    [Fact]
    public void The_sibling_queries_that_already_work_still_alias_their_columns()
    {
        // GetOrderByIdAsync and GetOrderByNumberAsync were fixed before this and
        // must not regress while attention is on the list query. They are the ones
        // that feed the order detail page and the confirmation email.
        var source = OrderRepositorySource();

        foreach (var signature in new[] { "GetOrderByIdAsync(", "GetOrderByNumberAsync(" })
        {
            var body = MethodBody(source, signature);
            Assert.True(
                Regex.IsMatch(body, @"\border_number\s+as\s+OrderNumber\b", RegexOptions.IgnoreCase),
                $"{signature} lost its 'order_number as OrderNumber' alias.");
            Assert.True(
                Regex.IsMatch(body, @"\bcustomer_name\s+as\s+CustomerName\b", RegexOptions.IgnoreCase),
                $"{signature} lost its 'customer_name as CustomerName' alias.");
        }
    }

    [Fact]
    public void GetOrderByIdAsync_selects_the_payment_columns_its_callers_read()
    {
        // ISSUE FOUND 2026-10-02, and it is the same shape as the rest of this file.
        //
        // This query omitted payment_status and paid_amount while the Order entity has
        // both, so `order.PaymentStatus` was ALWAYS the enum's default and
        // `order.PaidAmount` was always null. Nothing errored — the properties simply
        // read as "nobody has paid", which is a plausible value.
        //
        // The consequence was concrete: OrderService.UpdateOrderItemsAsync uses those
        // fields to tell the operator what an edit did to the money, so BuildPaymentNote
        // took its "never paid online" branch for EVERY order — including a card order
        // that had been charged. A staff member adding a dish to a paid order was told to
        // collect the whole new total, which is money the customer had already handed
        // over. It was found by adding a dish to a paid counter order and reading the
        // confirmation.
        //
        // GetOrderByIdAsync is the one that matters here: four of its five callers only
        // read `Status`, and this is the only caller that reads money.
        var body = MethodBody(OrderRepositorySource(), "GetOrderByIdAsync(");

        foreach (var (column, property) in new[]
                 {
                     ("payment_status::text", "PaymentStatus"),
                     ("paid_amount", "PaidAmount"),
                     ("paid_at", "PaidAt"),
                 })
        {
            var pattern = $@"\b{Regex.Escape(column)}\s+as\s+{property}\b";
            Assert.True(
                Regex.IsMatch(body, pattern, RegexOptions.IgnoreCase),
                $"GetOrderByIdAsync does not select '{column} as {property}'. The Order entity has that " +
                $"property, so it silently keeps its DEFAULT instead of erroring — and " +
                $"UpdateOrderItemsAsync reads it to describe what an edit did to the money, which " +
                $"means every order is reported as never paid.");
        }
    }

    [Fact]
    public void The_admin_ticket_aliases_the_columns_it_shows()
    {
        // The kitchen's ticket. This query aliased NOTHING, and every property it
        // maps is a multi-word name, so the ticket page rendered a blank order
        // number, a blank customer, a blank status and a blank service — while the
        // page itself looked fine, which is what made it read as missing data.
        var body = MethodBody(OrderRepositorySource(), "GetAdminOrderDetailAsync(");

        foreach (var (column, property) in new[]
                 {
                     ("order_number", "OrderNumber"),
                     ("customer_name", "CustomerName"),
                     ("customer_phone", "CustomerPhone"),
                     ("customer_email", "CustomerEmail"),
                     ("requested_time", "RequestedTime"),
                     ("payment_status::text", "PaymentStatus"),
                     ("paid_amount", "PaidAmount"),
                     ("paid_at", "PaidAt"),
                     ("payment_failure_reason", "PaymentFailureReason"),
                     ("created_at", "CreatedAt"),
                 })
        {
            var pattern = $@"\b{column}\s+as\s+{property}\b";
            Assert.True(
                Regex.IsMatch(body, pattern, RegexOptions.IgnoreCase),
                $"GetAdminOrderDetailAsync selects '{column}' without 'as {property}', so the kitchen's " +
                $"ticket shows nothing for it. Dapper maps by exact name and underscore matching is off.");
        }
    }

    [Fact]
    public void The_admin_ticket_aliases_both_id_columns_in_its_item_join()
    {
        // order_items and order_item_modifiers are both joined and both have an `id`.
        // Unaliased, the second one silently overrides the first, so an item row's
        // own id becomes its modifier's id.
        var body = MethodBody(OrderRepositorySource(), "GetAdminOrderDetailAsync(");

        Assert.True(
            Regex.IsMatch(body, @"\boi\.id\s+as\s+\w+", RegexOptions.IgnoreCase),
            "GetAdminOrderDetailAsync selects oi.id without an alias, so it collides with oim.id.");
        Assert.True(
            Regex.IsMatch(body, @"\boim\.id\s+as\s+\w+", RegexOptions.IgnoreCase),
            "GetAdminOrderDetailAsync selects oim.id without an alias, so it collides with oi.id.");
    }

    [Fact]
    public void The_admin_order_list_carries_the_payment_state()
    {
        // The console has to be able to tell a declined card from a paid one. Without
        // payment_status in the list's projection the only signal left is the payment
        // METHOD, which says "card" for a charge that never succeeded.
        var method = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.True(
            Regex.IsMatch(OuterSelectOf(method), @"\bpayment_status::text\s+as\s+PaymentStatus\b", RegexOptions.IgnoreCase),
            "GetAllOrdersAsync does not select payment_status, so the console cannot tell a declined " +
            "card from a paid one.");

        Assert.True(
            Regex.IsMatch(method, @"\bQueryAsync<AdminOrderListRow>", RegexOptions.IgnoreCase),
            "GetAllOrdersAsync must map onto a purpose-built row type rather than the Order entity: the " +
            "entity publishes every column the table has, including the ones the console never shows.");

        Assert.False(
            Regex.IsMatch(method, @"\bQueryAsync<Order>", RegexOptions.IgnoreCase),
            "GetAllOrdersAsync must not map onto the Order ENTITY — it selects a list's worth of " +
            "columns, and the entity would leave the omitted ones at their defaults.");
    }

    [Fact]
    public void The_order_list_line_subquery_aliases_the_fields_the_board_renders()
    {
        // The board's ticket renders each line, so these names come back through JSON and
        // must match AdminOrderListLineDto's properties exactly — JSON is case-sensitive,
        // so `menu_item_name` here would arrive as a null property on every line while the
        // ticket still drew, with blank dish names.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        foreach (var property in new[]
                 {
                     "Id", "MenuItemName", "Quantity", "SpecialInstructions", "IsCompleted", "Modifiers",
                 })
        {
            // The alias IS the quoted JSON key, written in the SQL as a doubled quote
            // (`as ""MenuItemName""`), because the whole statement is a verbatim string.
            var pattern = "as\\s+\"\"?" + property + "\"\"?";
            Assert.True(
                Regex.IsMatch(body, pattern),
                $"The line subquery does not alias a column as \"{property}\", so the kitchen board's " +
                "ticket has nothing to show for it. JSON keys are case-sensitive and must match the " +
                "AdminOrderListLineDto property name exactly.");
        }

        Assert.True(
            Regex.IsMatch(body, @"\bli\.is_completed\s+as", RegexOptions.IgnoreCase),
            "The line subquery does not select is_completed, so every dish would render as " +
            "outstanding on a ticket whose food is already on the pass.");
    }

    [Fact]
    public void The_order_list_reports_line_progress_from_flat_columns()
    {
        // The counters are selected as FLAT columns and assembled into the nested DTO in
        // C#, because Dapper 2.1.35 does not turn a dotted alias into a nested object.
        // Relying on that silently produced "0 of 0" on every ticket while the SQL returned
        // the right numbers — see The_include_items_flag_is_sent_as_a_typed_boolean and
        // Every_reference_to_the_order_is_qualified_in_the_list_subqueries.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        foreach (var column in new[] { "ItemsDoneTotal", "ItemsDoneDone" })
        {
            Assert.True(
                Regex.IsMatch(body, $@"as {column}\b"),
                $"GetAllOrdersAsync does not select '{column}', so the board's per-ticket progress " +
                $"has nothing to count.");
        }

        Assert.True(
            Regex.IsMatch(body, @"new OrderItemProgressDto\s*\{[^}]*Done\s*=[^}]*Total\s*=", RegexOptions.Singleline),
            "The flat counters must be assembled into OrderItemProgressDto; leaving them as two loose " +
            "column properties means the DTO's ItemsDone never gets filled.");
    }

    [Fact]
    public void An_aggregate_cast_comes_after_the_filter_clause()
    {
        // Regression, found by running the query rather than by reading it: `COUNT(*)::int
        // FILTER (WHERE ...)` is a SYNTAX ERROR at the database (SQLSTATE 42601, "syntax
        // error at or near FILTER") because FILTER attaches to the aggregate call and not
        // to the cast that follows it. The whole admin order list returned HTTP 500 — the
        // kitchen board was a blank error page — while every unit test passed, because the
        // defect only exists in the SQL text.
        //
        // Postgres accepts both `COUNT(*) FILTER (WHERE ...)::int` and `(COUNT(*) FILTER
        // (WHERE ...))::int`. What it never accepts is the cast BEFORE the filter.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.False(
            Regex.IsMatch(body, @"COUNT\s*\([^)]*\)\s*::\s*\w+\s+FILTER", RegexOptions.IgnoreCase),
            "GetAllOrdersAsync casts an aggregate BEFORE its FILTER clause, which is a syntax error in " +
            "Postgres (SQLSTATE 42601). Write COUNT(*) FILTER (WHERE ...)::int instead — this made the " +
            "entire admin order list return 500.");
    }

    [Fact]
    public void The_include_items_flag_is_sent_as_a_typed_boolean()
    {
        // Regression, found by running the endpoint: added as a bare C# bool, Dapper sent
        // `IncludeItems` as TEXT, so `CASE WHEN 'true' THEN ...` reached Postgres as an
        // untyped literal that the CASE read as false. `includeItems=true` therefore
        // returned NO lines on every order while still answering 200 — the board's tickets
        // rendered with nothing to cook, which reads as "this order has no items" rather
        // than as a broken flag.
        //
        // The SQL itself is fine; the bug lived entirely in the parameter, which is the
        // kind of defect only a real database finds.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.True(
            Regex.IsMatch(body, @"Add\(""IncludeItems""\s*,\s*\w+\s*,\s*DbType\.Boolean\s*\)"),
            "GetAllOrdersAsync adds the IncludeItems parameter without DbType.Boolean, so it is sent " +
            "as text and the CASE always takes the false branch — every ticket comes back with no " +
            "lines and no indication that anything went wrong.");
    }

    [Fact]
    public void Every_reference_to_the_order_is_qualified_in_the_list_subqueries()
    {
        // Regression, found by running the endpoint against a real order that HAD lines:
        // the line-progress counters are correlated subqueries over order_items, and an
        // unqualified `id` inside one resolves to the INNER table's id (order_items.id),
        // not the order's. `WHERE tally.order_id = id` therefore compared a line's order to
        // the line's own id — always false, so every ticket read "0 of 0" while the query
        // ran happily and the endpoint answered 200.
        //
        // Nothing about that is visible by reading the SQL, which is why it is pinned here:
        // the tables are aliased and the correlation is spelled out.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.True(
            Regex.IsMatch(body, @"\bFROM orders o\b"),
            "GetAllOrdersAsync must alias the orders table as `o`, so the correlated subqueries can " +
            "refer to the order unambiguously.");

        Assert.True(
            Regex.IsMatch(body, @"tally\.order_id\s*=\s*o\.id"),
            "The line-progress counters must correlate on `o.id`. An unqualified `id` resolves to " +
            "order_items.id inside the subquery, so the counts are always zero.");

        Assert.True(
            Regex.IsMatch(body, @"li\.order_id\s*=\s*o\.id"),
            "The line subquery must correlate on `o.id` for the same reason.");

        // The WHERE clause is built in C# and interpolated into this query, so its columns
        // have to carry the alias too or they become ambiguous the moment a subquery joins in.
        foreach (var column in new[] { "status", "created_at", "order_number" })
        {
            Assert.True(
                Regex.IsMatch(body, $@"conditions\.Add\([^)]*\bo\.{column}\b"),
                $"The list filter on '{column}' must be qualified as o.{column}; unqualified, it is " +
                $"ambiguous against the line subquery and the query fails or matches the wrong rows.");
        }
    }

    [Fact]
    public void The_line_json_is_read_as_text_and_deserialised()
    {
        // Regression, found by running the endpoint: Dapper will not convert the text that
        // `json_agg` returns into a List<T>. Asking it to made every request throw
        // InvalidCastException and the whole list 500 — the kitchen board was an error page.
        //
        // So the row type holds a STRING and the DTO is built from it explicitly.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.True(
            Regex.IsMatch(body, @"as ItemsJson"),
            "The line subquery must be aliased as ItemsJson and read as text; Dapper cannot map " +
            "json_agg directly onto a List<T> and throws InvalidCastException.");

        Assert.True(
            Regex.IsMatch(body, @"Deserialize<List<AdminOrderListLineDto>>"),
            "The line JSON must be deserialised explicitly into AdminOrderListLineDto.");

        Assert.False(
            Regex.IsMatch(body, @"QueryAsync<AdminOrderListDto>"),
            "GetAllOrdersAsync must NOT query straight into AdminOrderListDto: the nested ItemsDone " +
            "counters and the JSON lines both need assembling first.");
    }

    [Fact]
    public void The_line_modifier_delimiter_is_not_a_doubled_quote()
    {
        // Regression, found by running the endpoint: `string_agg(col, '' ...)` inside a C#
        // verbatim string means the SQL sees `string_agg(col, ` and then a stray `'`, so
        // Postgres raised 42883 — "function string_agg(character varying, unknown, unknown)
        // does not exist" — and the whole list returned 500.
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        Assert.False(
            Regex.IsMatch(body, @"string_agg\([^)]*'',\s*''", RegexOptions.IgnoreCase),
            "The modifiers are joined with a doubled quote, which is not a valid SQL string literal " +
            "inside this verbatim C# string. Postgres rejects the whole query (SQLSTATE 42883). Use a " +
            "real delimiter such as ', '.");
    }
}
