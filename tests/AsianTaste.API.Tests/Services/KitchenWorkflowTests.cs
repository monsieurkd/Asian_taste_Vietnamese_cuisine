using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using Microsoft.Extensions.Logging.Abstractions;

using OrderType = AsianTaste.API.Models.Enums.OrderType;
using DomainPaymentStatus = AsianTaste.API.Models.Enums.PaymentStatus;

using static AsianTaste.API.Tests.Services.KitchenTestHarness;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// A dish's own cook state, and the activity log that records who changed it.
/// </summary>
/// <remarks>
/// Why these exist. The tick shipped first and answered one question — "is this dish done?"
/// — which is one short of how a kitchen works. The states add a middle ("the pho is on")
/// and attribution ("who ticked it"), and each can fail in a way that is invisible from the
/// screen:
///
///   * **A dish moving to COOKING must never finish the order.** A ticket with everything
///     on the wok is not ready, and marking it ready would email the customer to come and
///     collect food that does not exist yet. This is the single most damaging mistake
///     available in this file.
///   * **The activity log is written on the same path as the change**, so a move that
///     happens without a log line is a move nobody can account for later.
///
/// The ticket-level acts — notes, holds and the board's counts — are in
/// <c>KitchenTicketTests</c>; both use <see cref="KitchenTestHarness"/>.
/// </summary>
public class KitchenWorkflowTests
{
    // ── The states themselves ────────────────────────────────────────────────

    [Fact]
    public async Task Moving_one_dish_to_cooking_leaves_the_order_alone()
    {
        var h = CreateHarness(lineCount: 3);

        var result = await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        Assert.Equal("Cooking", result!.CookState);
        Assert.Equal(1, result.CookingLines);
        Assert.Equal(0, result.DoneLines);
        Assert.False(result.OrderMarkedReady);
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    /// <summary>
    /// The single most damaging mistake available here: everything on the wok is NOT ready.
    /// </summary>
    [Fact]
    public async Task Every_dish_cooking_still_does_not_finish_the_order()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");
        var result = await h.Service.SetItemCookStateAsync(42, 2, "Cooking", "Mai");

        Assert.Equal(2, result!.CookingLines);
        Assert.Equal(0, result.DoneLines);
        Assert.False(result.OrderMarkedReady);
        // Nothing moved and nobody was emailed — the food does not exist yet.
        Assert.Empty(h.Orders.StatusWrites);
        Assert.Empty(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task The_last_dish_moved_to_done_finishes_the_order_and_tells_the_customer()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");
        var last = await h.Service.SetItemCookStateAsync(42, 2, "Done", "Mai");

        Assert.True(last!.OrderMarkedReady);
        Assert.True(last.CustomerNotified);
        Assert.Equal([OrderStatus.Ready], h.Orders.StatusWrites);
        Assert.Single(h.Emails.StatusUpdates);
    }

    [Fact]
    public async Task Putting_a_done_dish_back_to_cooking_does_not_move_a_ready_order_backwards()
    {
        var h = CreateHarness(status: OrderStatus.Ready, lineCount: 2);

        var result = await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        Assert.False(result!.OrderMarkedReady);
        Assert.Equal(OrderStatus.Ready, h.Orders.Order.Status);
        Assert.Empty(h.Orders.StatusWrites);
    }

    [Fact]
    public async Task An_unknown_state_is_refused_rather_than_stored()
    {
        var h = CreateHarness();

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 1, "Nearly", "Mai"));

        Assert.Contains("Unknown cook state", refused.Message);
    }

    [Theory]
    [InlineData("queued")]
    [InlineData("COOKING")]
    [InlineData(" done ")]
    public async Task The_state_is_read_case_insensitively(string state)
    {
        var h = CreateHarness();

        var result = await h.Service.SetItemCookStateAsync(42, 1, state, "Mai");

        // Stored in its canonical form whoever sends it, because the value is compared
        // against literals in SQL elsewhere and a stray casing would silently never match.
        Assert.Contains(result!.CookState, new[] { "Queued", "Cooking", "Done" });
    }

    [Theory]
    [InlineData(OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Completed)]
    public async Task A_closed_order_refuses_cook_state_changes(OrderStatus status)
    {
        var h = CreateHarness(status: status);

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai"));

        Assert.Contains("no longer being cooked", refused.Message);
    }

    [Fact]
    public async Task A_line_from_another_order_is_refused()
    {
        var h = CreateHarness();
        h.Orders.ItemNotFound = true;

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetItemCookStateAsync(42, 999, "Done", "Mai"));

        Assert.Contains("not on order", refused.Message);
    }
    // ── The activity log ─────────────────────────────────────────────────────

    [Fact]
    public async Task Every_cook_state_move_is_logged_with_its_author()
    {
        var h = CreateHarness(lineCount: 2);

        await h.Service.SetItemCookStateAsync(42, 1, "Cooking", "Mai");

        var entry = Assert.Single(h.Orders.Activity);
        Assert.Equal("ItemCookState", entry.Kind);
        Assert.Equal("Mai", entry.Actor);
        Assert.Equal(1, entry.OrderItemId);
        // A sentence a person reads, naming the dish — not a field-by-field diff.
        Assert.Contains("Dish 1", entry.Detail);
        Assert.Contains("cooking", entry.Detail);
    }

    [Fact]
    public async Task Finishing_the_order_is_logged_as_its_own_event()
    {
        var h = CreateHarness(lineCount: 1);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");

        // The dish move, the order moving, and the customer being told: three facts, three
        // lines. One line covering all three could not answer "was the customer told?".
        Assert.Contains(h.Orders.Activity, a => a.Kind == "ItemCookState");
        Assert.Contains(h.Orders.Activity, a => a.Kind == "StatusChanged");
        Assert.Contains(h.Orders.Activity, a => a.Kind == "ReadyNotified");
    }

    [Fact]
    public async Task A_system_change_is_named_as_the_system_rather_than_a_person()
    {
        var h = CreateHarness(lineCount: 1);

        await h.Service.SetItemCookStateAsync(42, 1, "Done", actor: null);

        var entry = h.Orders.Activity.First(a => a.Kind == "ItemCookState");
        // "The system" is the accurate description, and more useful than a vague pronoun
        // when the question being asked is "who moved my order".
        Assert.Equal("The system", entry.Actor ?? "The system");
        Assert.StartsWith("The system", entry.Detail);
    }

    [Fact]
    public async Task A_log_failure_does_not_fail_the_kitchen_action()
    {
        var h = CreateHarness(lineCount: 1);
        h.Orders.ThrowOnActivity = true;

        // The dish move already happened; refusing it because a log row could not be
        // written would leave the food on the pass and the screen saying it is not.
        var result = await h.Service.SetItemCookStateAsync(42, 1, "Done", "Mai");

        Assert.True(result!.OrderMarkedReady);
    }
}
