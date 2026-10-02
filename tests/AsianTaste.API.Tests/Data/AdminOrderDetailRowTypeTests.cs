using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards the query behind the admin ticket — the one the console's "Open" button lands on.
///
/// Regression context (issue #4). <c>GetAdminOrderDetailAsync</c> built its item list with
/// <c>connection.QueryAsync(sql)</c> — Dapper's UNTYPED overload — and then read the columns
/// back with casts:
///
/// <code>
/// var itemId = (int)row.ItemId;
/// PriceAdjustment = (decimal)row.PriceAdjustment
/// </code>
///
/// Through an untyped row every column is <c>dynamic</c>, so a cast compiles no matter what
/// the column is actually called. Postgres folds an unquoted <c>as PriceAdjustment</c> to
/// <c>priceadjustment</c>, so the member the cast reached for did not exist and resolved to
/// a dynamic no-op — and for any order whose dishes carry no modifiers, the LEFT JOIN hands
/// back NULL:
///
/// <code>
/// RuntimeBinderException: Cannot convert null to 'decimal' because it is a
/// non-nullable value type
/// </code>
///
/// <c>row.ModifierRowId != null</c> guarded the modifier ROW but not the modifier FIELDS,
/// so the branch was entered and the first non-nullable cast died.
///
/// WHAT MADE THIS DIFFERENT FROM THE OTHER MAPPING BUGS IN THIS REPO: the SQL was CORRECT.
/// Every column was aliased exactly as <c>The_admin_ticket_aliases_the_columns_it_shows</c>
/// demands, and that test passed the whole time. The defect was the TYPE of the row the
/// query mapped onto, which no amount of reading the SQL can reveal. So the text-based
/// guards in this folder could not have caught it — the check below is a source assertion
/// about the OVERLOAD, and the real guard is the execution test beside it, which runs the
/// actual statement against a real database.
///
/// It shipped green because the suite was at 296 passing tests: every service-level fake
/// returned <c>Task.FromResult&lt;AdminOrderDetailDto?&gt;(null)</c>, so nothing ever executed
/// this SQL.
/// </summary>
public class AdminOrderDetailRowTypeTests
{
    private static string OrderRepositorySource()
    {
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
    /// The body of a method, from its first <c>{</c> to its matching <c>}</c>.
    /// </summary>
    private static string MethodBody(string source, string signature)
    {
        var start = source.IndexOf(signature, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Method not found: {signature}");

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
    public void The_admin_ticket_maps_its_items_onto_a_type_not_a_dynamic_row()
    {
        // The fix for issue #4. An untyped QueryAsync is the whole bug: it defers every
        // column to the runtime binder, so a missing or null column becomes an exception
        // instead of a compile error. Typed, the modifier fields are `int?`/`decimal?` and
        // the compiler refuses the next unguarded cast.
        var body = MethodBody(OrderRepositorySource(), "GetAdminOrderDetailAsync(");

        Assert.False(
            Regex.IsMatch(body, @"QueryAsync\(\s*(?!<)", RegexOptions.IgnoreCase)
            && !Regex.IsMatch(body, @"QueryAsync<", RegexOptions.IgnoreCase),
            "GetAdminOrderDetailAsync maps its item query with an untyped QueryAsync. Every column " +
            "arrives as dynamic, so a cast on a column that is absent or NULL fails at RUNTIME " +
            "(RuntimeBinderException) rather than at compile time — which is how issue #4 shipped " +
            "with 296 green tests. Map onto a typed row.");

        Assert.True(
            Regex.IsMatch(body, @"QueryAsync<\s*AdminOrderItemRow\s*>", RegexOptions.IgnoreCase),
            "GetAdminOrderDetailAsync must map its items onto the AdminOrderItemRow type, so the " +
            "LEFT JOIN's nullable modifier columns are enforced by the compiler.");
    }

    [Fact]
    public void The_ticket_item_row_treats_every_modifier_column_as_nullable()
    {
        // The LEFT JOIN produces one all-NULL modifier row per unmodified dish, so these
        // four are genuinely absent on most rows. Declaring them non-nullable is what made
        // the cast throw, and it is the difference between "the compiler knows" and "the
        // next person has to remember".
        var source = OrderRepositorySource();
        var row = MethodBody(source, "private sealed class AdminOrderItemRow");

        foreach (var (property, type) in new[]
                 {
                     ("ModifierRowId", "int?"),
                     ("ModifierId", "int?"),
                     ("ModifierName", "string?"),
                     ("PriceAdjustment", "decimal?"),
                 })
        {
            Assert.True(
                Regex.IsMatch(row, $@"\b{Regex.Escape(type)}\s+{property}\b"),
                $"AdminOrderItemRow.{property} must be '{type}'. The modifier columns come from a " +
                $"LEFT JOIN and are NULL for every dish with no modifiers, so a non-nullable " +
                $"declaration is a cast waiting to throw.");
        }
    }
}
