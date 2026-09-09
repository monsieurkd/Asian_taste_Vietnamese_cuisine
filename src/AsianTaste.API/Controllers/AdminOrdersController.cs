using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Admin controller for order management.
/// All endpoints require JWT authentication.
/// </summary>
[ApiController]
[Route("api/admin/orders")]
[Produces("application/json")]
[Authorize]
public class AdminOrdersController : ControllerBase
{
    private readonly IOrderRepository _orderRepository;
    private readonly ILogger<AdminOrdersController> _logger;

    public AdminOrdersController(
        IOrderRepository orderRepository,
        ILogger<AdminOrdersController> logger)
    {
        _orderRepository = orderRepository;
        _logger = logger;
    }

    /// <summary>
    /// Gets all orders with optional filtering for admin dashboard.
    /// </summary>
    /// <param name="status">Optional status filter.</param>
    /// <param name="fromDate">Optional start date filter.</param>
    /// <param name="toDate">Optional end date filter.</param>
    /// <param name="limit">Maximum number of orders to return (default: 50).</param>
    /// <param name="offset">Number of orders to skip (default: 0).</param>
    /// <response code="200">Returns list of orders.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpGet]
    [ProducesResponseType(typeof(List<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> GetAllOrders(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0)
    {
        try
        {
            OrderStatus? statusEnum = null;
            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, true, out var parsedStatus))
            {
                statusEnum = parsedStatus;
            }

            var orders = await _orderRepository.GetAllOrdersAsync(statusEnum, fromDate, toDate, limit, offset);
            return Ok(orders);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving admin orders");
            return StatusCode(500, new { error = "An error occurred while retrieving orders" });
        }
    }

    /// <summary>
    /// Gets detailed order information including items and modifiers.
    /// </summary>
    /// <param name="id">Order ID.</param>
    /// <response code="200">Returns order details.</response>
    /// <response code="404">Order not found.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(AdminOrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AdminOrderDetailDto>> GetOrderDetail(int id)
    {
        try
        {
            var order = await _orderRepository.GetAdminOrderDetailAsync(id);
            if (order == null)
            {
                return NotFound(new { error = $"Order with ID {id} not found" });
            }
            return Ok(order);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving order details for order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while retrieving order details" });
        }
    }

    /// <summary>
    /// Gets dashboard summary statistics (revenue, active orders, etc.).
    /// </summary>
    /// <response code="200">Returns dashboard summary.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpGet("summary")]
    [ProducesResponseType(typeof(DashboardSummaryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<DashboardSummaryDto>> GetDashboardSummary()
    {
        try
        {
            var summary = await _orderRepository.GetDashboardSummaryAsync();
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving dashboard summary");
            return StatusCode(500, new { error = "An error occurred while retrieving dashboard summary" });
        }
    }

    /// <summary>
    /// Gets daily statistics for a specific date.
    /// </summary>
    /// <param name="date">The date to get statistics for (format: YYYY-MM-DD). Defaults to today.</param>
    /// <response code="200">Returns daily statistics.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpGet("stats/daily")]
    [ProducesResponseType(typeof(DailyStatsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<DailyStatsDto>> GetDailyStats([FromQuery] DateTime? date = null)
    {
        try
        {
            var targetDate = date ?? DateTime.UtcNow.Date;
            var stats = await _orderRepository.GetDailyStatsAsync(targetDate);
            return Ok(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving daily stats for date {Date}", date);
            return StatusCode(500, new { error = "An error occurred while retrieving daily statistics" });
        }
    }

    /// <summary>
    /// Updates the status of an order.
    /// </summary>
    /// <param name="id">Order ID.</param>
    /// <param name="request">Status update request.</param>
    /// <response code="200">Status updated successfully.</response>
    /// <response code="400">Invalid request.</response>
    /// <response code="404">Order not found.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpPut("{id}/status")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> UpdateOrderStatus(int id, [FromBody] UpdateOrderStatusDto request)
    {
        try
        {
            if (!Enum.TryParse<OrderStatus>(request.Status, true, out var status))
            {
                return BadRequest(new { error = $"Invalid order status: {request.Status}" });
            }

            // If cancelling, require a reason
            if (status == OrderStatus.Cancelled && string.IsNullOrWhiteSpace(request.Reason))
            {
                return BadRequest(new { error = "Reason is required when cancelling an order" });
            }

            await _orderRepository.UpdateOrderStatusAsync(id, status);

            _logger.LogInformation("Order {OrderId} status updated to {Status} by admin", id, status);

            return Ok(new
            {
                message = "Order status updated successfully",
                orderId = id,
                status = status.ToString(),
                reason = request.Reason
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating status for order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while updating order status" });
        }
    }
}
