using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Repositories;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for admin settings and restaurant configuration.
/// Backed by the restaurant_settings / operating_hours tables (Adelaide, SA).
/// </summary>
[ApiController]
[Route("api/admin/settings")]
[Authorize]
[Produces("application/json")]
public class AdminSettingsController : ControllerBase
{
    private readonly ILogger<AdminSettingsController> _logger;
    private readonly IRestaurantSettingsRepository _settings;

    public AdminSettingsController(
        ILogger<AdminSettingsController> logger,
        IRestaurantSettingsRepository settings)
    {
        _logger = logger;
        _settings = settings;
    }

    /// <summary>
    /// Gets all restaurant settings.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(Dictionary<string, string>), StatusCodes.Status200OK)]
    public async Task<ActionResult<Dictionary<string, string>>> GetSettings(CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _settings.GetAllAsync(cancellationToken);
            return Ok(settings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving settings");
            return StatusCode(500, new { error = "An error occurred while retrieving settings" });
        }
    }

    /// <summary>
    /// Gets a single restaurant setting by key.
    /// </summary>
    [HttpGet("{key}")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetSetting(string key, CancellationToken cancellationToken)
    {
        var value = await _settings.GetAsync(key, cancellationToken);
        if (value is null)
        {
            return NotFound(new { error = $"Setting '{key}' was not found" });
        }

        return Ok(new { key, value });
    }

    /// <summary>
    /// Updates a restaurant setting.
    /// </summary>
    [HttpPut("{key}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> UpdateSetting(
            string key,
            [FromBody] UpdateSettingDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                return BadRequest(new { error = "Setting key is required" });
            }

            if (string.IsNullOrWhiteSpace(dto.Value))
            {
                return BadRequest(new { error = "Setting value is required" });
            }

            await _settings.SetAsync(key, dto.Value, cancellationToken);
            _logger.LogInformation("Updated setting {Key}", key);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating setting {Key}", key);
            return StatusCode(500, new { error = "An error occurred while updating setting" });
        }
    }

    /// <summary>
    /// Updates multiple settings at once.
    /// </summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> UpdateSettings(
            [FromBody] Dictionary<string, string> settings,
            CancellationToken cancellationToken)
    {
        try
        {
            if (settings is null || settings.Count == 0)
            {
                return BadRequest(new { error = "At least one setting is required" });
            }

            await _settings.SetManyAsync(settings, cancellationToken);
            _logger.LogInformation("Updated {Count} settings", settings.Count);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating settings");
            return StatusCode(500, new { error = "An error occurred while updating settings" });
        }
    }

    /// <summary>
    /// Gets restaurant operating hours (Adelaide local time).
    /// </summary>
    [HttpGet("hours")]
    [ProducesResponseType(typeof(List<DayHoursDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DayHoursDto>>> GetOperatingHours(CancellationToken cancellationToken)
    {
        try
        {
            var records = await _settings.GetHoursAsync(cancellationToken);

            var hours = records.Select(r => new DayHoursDto
            {
                DayOfWeek = DayName(r.DayOfWeek),
                OpenTime = FormatTime(r.OpenTime),
                CloseTime = FormatTime(r.CloseTime),
                IsClosed = r.IsClosed,
            }).ToList();

            return Ok(hours);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving operating hours");
            return StatusCode(500, new { error = "An error occurred while retrieving operating hours" });
        }
    }

    /// <summary>
    /// Updates operating hours for a specific day. Accepts either a day name
    /// (Monday..Sunday) or an ISO day number (1..7).
    /// </summary>
    [HttpPut("hours/{day}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> UpdateOperatingHours(
            string day,
            [FromBody] UpdateDayHoursDto dto,
            CancellationToken cancellationToken)
    {
        try
        {
            if (!TryParseDay(day, out var dayOfWeek))
            {
                return BadRequest(new { error = $"'{day}' is not a valid day. Use Monday..Sunday or 1..7." });
            }

            if (!TryParseTime(dto.OpenTime, out var openTime) || !TryParseTime(dto.CloseTime, out var closeTime))
            {
                return BadRequest(new { error = "OpenTime and CloseTime must be in HH:mm format." });
            }

            var isClosed = dto.IsClosed ?? false;

            await _settings.SetHoursAsync(dayOfWeek, openTime, closeTime, isClosed, cancellationToken);
            _logger.LogInformation("Updated hours for {Day}", day);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating operating hours for {Day}", day);
            return StatusCode(500, new { error = "An error occurred while updating operating hours" });
        }
    }

    private static string DayName(int isoDay) => isoDay switch
    {
        1 => "Monday",
        2 => "Tuesday",
        3 => "Wednesday",
        4 => "Thursday",
        5 => "Friday",
        6 => "Saturday",
        7 => "Sunday",
        _ => $"Day {isoDay}",
    };

    private static bool TryParseDay(string day, out int isoDay)
    {
        if (int.TryParse(day, out var numeric) && numeric is >= 1 and <= 7)
        {
            isoDay = numeric;
            return true;
        }

        var names = new[] { "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday" };
        var index = Array.IndexOf(names, day.Trim().ToLowerInvariant());
        if (index >= 0)
        {
            isoDay = index + 1;
            return true;
        }

        isoDay = 0;
        return false;
    }

    private static string? FormatTime(TimeSpan? time) => time?.ToString(@"hh\:mm");

    private static bool TryParseTime(string? value, out TimeSpan? time)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            // Treat blank as "not set" rather than an error (e.g. closed days).
            time = null;
            return true;
        }

        if (TimeSpan.TryParse(value, out var parsed))
        {
            time = parsed;
            return true;
        }

        time = null;
        return false;
    }
}

// ==================== DTOs ====================

/// <summary>
/// DTO for updating a single setting.
/// </summary>
public class UpdateSettingDto
{
    public string? Value { get; set; }
}

/// <summary>
/// DTO for a single day's operating hours.
/// </summary>
public class DayHoursDto
{
    public string DayOfWeek { get; set; } = string.Empty;
    public string? OpenTime { get; set; }
    public string? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

/// <summary>
/// DTO for updating a day's operating hours.
/// </summary>
public class UpdateDayHoursDto
{
    public string? OpenTime { get; set; }
    public string? CloseTime { get; set; }
    public bool? IsClosed { get; set; }
}
