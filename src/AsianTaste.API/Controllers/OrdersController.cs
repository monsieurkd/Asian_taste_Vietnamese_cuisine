using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Services;

namespace AsianTaste.API.Controllers;

/// <summary>
/// API controller for order management.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly OrderService _orderService;
    private readonly ILogger<OrdersController> _logger;

    public OrdersController(OrderService orderService, ILogger<OrdersController> logger)
    {
        _orderService = orderService;
        _logger = logger;
    }

    /// <summary>
    /// Create a new order via checkout flow.
    /// </summary>
    /// <param name="request">The order creation request.</param>
    /// <returns>The created order details.</returns>
    /// <response code="200">Returns the created order details.</response>
    /// <response code="400">If the request is invalid.</response>
    /// <response code="500">If there's an internal server error.</response>
    [HttpPost]
    [ProducesResponseType(typeof(CheckoutOrderResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<CheckoutOrderResponseDto>> CreateOrder([FromBody] CreateCheckoutOrderDto request)
    {
        // Validation
        if (request.Items.Count == 0)
        {
            return BadRequest(new { error = "Cart cannot be empty" });
        }

        if (string.IsNullOrWhiteSpace(request.CustomerName))
        {
            return BadRequest(new { error = "Customer name is required" });
        }

        if (string.IsNullOrWhiteSpace(request.CustomerPhone))
        {
            return BadRequest(new { error = "Customer phone is required" });
        }

        if (string.IsNullOrWhiteSpace(request.CustomerEmail))
        {
            return BadRequest(new { error = "Customer email is required" });
        }

        // Note: Payment token validation temporarily disabled for testing
        // TODO: Re-enable when Lightspeed Payments integration is complete
        // if (request.PaymentMethod == Models.Enums.PaymentMethod.Card && string.IsNullOrWhiteSpace(request.PaymentToken))
        // {
        //     return BadRequest(new { error = "Payment token is required for card payments" });
        // }

        // Log incoming request for debugging
        _logger.LogInformation("Creating order: {Email}, {ItemCount} items, {PaymentMethod}",
            request.CustomerEmail, request.Items.Count, request.PaymentMethod);

        try
        {
            var response = await _orderService.CreateOrderAsync(request);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create order for {Email}: {Message}", request.CustomerEmail, ex.Message);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get order details by order number.
    /// </summary>
    /// <param name="orderNumber">The order number (e.g., "AT-20250130120000").</param>
    /// <returns>The order details.</returns>
    /// <response code="200">Returns the order details.</response>
    /// <response code="404">If the order is not found.</response>
    [HttpGet("{orderNumber}")]
    [ProducesResponseType(typeof(OrderDetailResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderDetailResponseDto>> GetOrder(string orderNumber)
    {
        var order = await _orderService.GetOrderByNumberAsync(orderNumber);
        if (order == null)
        {
            return NotFound(new { error = "Order not found" });
        }
        return Ok(order);
    }

    /// <summary>
    /// Get order history for a customer by email.
    /// </summary>
    /// <param name="email">The customer's email address.</param>
    /// <returns>List of customer's orders.</returns>
    /// <response code="200">Returns the order history.</response>
    [HttpGet("customer/{email}")]
    [ProducesResponseType(typeof(List<OrderDetailResponseDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<OrderDetailResponseDto>>> GetCustomerOrders(string email)
    {
        var orders = await _orderService.GetCustomerOrdersAsync(email);
        return Ok(orders);
    }
}
