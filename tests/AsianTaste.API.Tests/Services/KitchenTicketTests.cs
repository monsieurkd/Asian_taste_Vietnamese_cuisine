using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using Microsoft.Extensions.Logging.Abstractions;

using static AsianTaste.API.Tests.Services.KitchenTestHarness;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// The ticket-level acts: a note on a dish, holding a ticket, and the board's counts.
/// </summary>
/// <remarks>
/// Split from <c>KitchenWorkflowTests</c> by subject — that file covers a dish's own states
/// and the log; this one covers what is done to a whole TICKET. Both use
/// <see cref="KitchenTestHarness"/>.
///
/// The rules pinned here each fail silently rather than loudly:
///
///   * **A note is not an instruction.** The kitchen's note and the customer's request are
///     different kinds of fact, stored separately, and clearing one must clear its author.
///   * **A hold does not touch the stage.** The stage says how far the cooking got; the hold
///     says nobody is on it and why. Collapsing the two would mean a resumed order had to
///     guess which stage to return to.
///   * **An overdue order is judged on its WANTED time**, so a scheduled 7pm order is not
///     treated as late from the moment it was placed at 4pm.
/// </summary>
public class KitchenTicketTests
{
    // ── The kitchen note ─────────────────────────────────────────────────────

    [Fact]
    public async Task A_kitchen_note_is_stored_with_its_author_and_logged()
    {
        var h = CreateHarness();

        var result = await h.Service.SetItemKitchenNoteAsync(42, 1, "  used cabbage  ", "Mai");

        Assert.Equal("used cabbage", result!.KitchenNote);
        Assert.Equal("Mai", result.NoteBy);

        var entry = Assert.Single(h.Orders.Activity);
        Assert.Equal("NoteAdded", entry.Kind);
        Assert.Contains("used cabbage", entry.Detail);
        Assert.Contains("Dish 1", entry.Detail);
    }

    [Fact]
    public async Task Clearing_a_note_removes_its_author_too()
    {
        var h = CreateHarness();
        await h.Service.SetItemKitchenNoteAsync(42, 1, "used cabbage", "Mai");

        var cleared = await h.Service.SetItemKitchenNoteAsync(42, 1, "   ", "Mai");

        Assert.Null(cleared!.KitchenNote);
        // A blank note that still names an author reads as somebody having said something.
        Assert.Null(cleared.NoteBy);
        Assert.Equal("NoteAdded", h.Orders.Activity.Last().Kind);
        Assert.Contains("cleared", h.Orders.Activity.Last().Detail);
    }
    // ── The hold ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Holding_requires_a_reason()
    {
        var h = CreateHarness();

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetOrderHeldAsync(42, held: true, reason: "  ", actor: "Mai"));

        // A held ticket with no reason is one the next person has to ask around about.
        Assert.Contains("Give a reason", refused.Message);
    }

    [Fact]
    public async Task Holding_does_not_touch_the_orders_stage()
    {
        var h = CreateHarness(status: OrderStatus.Confirmed);

        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting on the rolls", actor: "Mai");

        // The stage still says how far the cooking got; the hold is a separate axis.
        Assert.Equal(OrderStatus.Confirmed, h.Orders.Order.Status);
        Assert.Empty(h.Orders.StatusWrites);
        Assert.NotNull(h.Orders.Order.HeldAt);
        Assert.Equal("waiting on the rolls", h.Orders.Order.HeldReason);
    }

    [Fact]
    public async Task Resuming_clears_the_reason_so_a_live_order_carries_no_stale_excuse()
    {
        var h = CreateHarness();
        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting", actor: "Mai");

        var resumed = await h.Service.SetOrderHeldAsync(42, held: false, reason: null, actor: "Sam");

        Assert.False(resumed!.IsHeld);
        Assert.Null(resumed.HeldReason);
        Assert.Null(h.Orders.Order.HeldReason);
        Assert.Null(h.Orders.Order.HeldAt);
    }

    [Fact]
    public async Task Holding_and_resuming_are_both_logged()
    {
        var h = CreateHarness();

        await h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting on the rolls", actor: "Mai");
        await h.Service.SetOrderHeldAsync(42, held: false, reason: null, actor: "Sam");

        Assert.Equal("Held", h.Orders.Activity[0].Kind);
        Assert.Contains("waiting on the rolls", h.Orders.Activity[0].Detail);
        Assert.Equal("Resumed", h.Orders.Activity[1].Kind);
        Assert.Equal("Sam", h.Orders.Activity[1].Actor);
    }

    [Fact]
    public async Task A_closed_order_cannot_be_held()
    {
        var h = CreateHarness(status: OrderStatus.Cancelled);

        var refused = await Assert.ThrowsAsync<InvalidOperationException>(
            () => h.Service.SetOrderHeldAsync(42, held: true, reason: "waiting", actor: "Mai"));

        Assert.Contains("nothing to hold", refused.Message);
    }
    // ── The board ────────────────────────────────────────────────────────────

    [Fact]
    public async Task The_board_counts_what_is_left_to_cook_and_what_is_on_the_wok()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RemainingLines = 3, CookingLines = 1 },
            new KitchenTicketDto { Id = 2, Status = "Pending", RemainingLines = 2, CookingLines = 2 },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(2, board.Summary.LiveOrders);
        Assert.Equal(1, board.Summary.AwaitingAcceptance);
        Assert.Equal(5, board.Summary.DishesToCook);
        Assert.Equal(3, board.Summary.DishesCooking);
    }

    [Fact]
    public async Task Held_orders_are_counted_separately_and_left_out_of_the_work()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RemainingLines = 3 },
            new KitchenTicketDto { Id = 2, Status = "Confirmed", RemainingLines = 5, IsHeld = true, HeldReason = "waiting" },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(1, board.Summary.LiveOrders);
        Assert.Equal(1, board.Summary.HeldOrders);
        // A held ticket's dishes are not work anyone should be picking up.
        Assert.Equal(3, board.Summary.DishesToCook);
    }

    [Fact]
    public async Task An_overdue_order_is_one_whose_wanted_time_has_passed()
    {
        var h = CreateHarness();
        h.Orders.Board =
        [
            // Wanted 40 minutes ago, and not scheduled: late.
            new KitchenTicketDto { Id = 1, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-40), IsScheduled = false },
            // Wanted 40 minutes ago but for a specific time: the kitchen is doing fine.
            new KitchenTicketDto { Id = 2, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-40), IsScheduled = true },
            // Wanted five minutes ago: not late yet.
            new KitchenTicketDto { Id = 3, Status = "Confirmed", RequestedTime = DateTime.UtcNow.AddMinutes(-5), IsScheduled = false },
        ];

        var board = await h.Service.GetKitchenBoardAsync(includeFinished: false);

        Assert.Equal(1, board.Summary.OverdueOrders);
    }}
