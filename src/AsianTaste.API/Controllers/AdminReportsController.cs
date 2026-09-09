using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Repositories;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Controller for admin reports and analytics.
/// </summary>
[ApiController]
[Route("api/admin/reports")]
[Authorize]
[Produces("application/json")]
public class AdminReportsController : ControllerBase
{
    private readonly IOrderRepository _orderRepository;
    private readonly ILogger<AdminReportsController> _logger;

    public AdminReportsController(IOrderRepository orderRepository, ILogger<AdminReportsController> logger)
    {
        _orderRepository = orderRepository;
        _logger = logger;
    }

    /// <summary>
    /// Gets sales data for a date range.
    /// </summary>
    [HttpGet("sales")]
    [ProducesResponseType(typeof(SalesReportDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<SalesReportDto>> GetSalesReport(
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            CancellationToken cancellationToken)
    {
        try
        {
            // Default to last 30 days if no dates provided
            var endDate = toDate ?? DateTime.UtcNow;
            var startDate = fromDate ?? endDate.AddDays(-30);

            // TODO: Implement sales data query
            var report = new SalesReportDto
            {
                StartDate = startDate,
                EndDate = endDate,
                TotalRevenue = 0,
                TotalOrders = 0,
                AverageOrderValue = 0,
                DailyBreakdown = new Dictionary<DateTime, DailySalesDto>()
            };

            _logger.LogInformation("Sales report requested from {StartDate} to {EndDate}", startDate, endDate);
            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating sales report");
            return StatusCode(500, new { error = "An error occurred while generating sales report" });
        }
    }

    /// <summary>
    /// Gets popular menu items by order frequency.
    /// </summary>
    [HttpGet("popular-items")]
    [ProducesResponseType(typeof(List<PopularItemDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<PopularItemDto>>> GetPopularItems(
            CancellationToken cancellationToken,
            [FromQuery] int limit = 10)
    {
        try
        {
            // TODO: Implement popular items query
            var popularItems = new List<PopularItemDto>();

            _logger.LogInformation("Popular items report requested with limit {Limit}", limit);
            return Ok(popularItems);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving popular items");
            return StatusCode(500, new { error = "An error occurred while retrieving popular items" });
        }
    }

    /// <summary>
    /// Gets sales breakdown by category.
    /// </summary>
    [HttpGet("category-sales")]
    [ProducesResponseType(typeof(List<CategorySalesDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<CategorySalesDto>>> GetCategorySales(
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            CancellationToken cancellationToken)
    {
        try
        {
            // Default to last 30 days if no dates provided
            var endDate = toDate ?? DateTime.UtcNow;
            var startDate = fromDate ?? endDate.AddDays(-30);

            // TODO: Implement category sales query
            var categorySales = new List<CategorySalesDto>();

            _logger.LogInformation("Category sales report requested from {StartDate} to {EndDate}", startDate, endDate);
            return Ok(categorySales);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating category sales report");
            return StatusCode(500, new { error = "An error occurred while generating category sales report" });
        }
    }

    /// <summary>
    /// Gets hourly order distribution for a specific date.
    /// </summary>
    [HttpGet("hourly")]
    [ProducesResponseType(typeof(HourlyReportDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<HourlyReportDto>> GetHourlyReport(
            [FromQuery] DateTime? date,
            CancellationToken cancellationToken)
    {
        try
        {
            var targetDate = date ?? DateTime.UtcNow;

            // TODO: Implement hourly distribution query
            var report = new HourlyReportDto
            {
                Date = targetDate,
                HourlyDistribution = new Dictionary<int, int>()
            };

            _logger.LogInformation("Hourly report requested for {Date}", targetDate);
            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating hourly report");
            return StatusCode(500, new { error = "An error occurred while generating hourly report" });
        }
    }
}

// ==================== DTOs ====================

/// <summary>
/// Sales report DTO.
/// </summary>
public class SalesReportDto
{
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal TotalRevenue { get; set; }
    public int TotalOrders { get; set; }
    public decimal AverageOrderValue { get; set; }
    public Dictionary<DateTime, DailySalesDto> DailyBreakdown { get; set; } = new();
}

/// <summary>
/// Daily sales breakdown.
/// </summary>
public class DailySalesDto
{
    public DateTime Date { get; set; }
    public decimal Revenue { get; set; }
    public int Orders { get; set; }
    public decimal AverageOrderValue { get; set; }
}

/// <summary>
/// Popular item DTO.
/// </summary>
public class PopularItemDto
{
    public int MenuItemId { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public int TimesOrdered { get; set; }
    public decimal TotalRevenue { get; set; }
    public double AverageRating { get; set; }
}

/// <summary>
/// Category sales DTO.
/// </summary>
public class CategorySalesDto
{
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public int OrdersCount { get; set; }
    public decimal Revenue { get; set; }
    public double PercentageOfTotal { get; set; }
}

/// <summary>
/// Hourly report DTO.
/// </summary>
public class HourlyReportDto
{
    public DateTime Date { get; set; }
    public int TotalOrders { get; set; }
    public Dictionary<int, int> HourlyDistribution { get; set; } = new();
    public int PeakHour { get; set; }
    public int PeakOrders { get; set; }
}
