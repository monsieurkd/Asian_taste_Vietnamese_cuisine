namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Dashboard summary statistics for the admin overview.
/// </summary>
public class DashboardSummaryDto
{
    /// <summary>Total revenue for today.</summary>
    public decimal TodayRevenue { get; set; }

    /// <summary>Revenue difference from yesterday (percentage).</summary>
    public decimal? RevenueChangePercent { get; set; }

    /// <summary>Number of active orders (Pending + Confirmed + Preparing).</summary>
    public int ActiveOrders { get; set; }

    /// <summary>Number of completed orders today.</summary>
    public int CompletedOrdersToday { get; set; }

    /// <summary>Average order value today.</summary>
    public decimal AverageOrderValue { get; set; }

    /// <summary>Orders count by status.</summary>
    public Dictionary<string, int> OrdersByStatus { get; set; } = new();

    /// <summary>Recent orders (last 10).</summary>
    public List<RecentOrderDto> RecentOrders { get; set; } = new();
}

/// <summary>
/// Brief order information for dashboard display.
/// </summary>
public class RecentOrderDto
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public DateTime CreatedAt { get; set; }
    public string OrderType { get; set; } = string.Empty;
}
