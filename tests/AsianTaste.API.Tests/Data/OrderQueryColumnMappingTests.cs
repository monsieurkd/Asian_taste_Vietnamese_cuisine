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
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

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
        var body = MethodBody(OrderRepositorySource(), "GetAllOrdersAsync(");

        var select = body[body.IndexOf("SELECT", StringComparison.Ordinal)..];
        select = select[..select.IndexOf("FROM orders", StringComparison.Ordinal)];

        // Strip aliased forms and casts, then look for any leftover snake_case name.
        var withoutAliases = Regex.Replace(select, @"\w+(::text)?\s+as\s+\w+", " ");
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
        // that feed the POS payload and the order detail page.
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
}
