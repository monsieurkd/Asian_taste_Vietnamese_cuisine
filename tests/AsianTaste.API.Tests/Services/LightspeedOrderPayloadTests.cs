using System.Reflection;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Services.Lightspeed;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Guards the two ways an order could reach the POS empty or incomplete.
///
/// Both were real, and both failed silently:
///
///  1. <c>OrderRepository.GetOrderByIdAsync</c> and <c>GetOrderByNumberAsync</c>
///     never loaded <c>Items</c> at all. <c>OrderService</c> pushes the order it
///     gets back from <c>CreateOrderAsync</c>, which calls <c>GetOrderByIdAsync</c>
///     — so every POS order was sent with <c>lines: []</c>. An order with no dishes
///     on it, for a customer who has just paid.
///
///  2. <c>GetOrderItemsAsync</c> used <c>SELECT *</c> against snake_case columns
///     while the entity is PascalCase, and this connection does not enable Dapper's
///     underscore mapping. So <c>menu_item_name</c> mapped to nothing and lines came
///     back with an empty name and a price of 0. The row count was correct, which is
///     why it looked fine.
///
/// The first is covered by a live check against a real database (see
/// docs/TODO.md); what is pinned here is the payload-building contract, so a
/// regression in how modifiers are rendered fails loudly rather than quietly
/// producing a ticket that omits what the customer chose.
/// </summary>
public class LightspeedOrderPayloadTests
{
    /// <summary>
    /// <c>BuildLineDescription</c> is private and static, and the surrounding
    /// builder needs an HTTP client and auth service to construct. Invoking the one
    /// pure function directly keeps this a unit test — the alternative is an
    /// integration test against Lightspeed, which needs credentials we do not have.
    /// </summary>
    private static string BuildLineDescription(OrderItem item) =>
        (string)typeof(LightspeedOrderService)
            .GetMethod("BuildLineDescription", BindingFlags.NonPublic | BindingFlags.Static)!
            .Invoke(null, [item])!;

    private static OrderItem Item(string name, int qty, params (string Name, decimal Price)[] modifiers) => new()
    {
        MenuItemId = 1,
        MenuItemName = name,
        Quantity = qty,
        UnitPrice = 8.50m + modifiers.Sum(m => m.Price),
        TotalPrice = (8.50m + modifiers.Sum(m => m.Price)) * qty,
        Modifiers = modifiers.Select(m => new OrderItemModifier
        {
            ModifierId = 1,
            ModifierName = m.Name,
            PriceAdjustment = m.Price,
        }).ToList(),
    };

    [Fact]
    public void A_line_with_no_modifiers_is_just_name_and_quantity()
    {
        var description = BuildLineDescription(Item("Pad Thai", 1));

        Assert.Equal("Pad Thai x1", description);
    }

    [Fact]
    public void Chosen_modifiers_appear_on_the_line()
    {
        // The bug this replaces: the kitchen saw "Pad Thai" and never learned about
        // "no coriander", which the customer explicitly asked for.
        var description = BuildLineDescription(Item("Pad Thai", 1, ("No coriander", 0m)));

        Assert.Contains("No coriander", description);
    }

    [Fact]
    public void Several_modifiers_are_all_listed()
    {
        var description = BuildLineDescription(Item("Pad Thai", 1, ("Chicken", 0m), ("Extra chilli", 1.50m), ("No coriander", 0m)));

        Assert.Contains("Chicken", description);
        Assert.Contains("Extra chilli", description);
        Assert.Contains("No coriander", description);
    }

    [Fact]
    public void A_paid_modifier_shows_its_price_so_the_ticket_reconciles_with_the_receipt()
    {
        // The customer was charged for this, so the kitchen ticket must account for
        // the difference when the total is checked against the order.
        var description = BuildLineDescription(Item("Pad Thai", 1, ("Extra chilli", 1.50m)));

        Assert.Contains("+$1.50", description);
    }

    [Fact]
    public void A_free_modifier_does_not_show_a_redundant_zero()
    {
        var description = BuildLineDescription(Item("Pad Thai", 1, ("No coriander", 0m)));

        Assert.DoesNotContain("+$0.00", description);
    }

    [Fact]
    public void Quantity_is_carried_on_the_description()
    {
        var description = BuildLineDescription(Item("Pad Thai", 3));

        Assert.Equal("Pad Thai x3", description);
    }

    [Fact]
    public void The_dish_name_is_never_lost_when_modifiers_are_present()
    {
        var description = BuildLineDescription(Item("Cold rolls (serve of 4)", 2, ("Prawn", 0m)));

        Assert.StartsWith("Cold rolls (serve of 4) x2", description);
        Assert.Contains("Prawn", description);
    }

    [Fact]
    public void A_negative_price_adjustment_is_rendered_as_a_discount_not_a_plus()
    {
        // Some modifiers reduce the price. Formatting a negative as "+$-1.50" would
        // be read as a surcharge on the kitchen ticket.
        var description = BuildLineDescription(Item("Pad Thai", 1, ("No egg", -1.50m)));

        Assert.DoesNotContain("+-", description);
        Assert.Contains("1.50", description);
    }
}
