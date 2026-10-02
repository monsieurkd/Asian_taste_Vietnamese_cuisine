using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards the counter screen's menu — the query behind its dish grid.
///
/// Regression context (issue #5). The grid rendered NOTHING. `CounterOrderPage` filtered
/// dishes on <c>d.isActive</c> and read <c>categoryName</c>, <c>price</c> and
/// <c>modifierGroups</c>; the endpoint behind it returned <c>MenuItemSummaryDto</c>, which
/// has none of those — it carries <c>isAvailable</c>, <c>basePrice</c> and a bare
/// <c>hasModifiers</c> boolean. So the filter removed every dish and the grid mapped over an
/// empty array. The page still drew its frame, its ticket panel and its Send button, so it
/// read as a broken screen rather than a failed request.
///
/// AND the endpoint was asking for the wrong SET. It called <c>GetPopularItemsAsync</c>
/// behind a literal <c>// TODO</c>, so it served 7 dishes out of 82: a till that can only
/// sell the popular items. Making the fields line up without fixing that would have left a
/// counter screen that renders perfectly and cannot sell most of the menu.
///
/// Note the family resemblance to its neighbours: this is again a query that runs without
/// error and returns structurally wrong data. What is different here is WHERE the wrongness
/// lived — the endpoint's DTO type, not its SQL. Which is why the second test asserts on the
/// call the controller makes rather than on any query text.
/// </summary>
public class CounterMenuQueryTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");
        return dir!.FullName;
    }

    private static string MenuRepositorySource() =>
        File.ReadAllText(Path.Combine(RepoRoot(), "src", "AsianTaste.API", "Repositories", "MenuRepository.cs"));

    private static string AdminMenuControllerSource() =>
        File.ReadAllText(Path.Combine(RepoRoot(), "src", "AsianTaste.API", "Controllers", "AdminMenuController.cs"));

    /// <summary>The body of a method, from its first <c>{</c> to its matching <c>}</c>.</summary>
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
    public void The_admin_menu_list_serves_the_whole_menu_not_the_popular_items()
    {
        // The TODO that made the counter unusable. GetPopularItemsAsync returns a handful of
        // flagged dishes; the counter needs everything the shop can sell.
        var body = MethodBody(AdminMenuControllerSource(), "GetAllMenuItemsAdmin(");

        Assert.False(
            Regex.IsMatch(body, @"GetPopularItemsAsync", RegexOptions.IgnoreCase),
            "The admin menu list calls GetPopularItemsAsync, so the counter's dish grid can only " +
            "sell the popular items — it served 7 dishes out of 82. Use the whole-menu query.");

        Assert.True(
            Regex.IsMatch(body, @"GetCounterMenuAsync", RegexOptions.IgnoreCase),
            "The admin menu list must call GetCounterMenuAsync, which returns every available dish " +
            "in the detail shape the counter's grid reads.");
    }

    [Fact]
    public void The_counter_menu_carries_every_field_the_grid_reads()
    {
        // The five fields whose absence emptied the grid. Each is asserted as an aliased
        // column, because Dapper maps by exact name and an unaliased `category_name` would
        // arrive as null — the failure mode this repo keeps hitting.
        var body = MethodBody(MenuRepositorySource(), "GetCounterMenuAsync(");

        foreach (var (column, property) in new[]
                 {
                     ("c.name", "CategoryName"),
                     ("mi.base_price", "Price"),
                     ("mi.base_price", "BasePrice"),
                     ("mi.is_available", "IsAvailable"),
                 })
        {
            var pattern = $@"\b{Regex.Escape(column)}\s+as\s+{property}\b";
            Assert.True(
                Regex.IsMatch(body, pattern, RegexOptions.IgnoreCase),
                $"GetCounterMenuAsync does not select '{column} as {property}'. The counter's grid reads " +
                $"that property; without the alias it arrives undefined and the dish is filtered out.");
        }

        // The grid is grouped by category name, so the categories table has to be joined.
        Assert.True(
            Regex.IsMatch(body, @"JOIN\s+categories", RegexOptions.IgnoreCase),
            "GetCounterMenuAsync must join `categories`: without it CategoryName is empty and every " +
            "dish collapses into one anonymous group.");
    }

    [Fact]
    public void The_counter_menu_returns_option_groups_without_multi_mapping()
    {
        // The same trap GetItemByIdAsync already documents: Dapper splits multi-mapping on
        // the first column aliased `Id`, and both modifier_groups and modifiers have one.
        // Two flat queries, assembled by item id.
        var body = MethodBody(MenuRepositorySource(), "GetCounterMenuAsync(");

        Assert.False(
            Regex.IsMatch(body, @"splitOn\s*:", RegexOptions.IgnoreCase),
            "GetCounterMenuAsync must not use Dapper multi-mapping: both modifier_groups and " +
            "modifiers project `as Id`, and splitOn then splits on the wrong one.");

        Assert.True(
            Regex.IsMatch(body, @"group\w*\s+by|GroupBy", RegexOptions.IgnoreCase),
            "GetCounterMenuAsync must group the flat modifier rows back onto their groups.");
    }

    [Fact]
    public void The_counter_menu_offers_only_dishes_the_shop_can_actually_sell()
    {
        // A dish the shop has run out of must not be tappable: the counter is the one
        // screen where a staff member cannot work around it, because a customer is
        // standing there. The query filters on is_available rather than on is_popular.
        var body = MethodBody(MenuRepositorySource(), "GetCounterMenuAsync(");

        Assert.True(
            Regex.IsMatch(body, @"WHERE\s+mi\.is_available\s*=\s*TRUE", RegexOptions.IgnoreCase),
            "GetCounterMenuAsync must filter on mi.is_available = TRUE so an unavailable dish " +
            "cannot be ordered from the counter.");
    }
}
