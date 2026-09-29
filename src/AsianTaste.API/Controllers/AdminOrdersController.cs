using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
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
    private readonly OrderService _orderService;
    private readonly ILogger<AdminOrdersController> _logger;

    public AdminOrdersController(
        IOrderRepository orderRepository,
        OrderService orderService,
        ILogger<AdminOrdersController> logger)
    {
        _orderRepository = orderRepository;
        _orderService = orderService;
        _logger = logger;
    }

    /// <summary>
    /// Gets all orders with optional filtering for admin dashboard.
    /// </summary>
    /// <param name="status">Optional status filter.</param>
    /// <param name="fromDate">Optional start date filter.</param>
    /// <param name="toDate">Optional end date filter.</param>
    /// <param name="orderNumber">
    /// Optional partial order-number search. A substring match, so staff can type the
    /// short form they read off a docket ("42") as well as the full number. Contains
    /// rather than starts-with, because the date prefix is the part they never read.
    /// </param>
    /// <param name="limit">Maximum number of orders to return (default: 50).</param>
    /// <param name="offset">Number of orders to skip (default: 0).</param>
    /// <response code="200">Returns list of orders.</response>
    /// <response code="401">Unauthorized - invalid or missing token.</response>
    [HttpGet]
    [ProducesResponseType(typeof(List<AdminOrderListDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> GetAllOrders(
        [FromQuery] string? status,
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] string? orderNumber,
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

            var orders = await _orderRepository.GetAllOrdersAsync(statusEnum, fromDate, toDate, limit, offset, orderNumber);
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
    /// Replaces an order's contents — the phone-change path.
    /// </summary>
    /// <remarks>
    /// The caller sends dishes and quantities, never prices: the server re-prices from
    /// the current menu, so an edit cannot set its own total. The new total is returned
    /// with a note about the money when it differs from what was charged.
    /// </remarks>
    /// <param name="id">Order ID.</param>
    /// <param name="request">The replacement contents.</param>
    /// <response code="200">The order was edited, with its recomputed totals.</response>
    /// <response code="400">The request is invalid, or a dish is no longer on the menu.</response>
    /// <response code="404">Order not found.</response>
    /// <response code="409">The new pickup time is outside trading hours.</response>
    [HttpPut("{id}/items")]
    [ProducesResponseType(typeof(UpdateOrderItemsResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UpdateOrderItemsResponseDto>> UpdateOrderItems(
        int id,
        [FromBody] UpdateOrderItemsDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.UpdateOrderItemsAsync(id, request, cancellationToken);
            if (result is null)
            {
                return NotFound(new { error = $"Order with ID {id} not found" });
            }

            _logger.LogInformation(
                "Order {OrderId} items replaced by admin: new total {Total}", id, result.Total);

            return Ok(result);
        }
        catch (ShopClosedException ex)
        {
            // The same 409 the customer-facing checkout gives, for the same reason: a
            // pickup time the kitchen cannot serve is a business refusal, not a fault.
            return Conflict(new { error = "kitchen_closed", message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            // A dish that has been removed from the menu, or another business rule.
            // 400 because the request is what is wrong, and the message names the dish.
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error editing items for order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while editing the order" });
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
