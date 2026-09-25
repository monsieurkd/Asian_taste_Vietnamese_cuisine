namespace AsianTaste.API.Services;

/// <summary>
/// One trading window on one day, in the restaurant's local time.
/// </summary>
/// <param name="DayOfWeek">ISO day number: 1 = Monday … 7 = Sunday.</param>
/// <param name="Opens">Local time the kitchen takes orders from.</param>
/// <param name="Closes">Local time of the last order it accepts.</param>
/// <param name="BreakStart">
/// When the kitchen stops for the break between services, if it does. This kitchen
/// closes between lunch and dinner and reopens in the evening, so a single
/// open/close pair per day would report it SHUT from 4pm and turn evening customers
/// away — or, read the other way, accept an order in the dead hour between services.
/// Null means one continuous service.
/// </param>
/// <param name="BreakEnd">When it reopens after the break.</param>
public record TradingWindow(
    int DayOfWeek,
    TimeSpan Opens,
    TimeSpan Closes,
    TimeSpan? BreakStart = null,
    TimeSpan? BreakEnd = null)
{
    /// <summary>
    /// Whether a local time falls inside this window, accounting for the break.
    /// </summary>
    public bool Contains(TimeSpan local)
    {
        if (local < Opens || local > Closes) return false;

        // Inside the break is NOT inside the window. The break is expressed as a
        // half-open interval so its first minute is already shut and its last minute
        // is already open — which is what "closes at 4, reopens at 4:30" means.
        if (BreakStart.HasValue && BreakEnd.HasValue &&
            local >= BreakStart.Value && local < BreakEnd.Value)
        {
            return false;
        }

        return true;
    }

    /// <summary>When this window next takes an order after <paramref name="local"/>.</summary>
    public TimeSpan? NextOpeningAfter(TimeSpan local)
    {
        if (local < Opens) return Opens;

        // Inside the break, the answer is when the break ends — which is only
        // meaningful when both ends of the break are configured.
        if (BreakStart.HasValue && BreakEnd.HasValue &&
            local >= BreakStart.Value && local < BreakEnd.Value)
        {
            return BreakEnd.Value;
        }

        return null;
    }
}

/// <summary>
/// Whether the kitchen is open, judged in the restaurant's own timezone.
/// </summary>
public record TradingState(bool Open, string Reason)
{
    public static TradingState OpenNow(string reason = "Open") => new(true, reason);
    public static TradingState Shut(string reason) => new(false, reason);
}

/// <summary>
/// Decides whether an order may be placed right now.
///
/// **This exists because the storefront's own check is not a control.** The customer
/// app has shown "Closed · opens 10am" on the menu page for a while, and that is a
/// courtesy to the customer, not a rule: the API is a public endpoint, so anything
/// posting to it directly — a script, a stale tab left open overnight, a bookmark
/// followed at 2am — could place and PAY for an order the kitchen would never cook.
/// A refund plus a phone call is the cost of that, every time.
///
/// Two details are load-bearing:
///
/// 1. **The judgement happens server-side, in `Australia/Adelaide`.** The client's
///    clock is not evidence: a customer browsing from another timezone, or a laptop
///    set to UTC, would otherwise be told the wrong thing — and, worse, allowed to
///    order at the wrong time.
/// 2. **`Closes` is inclusive.** Closing at 21:00 means an order at exactly 21:00 is
///    accepted, because the kitchen's rule is the door rather than the millisecond.
///    The frontend's engine encodes the same rule deliberately; the two must agree or
///    a customer sees "open" and is refused.
/// </summary>
public class TradingHours
{
    private readonly TimeProvider _clock;

    public TradingHours(TimeProvider clock)
    {
        _clock = clock;
    }

    /// <summary>
    /// The restaurant-local wall clock for now, as a day number and minutes past midnight.
    /// </summary>
    public (int DayOfWeek, int Minutes) LocalNow(string timezoneId)
    {
        var local = LocalNowDateTime(timezoneId);
        // ISO day number: .NET's DayOfWeek puts Sunday at 0, the database puts it at 7.
        var isoDay = local.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)local.DayOfWeek;
        return (isoDay, local.Hour * 60 + local.Minute);
    }

    public DateTime LocalNowDateTime(string timezoneId)
    {
        var now = _clock.GetUtcNow().UtcDateTime;

        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
            return TimeZoneInfo.ConvertTimeFromUtc(now, tz);
        }
        catch (Exception)
        {
            // An unreadable timezone must not silently mean "open all day", which is
            // how a kitchen gets an order at 3am. The caller decides what to do with
            // an unusable timezone; this just reports UTC so the answer is the same
            // everywhere rather than dependent on the host's zone.
            return now;
        }
    }

    /// <summary>
    /// Whether an order may be placed now, given the configured windows.
    /// </summary>
    /// <remarks>
    /// The windows are per-day and a day may legitimately have more than one (this
    /// kitchen closes between lunch and dinner). A day with no window is a closed day,
    /// which is a normal state rather than an error.
    /// </remarks>
    public TradingState Evaluate(
        IReadOnlyCollection<TradingWindow> windows,
        string timezoneId,
        DateTime? at = null)
    {
        var (day, minutes) = at is null
            ? LocalNow(timezoneId)
            : LocalParts(at.Value, timezoneId);

        var today = windows.Where(w => w.DayOfWeek == day).ToList();

        if (today.Count == 0)
        {
            return TradingState.Shut("The kitchen is closed today.");
        }

        var now = TimeSpan.FromMinutes(minutes);

        foreach (var window in today)
        {
            // The rule lives on the window itself, so a caller cannot apply the
            // open/close bounds and forget the break between services. Both ends are
            // inclusive: opening at 10:00 accepts an order at 10:00, and closing at
            // 21:00 accepts one at 21:00.
            if (window.Contains(now))
            {
                return TradingState.OpenNow();
            }
        }

        var nextToday = today
            .Select(w => w.NextOpeningAfter(now))
            .Where(t => t.HasValue)
            .Select(t => t!.Value)
            .OrderBy(t => t)
            .FirstOrDefault();

        return TradingState.Shut(nextToday != TimeSpan.Zero
            ? $"The kitchen opens at {nextToday:h\\:mm}."
            : "The kitchen has closed for today.");
    }

    /// <summary>
    /// The local day and minute for a given instant — used by the boundary tests, which
    /// must judge a fixed moment rather than "now".
    /// </summary>
    public (int DayOfWeek, int Minutes) LocalParts(DateTime at, string timezoneId)
    {
        var utc = at.Kind == DateTimeKind.Utc ? at : DateTime.SpecifyKind(at, DateTimeKind.Utc);

        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
            var local = TimeZoneInfo.ConvertTimeFromUtc(utc, tz);
            var isoDay = local.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)local.DayOfWeek;
            return (isoDay, local.Hour * 60 + local.Minute);
        }
        catch (Exception)
        {
            return (1, 0);
        }
    }
}
