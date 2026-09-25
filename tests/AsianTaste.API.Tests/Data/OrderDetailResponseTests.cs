using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards the two things a customer's own view of an order has to get right: the
/// pickup estimate it promises, and the choices they made when they ordered.
///
/// Both were wrong in the same quiet way — the screen rendered, the numbers were
/// plausible, and nothing said the data was missing:
///
/// 1. <c>EstimatedReadyTime</c> was <c>RequestedTime.AddMinutes(20)</c>, a literal,
///    while checkout used the restaurant's <c>pickup_minutes</c> setting. Change the
///    setting and the confirmation screen and the tracking screen disagree about the
///    same order.
/// 2. The item modifiers were loaded from the database and then thrown away —
///    <c>Modifiers = new List&lt;OrderItemModifierDto&gt;()</c> — so the customer saw
///    none of their own choices (spice level, allergy, a paid extra) on the
///    confirmation, while the kitchen's copy of the same order showed them.
///
/// These are text assertions on the shipped source, like the sibling mapping tests,
/// because the defect is an expression in the source rather than a runtime state.
/// </summary>
public class OrderDetailResponseTests
{
    private static string OrderServiceSource()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");

        var path = Path.Combine(dir!.FullName, "src", "AsianTaste.API", "Services", "OrderService.cs");
        Assert.True(File.Exists(path), $"OrderService.cs not found at {path}");

        return File.ReadAllText(path);
    }

    [Fact]
    public void No_pickup_estimate_is_hardcoded()
    {
        var source = OrderServiceSource();

        // A literal here is the bug, not the number: 20 was in the code and 15 in the
        // settings, and only one of them moved when the owner changed the setting.
        var hardcoded = Regex.Matches(source, @"AddMinutes\(\s*\d+\s*\)");
        Assert.True(
            hardcoded.Count == 0,
            "OrderService computes a pickup estimate from a literal minute count " +
            $"({string.Join(", ", hardcoded.Select(m => m.Value))}). It must come from the restaurant's " +
            "pickup_minutes setting, or the confirmation screen and the tracking screen promise " +
            "different times for the same order.");
    }

    [Fact]
    public void The_customer_order_detail_returns_the_modifiers_it_loaded()
    {
        var source = OrderServiceSource();

        // The empty-list assignment is what discarded them. Item.Modifiers is already
        // populated by GetOrderItemsAsync, so anything that does not project it drops
        // the customer's own choices on the floor.
        Assert.DoesNotContain(
            "Modifiers = new List<OrderItemModifierDto>()",
            source);

        Assert.Contains("ModifierName = m.ModifierName", source);
    }
}
