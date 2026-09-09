using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Services.Lightspeed;
using AsianTaste.API.Repositories;
using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Controllers;

/// <summary>
/// Admin controller for Lightspeed sync operations.
/// Provides endpoints for manual sync triggering and sync status monitoring.
/// </summary>
[ApiController]
[Route("api/admin/sync")]
[Authorize(Roles = "Admin")]
public class AdminSyncController : ControllerBase
{
    private readonly ILightspeedOrderService _orderService;
    private readonly IOrderRepository _orderRepository;
    private readonly ILogger<AdminSyncController> _logger;

    public AdminSyncController(
        ILightspeedOrderService orderService,
        IOrderRepository orderRepository,
        ILogger<AdminSyncController> logger)
    {
        _orderService = orderService;
        _orderRepository = orderRepository;
        _logger = logger;
    }

    /// <summary>
    /// Manually trigger sync for a specific order.
    /// POST: /api/admin/sync/order/{orderId}
    /// </summary>
    /// <param name="orderId">The local order ID to sync.</param>
    /// <returns>Result of the sync operation.</returns>
    [HttpPost("order/{orderId}")]
    [ProducesResponseType(typeof(SyncOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SyncOrderResponse>> SyncOrder(int orderId)
    {
        _logger.LogInformation("Manual sync requested for order {OrderId}", orderId);

        // Get order with items
        var order = await _orderRepository.GetOrderByIdAsync(orderId);
        if (order == null)
        {
            return NotFound(new { error = "Order not found" });
        }

        // Check if already synced
        if (!string.IsNullOrEmpty(order.LightspeedOrderId))
        {
            return Ok(new SyncOrderResponse
            {
                Success = true,
                Message = "Order already synced to Lightspeed",
                LightspeedOrderId = order.LightspeedOrderId,
                SyncStatus = order.LightspeedSyncStatus
            });
        }

        // Get order items
        var items = await _orderRepository.GetOrderItemsAsync(orderId);
        order.Items = items;

        // Perform sync
        var result = await _orderService.CreateOrderAsync(order);

        if (result.Success)
        {
            // Update sync info
            await _orderRepository.UpdateOrderSyncInfoAsync(
                orderId,
                result.LightspeedOrderId!.Value.ToString(),
                SyncStatus.Synced,
                DateTime.UtcNow,
                null);

            _logger.LogInformation("Manual sync successful for order {OrderId}, Lightspeed ID: {LightspeedOrderId}",
                orderId, result.LightspeedOrderId);

            return Ok(new SyncOrderResponse
            {
                Success = true,
                Message = "Order successfully synced to Lightspeed",
                LightspeedOrderId = result.LightspeedOrderId.Value.ToString(),
                OrderNumber = result.OrderNumber,
                SyncStatus = SyncStatus.Synced
            });
        }
        else
        {
            // Update with failure
            await _orderRepository.UpdateOrderSyncInfoAsync(
                orderId,
                null,
                SyncStatus.Failed,
                null,
                result.ErrorMessage);

            _logger.LogWarning("Manual sync failed for order {OrderId}: {Error}",
                orderId, result.ErrorMessage);

            return BadRequest(new SyncOrderResponse
            {
                Success = false,
                Message = result.ErrorMessage ?? "Sync failed",
                ErrorCode = result.ErrorCode,
                SyncStatus = SyncStatus.Failed
            });
        }
    }

    /// <summary>
    /// Gets sync statistics.
    /// GET: /api/admin/sync/status
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(LightspeedSyncStats), StatusCodes.Status200OK)]
    public async Task<ActionResult<LightspeedSyncStats>> GetSyncStatus()
    {
        var stats = await _orderService.GetSyncStatsAsync();
        return Ok(stats);
    }

    /// <summary>
    /// Retries all failed syncs.
    /// POST: /api/admin/sync/retry-failed
    /// </summary>
    [HttpPost("retry-failed")]
    [ProducesResponseType(typeof(RetryFailedResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<RetryFailedResponse>> RetryFailedSyncs()
    {
        _logger.LogInformation("Manual retry of failed syncs requested");

        var retryCount = await _orderService.RetryFailedSyncsAsync();

        return Ok(new RetryFailedResponse
        {
            SuccessCount = retryCount,
            Message = retryCount > 0
                ? $"Successfully retried and synced {retryCount} order(s)"
                : "No orders were successfully retried"
        });
    }

    /// <summary>
    /// Gets orders pending sync.
    /// GET: /api/admin/sync/pending
    /// </summary>
    [HttpGet("pending")]
    [ProducesResponseType(typeof(List<PendingSyncOrderDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<PendingSyncOrderDto>>> GetPendingSyncOrders(
        [FromQuery] int limit = 20)
    {
        var orders = await _orderRepository.GetPendingSyncOrdersAsync(limit);

        var result = orders.Select(o => new PendingSyncOrderDto
        {
            Id = o.Id,
            OrderNumber = o.OrderNumber,
            CustomerName = o.CustomerName,
            Total = o.Total,
            CreatedAt = o.CreatedAt,
            PaymentStatus = o.PaymentStatus,
            SyncStatus = o.LightspeedSyncStatus
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Gets orders with failed sync.
    /// GET: /api/admin/sync/failed
    /// </summary>
    [HttpGet("failed")]
    [ProducesResponseType(typeof(List<FailedSyncOrderDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<FailedSyncOrderDto>>> GetFailedSyncOrders(
        [FromQuery] int limit = 20)
    {
        var orders = await _orderRepository.GetFailedSyncOrdersAsync(limit);

        var result = orders.Select(o => new FailedSyncOrderDto
        {
            Id = o.Id,
            OrderNumber = o.OrderNumber,
            CustomerName = o.CustomerName,
            Total = o.Total,
            CreatedAt = o.CreatedAt,
            ErrorMessage = o.SyncError,
            UpdatedAt = o.UpdatedAt ?? o.CreatedAt
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Marks an order for pending sync.
    /// POST: /api/admin/sync/pending/{orderId}
    /// </summary>
    [HttpPost("pending/{orderId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> MarkOrderPending(int orderId)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId);
        if (order == null)
        {
            return NotFound(new { error = "Order not found" });
        }

        await _orderRepository.MarkOrderSyncPendingAsync(orderId);

        _logger.LogInformation("Order {OrderId} marked for pending sync", orderId);

        return Ok(new { message = "Order marked for pending sync" });
    }
}

#region DTOs

/// <summary>
/// Response from order sync operation.
/// </summary>
public record SyncOrderResponse
{
    /// <summary>Whether the sync was successful.</summary>
    public bool Success { get; init; }

    /// <summary>Human-readable message.</summary>
    public string? Message { get; init; }

    /// <summary>Lightspeed order ID (if successful).</summary>
    public string? LightspeedOrderId { get; init; }

    /// <summary>Lightspeed order number (if successful).</summary>
    public string? OrderNumber { get; init; }

    /// <summary>Error code (if failed).</summary>
    public string? ErrorCode { get; init; }

    /// <summary>Current sync status.</summary>
    public SyncStatus SyncStatus { get; init; }
}

/// <summary>
/// Response from retry failed syncs operation.
/// </summary>
public record RetryFailedResponse
{
    /// <summary>Number of orders successfully retried.</summary>
    public int SuccessCount { get; init; }

    /// <summary>Human-readable message.</summary>
    public string? Message { get; init; }
}

/// <summary>
/// DTO for pending sync order.
/// </summary>
public record PendingSyncOrderDto
{
    /// <summary>Local order ID.</summary>
    public int Id { get; init; }

    /// <summary>Order number.</summary>
    public string OrderNumber { get; init; } = string.Empty;

    /// <summary>Customer name.</summary>
    public string CustomerName { get; init; } = string.Empty;

    /// <summary>Order total.</summary>
    public decimal Total { get; init; }

    /// <summary>When order was created.</summary>
    public DateTime CreatedAt { get; init; }

    /// <summary>Payment status.</summary>
    public PaymentStatus PaymentStatus { get; init; }

    /// <summary>Current sync status.</summary>
    public SyncStatus SyncStatus { get; init; }
}

/// <summary>
/// DTO for failed sync order.
/// </summary>
public record FailedSyncOrderDto
{
    /// <summary>Local order ID.</summary>
    public int Id { get; init; }

    /// <summary>Order number.</summary>
    public string OrderNumber { get; init; } = string.Empty;

    /// <summary>Customer name.</summary>
    public string CustomerName { get; init; } = string.Empty;

    /// <summary>Order total.</summary>
    public decimal Total { get; init; }

    /// <summary>When order was created.</summary>
    public DateTime CreatedAt { get; init; }

    /// <summary>Error message from failed sync.</summary>
    public string? ErrorMessage { get; init; }

    /// <summary>When order was last updated (sync attempt time).</summary>
    public DateTime UpdatedAt { get; init; }
}

#endregion
