namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Daily statistics for a specific date.
/// </summary>
public class DailyStatsDto
{
    /// <summary>The date for these stats.</summary>
    public DateTime Date { get; set; }

    /// <summary>Total revenue for the day.</summary>
    public decimal Revenue { get; set; }

    /// <summary>Total number of orders.</summary>
    public int TotalOrders { get; set; }

    /// <summary>Average order value.</summary>
    public decimal AverageOrderValue { get; set; }

    /// <summary>Orders by status.</summary>
    public Dictionary<string, int> OrdersByStatus { get; set; } = new();

    /// <summary>Hourly order distribution (hour -> count).</summary>
    public Dictionary<int, int> HourlyDistribution { get; set; } = new();
}
