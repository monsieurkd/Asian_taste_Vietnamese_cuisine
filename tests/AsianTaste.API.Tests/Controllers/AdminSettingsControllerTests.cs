using AsianTaste.API.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using AsianTaste.API.Repositories;

namespace AsianTaste.API.Tests.Controllers;

/// <summary>
/// Tests for AdminSettingsController's day/time parsing and validation, which
/// guard the operating-hours API. Uses a stub repository so no DB is required.
/// </summary>
public class AdminSettingsControllerTests
{
    private static AdminSettingsController CreateController(IRestaurantSettingsRepository? repo = null) =>
        new(NullLogger<AdminSettingsController>.Instance, repo ?? new StubSettingsRepository());

    [Theory]
    [InlineData("Monday", 1)]
    [InlineData("monday", 1)]
    [InlineData(" Sunday ", 7)]
    [InlineData("1", 1)]
    [InlineData("7", 7)]
    public async Task UpdateOperatingHours_Accepts_Day_Names_And_ISO_Numbers(string day, int expectedIsoDay)
    {
        var repo = new StubSettingsRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateOperatingHours(
            day,
            new UpdateDayHoursDto { OpenTime = "10:00", CloseTime = "14:30" },
            CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal(expectedIsoDay, repo.LastDayOfWeek);
    }

    [Theory]
    [InlineData("Funday")]
    [InlineData("0")]
    [InlineData("8")]
    [InlineData("")]
    public async Task UpdateOperatingHours_Rejects_Invalid_Day(string day)
    {
        var controller = CreateController();

        var result = await controller.UpdateOperatingHours(
            day,
            new UpdateDayHoursDto { OpenTime = "10:00", CloseTime = "14:30" },
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateOperatingHours_Rejects_Invalid_Time_Format()
    {
        var controller = CreateController();

        var result = await controller.UpdateOperatingHours(
            "Monday",
            new UpdateDayHoursDto { OpenTime = "not-a-time", CloseTime = "14:30" },
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateOperatingHours_Allows_Blank_Times_For_Closed_Days()
    {
        var repo = new StubSettingsRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateOperatingHours(
            "Sunday",
            new UpdateDayHoursDto { OpenTime = null, CloseTime = null, IsClosed = true },
            CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.True(repo.LastIsClosed);
    }

    [Fact]
    public async Task GetSettings_Returns_Adelaide_Timezone_And_Gst_Inclusive_Flag()
    {
        var repo = new StubSettingsRepository();
        repo.Settings["timezone"] = "Australia/Adelaide";
        repo.Settings["prices_include_tax"] = "true";
        repo.Settings["currency_code"] = "AUD";
        var controller = CreateController(repo);

        var result = await controller.GetSettings(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var settings = Assert.IsType<Dictionary<string, string>>(ok.Value);
        Assert.Equal("Australia/Adelaide", settings["timezone"]);
        Assert.Equal("true", settings["prices_include_tax"]);
        Assert.Equal("AUD", settings["currency_code"]);
    }

    [Fact]
    public async Task UpdateSettings_Rejects_Empty_Payload()
    {
        var controller = CreateController();

        var result = await controller.UpdateSettings(
            new Dictionary<string, string>(),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateSetting_Rejects_Blank_Value()
    {
        var controller = CreateController();

        var result = await controller.UpdateSetting(
            "phone",
            new UpdateSettingDto { Value = "  " },
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task GetOperatingHours_Formats_Times_As_HHmm()
    {
        var repo = new StubSettingsRepository();
        repo.Hours.Add(new OperatingHoursRecord
        {
            DayOfWeek = 1,
            OpenTime = new TimeSpan(10, 0, 0),
            CloseTime = new TimeSpan(14, 30, 0),
            IsClosed = false,
        });
        var controller = CreateController(repo);

        var result = await controller.GetOperatingHours(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var hours = Assert.IsType<List<DayHoursDto>>(ok.Value);
        var monday = Assert.Single(hours);
        Assert.Equal("Monday", monday.DayOfWeek);
        Assert.Equal("10:00", monday.OpenTime);
        Assert.Equal("14:30", monday.CloseTime);
    }

    /// <summary>In-memory stub so these tests need no database.</summary>
    private sealed class StubSettingsRepository : IRestaurantSettingsRepository
    {
        public Dictionary<string, string> Settings { get; } = new();
        public List<OperatingHoursRecord> Hours { get; } = new();
        public int? LastDayOfWeek { get; private set; }
        public bool LastIsClosed { get; private set; }

        public Task<Dictionary<string, string>> GetAllAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new Dictionary<string, string>(Settings));

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(Settings.TryGetValue(key, out var v) ? v : null);

        public Task SetAsync(string key, string value, CancellationToken cancellationToken = default)
        {
            Settings[key] = value;
            return Task.CompletedTask;
        }

        public Task SetManyAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default)
        {
            foreach (var (k, v) in settings)
            {
                Settings[k] = v;
            }
            return Task.CompletedTask;
        }

        public Task<List<OperatingHoursRecord>> GetHoursAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(Hours.OrderBy(h => h.DayOfWeek).ToList());

        public Task SetHoursAsync(int dayOfWeek, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, CancellationToken cancellationToken = default)
        {
            LastDayOfWeek = dayOfWeek;
            LastIsClosed = isClosed;
            return Task.CompletedTask;
        }
    }
}
