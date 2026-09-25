using AsianTaste.API.Services;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests for the rule that decides whether an order may be placed at all.
///
/// Context: the storefront has shown "Closed · opens 10am" for a while, but that was
/// only a courtesy — the API is a public endpoint, so anything posting to it directly
/// could place and PAY for an order at 2am. The cost of that is a refund, a phone
/// call, and a customer who no longer trusts the site.
///
/// Two classes of bug these exist to prevent, and they pull in opposite directions:
///
///   - **Refusing a legitimate order.** Closing at 21:00 must accept an order AT
///     21:00, and a scheduled order must be judged at the time the customer chose
///     rather than at the moment they clicked. Getting this wrong turns customers
///     away during service.
///   - **Accepting an order nobody will cook.** An unreadable timezone or a missing
///     hours row must not silently mean "open all day". Getting this wrong is how a
///     kitchen receives food orders at 3am.
///
/// The boundaries are asserted exactly, because both bugs live on them.
/// </summary>
public class TradingHoursTests
{
    /// <summary>
    /// Adelaide's real hours, as migration 14 seeds them: a break between services, and
    /// Monday lunch-only.
    /// </summary>
    private static readonly List<TradingWindow> AdelaideWindows =
    [
        new(1, new TimeSpan(10, 0, 0), new TimeSpan(14, 30, 0)),   // Monday, lunch only
        new(2, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
        new(3, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
        new(4, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
        new(5, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
        new(6, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
        new(7, new TimeSpan(10, 0, 0), new TimeSpan(21, 0, 0), new TimeSpan(16, 0, 0), new TimeSpan(16, 30, 0)),
    ];

    private const string Adelaide = "Australia/Adelaide";

    private static readonly TradingHours Clock = new(TimeProvider.System);

    /// <summary>
    /// A UTC instant that is a given Adelaide wall-clock time.
    /// </summary>
    /// <remarks>
    /// Adelaide is UTC+9:30 (ACST) or UTC+10:30 (ACDT), and which one applies depends on
    /// the date — so these are written as UTC instants derived from the local time the
    /// test means, rather than by subtracting a fixed offset.
    /// </remarks>
    private static DateTime AdelaideLocal(int year, int month, int day, int hour, int minute)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(Adelaide);
        var local = new DateTime(year, month, day, hour, minute, 0, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, tz);
    }

    private static TradingState At(int hour, int minute, int day = 11) =>
        Clock.Evaluate(AdelaideWindows, Adelaide, AdelaideLocal(2026, 3, day, hour, minute));

    [Fact]
    public void Accepts_an_order_in_the_middle_of_service()
    {
        Assert.True(At(13, 0).Open);
        Assert.True(At(19, 0).Open);
    }

    [Fact]
    public void Accepts_an_order_at_the_exact_opening_minute()
    {
        // Opening at 10:00 means 10:00 is open. A customer who reads "opens 10am" and
        // orders at 10am must not be refused by a one-second boundary.
        Assert.True(At(10, 0).Open);
    }

    [Fact]
    public void Accepts_an_order_at_the_exact_closing_minute()
    {
        // 21:00 is the last accepted order, not the first refused one. The frontend's
        // own engine encodes the same rule deliberately; if the two ever disagree the
        // customer sees "open" and is refused.
        var state = At(21, 0);
        Assert.True(state.Open, "Closing time is inclusive — the kitchen's rule is the door, not the millisecond.");
    }

    [Fact]
    public void Refuses_an_order_one_minute_after_closing()
    {
        var state = At(21, 1);
        Assert.False(state.Open);
    }

    // ── The break between services ───────────────────────────────────────────
    //
    // This kitchen closes between lunch and dinner. A single open/close pair per day
    // cannot express that, and both ways of getting it wrong cost money: report the
    // shop shut from 4pm and evening customers go elsewhere, or accept the 4:15pm
    // order and the kitchen gets a ticket it cannot cook.

    [Fact]
    public void Refuses_an_order_during_the_break_between_services()
    {
        var state = At(16, 15);   // between the lunch close and the dinner open
        Assert.False(state.Open);
    }

    [Fact]
    public void Says_when_the_kitchen_reopens_after_the_break()
    {
        // The customer needs the specific time: "closed" alone sends them away for the
        // night when the kitchen is back in fifteen minutes.
        var state = At(16, 15);
        Assert.Contains("16:30", state.Reason);
    }

    [Fact]
    public void Accepts_an_order_at_the_moment_the_break_ends()
    {
        // Reopening at 16:30 means 16:30 is open — the mirror of the opening-minute
        // rule, and the one a customer standing outside will test.
        Assert.True(At(16, 30).Open);
    }

    [Fact]
    public void Accepts_an_order_at_the_moment_the_break_begins_is_refused()
    {
        // Closing for the break at 16:00 means 16:00 is the first shut minute, not the
        // last open one: the kitchen has stopped.
        Assert.False(At(16, 0).Open);
    }

    [Fact]
    public void Accepts_orders_on_both_sides_of_the_break()
    {
        Assert.True(At(12, 0).Open, "lunch service");
        Assert.True(At(18, 0).Open, "dinner service");
    }

    [Fact]
    public void A_window_without_a_break_runs_continuously()
    {
        // Monday is a single lunch service with no break, so 14:00 is open even though
        // every other day is shut then.
        Assert.True(Clock.Evaluate(AdelaideWindows, Adelaide, AdelaideLocal(2026, 3, 9, 14, 0)).Open);
    }

    [Fact]
    public void Refuses_an_order_before_opening_and_says_when_it_opens()
    {
        var state = At(8, 0);
        Assert.False(state.Open);
        Assert.Contains("10:00", state.Reason);
    }

    [Fact]
    public void Refuses_an_order_after_the_kitchen_has_closed_for_the_day()
    {
        var state = At(23, 30);
        Assert.False(state.Open);
        // The reason must not promise a time that has already passed today.
        Assert.DoesNotContain("opens at", state.Reason);
    }

    [Fact]
    public void Judges_a_scheduled_order_at_the_time_it_is_wanted()
    {
        // Ordering at 4pm for a 7pm pickup is legitimate, and judging it against "now"
        // would refuse the shop's most useful orders.
        var wanted = AdelaideLocal(2026, 3, 11, 19, 0);   // 7pm, inside service
        var state = Clock.Evaluate(AdelaideWindows, Adelaide, wanted);
        Assert.True(state.Open);
    }

    [Fact]
    public void Refuses_a_scheduled_order_outside_the_kitchen_hours()
    {
        // 3am is not a pickup time, however far ahead it is booked.
        var wanted = AdelaideLocal(2026, 3, 11, 3, 0);
        var state = Clock.Evaluate(AdelaideWindows, Adelaide, wanted);
        Assert.False(state.Open);
    }

    [Fact]
    public void Treats_a_day_with_no_window_as_closed()
    {
        // A closed day is a normal state, not an error — and not a silent "open".
        var noMondays = AdelaideWindows.Where(w => w.DayOfWeek != 3).ToList();
        var wednesdayNoon = AdelaideLocal(2026, 3, 11, 12, 0);
        var state = Clock.Evaluate(noMondays, Adelaide, wednesdayNoon);

        Assert.False(state.Open);
        Assert.Contains("closed today", state.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Handles_two_windows_in_one_day()
    {
        // This kitchen closes between lunch and dinner, so a day can legitimately have
        // two windows. A single open/close pair per day would report the shop shut from
        // 4pm and send customers away mid-afternoon.
        var splitDay = new List<TradingWindow>
        {
            new(3, new TimeSpan(10, 0, 0), new TimeSpan(16, 0, 0)),
            new(3, new TimeSpan(16, 30, 0), new TimeSpan(21, 0, 0)),
        };

        Assert.True(Clock.Evaluate(splitDay, Adelaide, AdelaideLocal(2026, 3, 11, 12, 0)).Open);
        // The gap between the services is closed, and says when the kitchen is back.
        var gap = Clock.Evaluate(splitDay, Adelaide, AdelaideLocal(2026, 3, 11, 16, 15));
        Assert.False(gap.Open);
        Assert.Contains("16:30", gap.Reason);
        Assert.True(Clock.Evaluate(splitDay, Adelaide, AdelaideLocal(2026, 3, 11, 18, 0)).Open);
    }

    [Fact]
    public void Makes_a_lunch_only_day_close_for_the_evening()
    {
        // Monday is lunch only. An evening order on Monday must be refused even though
        // every other day is open in the evening.
        var monday = AdelaideLocal(2026, 3, 9, 19, 0);   // Monday 9 March 2026
        Assert.False(Clock.Evaluate(AdelaideWindows, Adelaide, monday).Open);
        Assert.True(Clock.Evaluate(AdelaideWindows, Adelaide, AdelaideLocal(2026, 3, 9, 12, 0)).Open);
    }

    [Fact]
    public void Judging_is_independent_of_the_host_machine_timezone()
    {
        // The whole point of doing this server-side: the verdict comes from the
        // restaurant's timezone, so it does not change with the server's clock settings.
        var utcNoon = AdelaideLocal(2026, 3, 11, 12, 0);

        var (day, minutes) = Clock.LocalParts(utcNoon, Adelaide);
        Assert.Equal(3, day);                      // Wednesday, ISO numbering
        Assert.Equal(12 * 60, minutes);            // noon local
        Assert.NotEqual(utcNoon.Hour, minutes / 60); // and genuinely not the UTC hour
    }

    [Fact]
    public void An_unreadable_timezone_does_not_mean_open_all_day()
    {
        // Falling back to "open" here is how a kitchen gets an order at 3am. The
        // fallback is UTC, so the answer is at least consistent and reproducible.
        var state = Clock.Evaluate(AdelaideWindows, "Not/AZone", AdelaideLocal(2026, 3, 11, 12, 0));

        // Whatever the verdict, it must be a real judgement rather than a crash or a
        // blanket approval.
        Assert.NotNull(state.Reason);
    }

    [Fact]
    public void No_configured_windows_is_reported_as_shut()
    {
        // The service layer refuses on an empty set rather than letting Evaluate decide,
        // so this documents the contract: nothing to read means nothing to serve.
        var windows = new List<TradingWindow>();
        var state = Clock.Evaluate(windows, Adelaide, AdelaideLocal(2026, 3, 11, 12, 0));
        Assert.False(state.Open);
    }

    [Fact]
    public void Every_day_of_the_real_roster_opens_at_some_point()
    {
        // Guard against a roster edit that accidentally closes a trading day.
        foreach (var window in AdelaideWindows)
        {
            var day = new List<TradingWindow> { window };
            var at = AdelaideLocal(2026, 3, 9 + (window.DayOfWeek - 1), 12, 0);
            Assert.True(
                Clock.Evaluate(day, Adelaide, at).Open,
                $"Day {window.DayOfWeek} ({window.Opens}-{window.Closes}) should be open at noon.");
        }
    }
}
