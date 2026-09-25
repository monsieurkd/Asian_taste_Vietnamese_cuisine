using System.Reflection;
using AsianTaste.API.Repositories;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards that the dashboard's "today" is the RESTAURANT's today.
///
/// Regression context: the summary query compared <c>created_at >= DateTime.UtcNow.Date</c>.
/// Adelaide runs on UTC+9:30, so for the entire evening service — from 9:30am local
/// until midnight — UTC is still on the previous date, and the day's takings and
/// collected counts were computed from a window that ended fourteen hours earlier.
/// The owner reading "Revenue today" during dinner saw the trade from before opening.
///
/// The failure is quiet in the same way the mapping bugs are: the number is present,
/// plausible and wrong, and it moves when you refresh, so it reads as a live figure
/// rather than a broken one.
///
/// This drives the real helper rather than asserting on the text of the SQL, because
/// the thing that was wrong is an arithmetic result across a timezone, not a clause.
/// </summary>
public class DashboardDayBoundaryTests
{
    private static async Task<DateTime> LocalDayStartUtcAsync(IRestaurantSettingsRepository settings, DateTime localNow)
    {
        var repository = new OrderRepository(null!, settings);

        var method = typeof(OrderRepository).GetMethod(
            "GetLocalDayStartUtcAsync",
            BindingFlags.Instance | BindingFlags.NonPublic);

        Assert.True(method is not null, "GetLocalDayStartUtcAsync no longer exists on OrderRepository.");

        var task = (Task<DateTime>)method!.Invoke(repository, new object[] { localNow, CancellationToken.None })!;
        return await task;
    }

    [Fact]
    public async Task The_day_starts_at_local_midnight_for_an_adelaide_kitchen()
    {
        // 2026-03-12 is inside daylight saving in Adelaide (UTC+10:30), so local
        // midnight is 13:30 UTC on the previous day.
        var dayStart = await LocalDayStartUtcAsync(new StubSettings("Australia/Adelaide"), new DateTime(2026, 3, 12, 20, 0, 0));

        Assert.Equal(new DateTime(2026, 3, 11, 13, 30, 0), dayStart);
    }

    [Fact]
    public async Task A_dinner_service_falls_inside_the_same_trading_day()
    {
        // 8pm local is 9:30am UTC — the same UTC date, but the previous Adelaide date
        // is what matters. The window must still contain the evening's orders.
        var dayStart = await LocalDayStartUtcAsync(new StubSettings("Australia/Adelaide"), new DateTime(2026, 3, 12, 20, 0, 0));

        // 7pm local on the 12th, expressed in UTC.
        var dinnerOrder = new DateTime(2026, 3, 12, 8, 30, 0);

        Assert.True(
            dinnerOrder >= dayStart,
            "An order placed during the evening service fell outside the dashboard's 'today', which is " +
            "how dinner trade is reported as tomorrow's takings.");
    }

    [Fact]
    public async Task The_previous_local_day_is_excluded()
    {
        var dayStart = await LocalDayStartUtcAsync(new StubSettings("Australia/Adelaide"), new DateTime(2026, 3, 12, 20, 0, 0));

        // 11pm local on the 11th — still on the board yesterday, not today.
        var yesterday = new DateTime(2026, 3, 11, 12, 30, 0);

        Assert.True(yesterday < dayStart, "Yesterday's late orders are being counted into today.");
    }

    [Fact]
    public async Task An_unreadable_timezone_degrades_to_utc_rather_than_throwing()
    {
        // A settings outage must not take the dashboard down with it: a UTC figure is
        // wrong by half a day, an exception is a blank screen during service.
        var dayStart = await LocalDayStartUtcAsync(new StubSettings("Not/AZone"), new DateTime(2026, 3, 12, 20, 0, 0));

        Assert.Equal(DateTime.UtcNow.Date, dayStart);
    }

    [Fact]
    public async Task A_missing_timezone_setting_also_degrades_to_utc()
    {
        var dayStart = await LocalDayStartUtcAsync(new StubSettings(null), new DateTime(2026, 3, 12, 20, 0, 0));

        Assert.Equal(DateTime.UtcNow.Date, dayStart);
    }

    private sealed class StubSettings : IRestaurantSettingsRepository
    {
        private readonly string? _timezone;

        public StubSettings(string? timezone) => _timezone = timezone;

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(key == "timezone" ? _timezone : null);

        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string>());

        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new List<OperatingHoursRecord>());

        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
