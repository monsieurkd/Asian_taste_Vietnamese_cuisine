using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards that <c>GetItemByIdAsync</c> returns each option group WITH its choices.
///
/// Regression context: the query joined modifier_groups to modifiers in a single
/// Dapper multi-mapping with <c>splitOn: "Id"</c>. Both tables select <c>as Id</c>,
/// so Dapper split on the wrong occurrence and the result was wrong in a different
/// way depending on the data:
///
///   * a group with no available choices (the Spice level range, which has no
///     choices by design) came back as <c>"modifiers": [null]</c>;
///   * correcting the split by aliasing the join column turned every individual
///     modifier into its own group, so one dish returned eight "groups" named
///     "No coriander", "Extra protein", and so on.
///
/// What made this dangerous rather than merely broken: before migration 13 seeded
/// the option groups, EVERY dish returned an empty list, so the query was never
/// exercised and the bug was invisible. Seeding the data is what exposed it. The
/// same shape as the admin order-list bug in <see cref="OrderQueryColumnMappingTests"/>:
/// a query that runs without error and returns structurally wrong data.
///
/// These are text assertions rather than database tests for the same reason the
/// other data tests are — the defect is in the shape of the SQL, and asserting on
/// it needs no database. Reading the shipped source keeps them honest.
/// </summary>
public class MenuItemModifierQueryTests
{
    private static string MenuRepositorySource()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");

        return File.ReadAllText(Path.Combine(
            dir.FullName, "src", "AsianTaste.API", "Repositories", "MenuRepository.cs"));
    }

    /// <summary>The body of GetItemByIdAsync, up to the next method.</summary>
    private static string GetItemByIdBody()
    {
        var source = MenuRepositorySource();
        var start = source.IndexOf("public async Task<MenuItemDetailDto?> GetItemByIdAsync", StringComparison.Ordinal);
        Assert.True(start >= 0, "GetItemByIdAsync not found — has it been renamed?");

        var next = source.IndexOf("\n    public ", start + 1, StringComparison.Ordinal);
        return next < 0 ? source[start..] : source[start..next];
    }

    [Fact]
    public void Reads_groups_and_modifiers_in_separate_queries()
    {
        // The single-join version is what caused the split ambiguity. Two flat
        // queries against a known DTO have no split point to get wrong.
        var body = GetItemByIdSql();

        Assert.Contains("FROM modifier_groups mg", body, StringComparison.Ordinal);
        Assert.Contains("FROM modifiers m", body, StringComparison.Ordinal);

        // A LEFT JOIN between the two tables is the shape that has to be avoided.
        Assert.DoesNotContain("LEFT JOIN modifiers", body, StringComparison.Ordinal);
    }

    [Fact]
    public void Does_not_split_on_a_column_both_tables_select()
    {
        // The root cause: "Id" exists on both sides, so splitOn picked the wrong
        // one. Any splitOn left here must name a column that cannot collide.
        // splitOn is an argument, not SQL, so this one reads the method body.
        var body = GetItemByIdBody();
        var match = Regex.Match(body, @"splitOn:\s*""(?<col>[^""]+)""");

        if (match.Success)
        {
            Assert.NotEqual("Id", match.Groups["col"].Value, StringComparer.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Selects_the_group_display_order()
    {
        // Without display_order the groups came back in whatever order the join
        // produced, which is arbitrary — and the order IS the menu.
        var body = GetItemByIdSql();

        Assert.Contains("mg.display_order", body, StringComparison.Ordinal);
        Assert.Contains("ORDER BY mg.display_order", body, StringComparison.Ordinal);
    }

    /// <summary>
    /// The SQL strings only. Matching against the whole method would also match
    /// the comments that explain this very bug, which is how the first version of
    /// this test failed.
    /// </summary>
    private static string GetItemByIdSql()
    {
        var body = GetItemByIdBody();
        var matches = Regex.Matches(body, "@\"(?<sql>[^\"]+)\"", RegexOptions.Singleline);
        Assert.True(matches.Count > 0, "No SQL string literals found in GetItemByIdAsync.");

        // Strip SQL comments. The explanation of this very bug lives inside the
        // SQL string, and asserting against prose is how a test starts failing
        // for the wrong reason.
        var sql = string.Concat(matches.Select(m => m.Groups["sql"].Value));
        return Regex.Replace(sql, @"--[^\n]*", string.Empty);
    }

    [Fact]
    public void Only_selects_columns_that_exist_on_modifiers()
    {
        // `m.is_default as IsDefault` was written against the DTO, but the column
        // has never existed on `modifiers`. It threw 42703 the first time the
        // query ran, which is how it was found — a compile error would have been
        // cheaper, so this keeps it from creeping back.
        var body = GetItemByIdSql();

        Assert.DoesNotContain("is_default", body, StringComparison.Ordinal);

        var actualColumns = new[]
        {
            "id", "modifier_group_id", "name", "price_adjustment",
            "is_available", "display_order", "created_at", "updated_at",
        };

        foreach (Match m in Regex.Matches(body, @"\bm\.(?<col>[a-z_]+)\b"))
        {
            var column = m.Groups["col"].Value;
            Assert.True(
                actualColumns.Contains(column),
                $"GetItemByIdAsync selects modifiers.{column}, which is not a column on that table. " +
                $"Known columns: {string.Join(", ", actualColumns)}.");
        }
    }

    [Fact]
    public void Only_selects_columns_that_exist_on_modifier_groups()
    {
        var body = GetItemByIdSql();

        var actualColumns = new[]
        {
            "id", "menu_item_id", "name", "is_required", "min_select",
            "max_select", "display_order", "created_at", "updated_at", "source",
        };

        foreach (Match m in Regex.Matches(body, @"\bmg\.(?<col>[a-z_]+)\b"))
        {
            var column = m.Groups["col"].Value;
            Assert.True(
                actualColumns.Contains(column),
                $"GetItemByIdAsync selects modifier_groups.{column}, which is not a column on that table. " +
                $"Known columns: {string.Join(", ", actualColumns)}.");
        }
    }
}
