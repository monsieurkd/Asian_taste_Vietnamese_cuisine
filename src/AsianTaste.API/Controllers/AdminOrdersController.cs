using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.WebSockets;
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
    private readonly IOrderNotifier _orderNotifier;
    private readonly ILogger<AdminOrdersController> _logger;

    /// <summary>
    /// Who is doing this, for the activity log.
    /// </summary>
    /// <remarks>
    /// Taken from the JWT's name claim, which JwtService fills with the admin's USERNAME.
    /// A username rather than an id because the log is read by a person ("Mai marked Pho Bo
    /// as done"), and because the log has to stay readable after an account is retired —
    /// see the note on `cooked_by` in migration 17.
    ///
    /// Null rather than "unknown" when there is no claim: the service renders a null actor
    /// as "the system", which is the accurate description of a change made by a token that
    /// did not carry an identity.
    /// </remarks>
    private string? Actor => User?.Identity?.Name;

    public AdminOrdersController(
        IOrderRepository orderRepository,
        OrderService orderService,
        IOrderNotifier orderNotifier,
        ILogger<AdminOrdersController> logger)
    {
        _orderRepository = orderRepository;
        _orderService = orderService;
        _orderNotifier = orderNotifier;
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
    /// <param name="includeItems">
    /// Include each order's lines and per-line done state. The kitchen board passes true:
    /// the ticket has to render what to cook and what is already ticked. The Orders table
    /// leaves it false, because it renders neither and asking for them would ship a page
    /// of lines nobody reads.
    /// </param>
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
        [FromQuery] int offset = 0,
        [FromQuery] bool includeItems = false)
    {
        try
        {
            OrderStatus? statusEnum = null;
            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, true, out var parsedStatus))
            {
                statusEnum = parsedStatus;
            }

            var orders = await _orderRepository.GetAllOrdersAsync(statusEnum, fromDate, toDate, limit, offset, orderNumber, includeItems);
            return Ok(orders);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving admin orders");
            return StatusCode(500, new { error = "An error occurred while retrieving orders" });
        }
    }

    /// <summary>
    /// Creates an order taken at the counter — the face-to-face path.
    /// </summary>
    /// <remarks>
    /// Staff-only by virtue of being on an <c>[Authorize]</c> controller, which is the
    /// whole safety story: a counter order carries no payment provider call and no
    /// contact details, so the thing that makes it safe is that a logged-in person with a
    /// tablet decided to take it.
    ///
    /// It is a POST to <c>/api/admin/orders</c> rather than to the public
    /// <c>/api/orders</c>, so the two paths cannot be confused at the one place it would
    /// matter — a counter order skipping the closed-kitchen rule.
    /// </remarks>
    /// <param name="request">The dishes and who they are for.</param>
    /// <response code="200">The order was created, priced and on the board.</response>
    /// <response code="400">No dishes, or a dish that is no longer on the menu.</response>
    [HttpPost]
    [ProducesResponseType(typeof(CounterOrderResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CounterOrderResponseDto>> CreateCounterOrder(
        [FromBody] CreateCounterOrderDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.CreateCounterOrderAsync(request, cancellationToken);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            // A dish that has left the menu, priced by the server. The message names it, so
            // the person at the counter knows what to say to the customer.
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating a counter order");
            return StatusCode(500, new { error = "An error occurred while creating the counter order" });
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

            // An edit changes what the kitchen is cooking. Recording it on the ticket is the
            // difference between "this ticket is wrong" and "this ticket was changed at 7:12
            // because the customer rang" — the second is the one that stops an argument.
            await _orderService.LogActivityAsync(
                id,
                "ItemsEdited",
                $"Order edited by {Actor ?? "the system"} \u2014 {request.Items.Count} line(s), new total {result.Total:0.00}."
                    + (result.AmountDueAtCounter ? " Money is owed at the counter." : string.Empty),
                Actor,
                null,
                CancellationToken.None);

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
    /// Moves an order's promised pickup time — the "customer is running late" path.
    /// </summary>
    /// <remarks>
    /// A column-level write. It deliberately does NOT go through the items-edit endpoint,
    /// which replaces the lines wholesale and would therefore wipe the kitchen's per-dish
    /// ticks and notes just to move a time. The new time is judged by the same trading rule
    /// as checkout, so a time the kitchen cannot serve is refused rather than stored.
    /// </remarks>
    /// <param name="id">Order ID.</param>
    /// <param name="request">The new pickup time.</param>
    /// <response code="200">The time as stored.</response>
    /// <response code="400">The request is invalid.</response>
    /// <response code="404">Order not found.</response>
    /// <response code="409">The new pickup time is outside trading hours.</response>
    [HttpPut("{id}/pickup-time")]
    [ProducesResponseType(typeof(PickupTimeResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(object), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PickupTimeResponseDto>> SetPickupTime(
        int id,
        [FromBody] SetPickupTimeDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.SetOrderPickupTimeAsync(id, request, Actor, cancellationToken);
            if (result is null)
            {
                return NotFound(new { error = $"Order with ID {id} not found" });
            }

            _logger.LogInformation(
                "Order {OrderId} pickup time moved to {RequestedTime:o} by admin", id, result.RequestedTime);

            return Ok(result);
        }
        catch (ShopClosedException ex)
        {
            // The same 409 checkout gives, for the same reason: a pickup time the kitchen
            // cannot serve is a business refusal, not a fault.
            return Conflict(new { error = "kitchen_closed", message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error moving the pickup time for order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while moving the pickup time" });
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

            // Record it. Until now nothing about an order's history was kept anywhere, so
            // "who moved this to Ready at 7pm" had no answer at all.
            await _orderService.LogActivityAsync(
                id,
                "StatusChanged",
                status == OrderStatus.Cancelled
                    ? $"Order cancelled by {Actor ?? "the system"}: \u201c{request.Reason}\u201d"
                    : $"Order moved to {status} by {Actor ?? "the system"}.",
                Actor,
                status.ToString(),
                CancellationToken.None);

            // Tell the other tablets. Until now nothing called this, so a status set on
            // one screen reached the others only when their 30-second poll came round —
            // which on a busy pass is long enough for two staff to act on the same
            // ticket, one of them on a status the other has already moved.
            await BroadcastStatusAsync(id, status.ToString(), request.Reason, "admin");

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

    /// <summary>
    /// The kitchen's board — live tickets with their dishes, cook state and holds.
    /// </summary>
    /// <remarks>
    /// The back-of-house view. Distinct from <c>GET /api/admin/orders</c>, which is the
    /// order LIST (search, history, one row per order): this one is built for a screen
    /// somebody stands in front of, so it carries the cook state of every dish, the hold,
    /// the age, and the day's counts in the same response.
    /// </remarks>
    /// <param name="includeFinished">
    /// Include collected and cancelled orders. Off for the live board — a handed-over ticket
    /// leaves it — and on for history.
    /// </param>
    /// <response code="200">The board, with its tickets and counts.</response>
    [HttpGet("kitchen")]
    [ProducesResponseType(typeof(KitchenBoardDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<KitchenBoardDto>> GetKitchenBoard(
        [FromQuery] bool includeFinished = false,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return Ok(await _orderService.GetKitchenBoardAsync(includeFinished, cancellationToken));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error building the kitchen board");
            return StatusCode(500, new { error = "An error occurred while building the kitchen board" });
        }
    }

    /// <summary>
    /// Moves one dish to a cook state: Queued, Cooking or Done.
    /// </summary>
    /// <remarks>
    /// Ticking the LAST dish to Done finishes the order and emails the customer, decided in
    /// <c>OrderService.SetItemCookStateAsync</c> rather than here, so the rule cannot be
    /// bypassed by a second caller.
    ///
    /// PUT with the state in the body, because the caller states where the dish should end
    /// up rather than asking for a change: a doubled tap on a tablet settles on the state
    /// the cook meant instead of flipping twice.
    /// </remarks>
    /// <param name="id">Order ID.</param>
    /// <param name="itemId">The order item's own ID.</param>
    /// <param name="request">The state to set.</param>
    /// <response code="200">The dish's new state and what it did to the order.</response>
    /// <response code="400">An unknown state, a line from another order, or a closed order.</response>
    /// <response code="404">Order not found.</response>
    [HttpPut("{id}/items/{itemId}/cook-state")]
    [ProducesResponseType(typeof(CookStateResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CookStateResponseDto>> SetItemCookState(
        int id,
        int itemId,
        [FromBody] SetCookStateDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.SetItemCookStateAsync(id, itemId, request.State, Actor, cancellationToken);
            if (result is null) return NotFound(new { error = $"Order with ID {id} not found" });

            // Tell the other screens. Swallowed on failure: the write already happened, and
            // refusing a cook's move because a socket was closed is the worse error.
            await BroadcastStatusAsync(result.OrderId, result.OrderStatus,
                result.OrderMarkedReady ? "All dishes done" : null, "cook-state");

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting cook state on item {ItemId} of order {OrderId}", itemId, id);
            return StatusCode(500, new { error = "An error occurred while updating the dish" });
        }
    }

    /// <summary>
    /// Writes or clears the kitchen's own note on a dish.
    /// </summary>
    /// <remarks>
    /// Separate from the customer's instructions, which arrive at checkout and cannot be
    /// edited here. This is what the cook needs the front to know — a substitution, an
    /// apology, "made extra hot as asked".
    /// </remarks>
    /// <response code="200">The note as stored.</response>
    /// <response code="400">The line is not on this order.</response>
    /// <response code="404">Order not found.</response>
    [HttpPut("{id}/items/{itemId}/kitchen-note")]
    [ProducesResponseType(typeof(KitchenNoteResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<KitchenNoteResponseDto>> SetItemKitchenNote(
        int id,
        int itemId,
        [FromBody] KitchenNoteDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.SetItemKitchenNoteAsync(id, itemId, request.Note, Actor, cancellationToken);
            if (result is null) return NotFound(new { error = $"Order with ID {id} not found" });
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting the kitchen note on item {ItemId} of order {OrderId}", itemId, id);
            return StatusCode(500, new { error = "An error occurred while saving the note" });
        }
    }

    /// <summary>
    /// Holds a ticket off the line, or puts it back.
    /// </summary>
    /// <remarks>
    /// The alternative to cancelling, which is what it was before this existed. A held order
    /// keeps its stage and its dishes and simply stops being the next thing the kitchen looks
    /// at. The reason is required to hold, so the next person does not have to ask around.
    /// </remarks>
    /// <response code="200">The hold state as stored.</response>
    /// <response code="400">No reason given, or the order is already closed.</response>
    /// <response code="404">Order not found.</response>
    [HttpPut("{id}/hold")]
    [ProducesResponseType(typeof(HoldResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<HoldResponseDto>> SetOrderHeld(
        int id,
        [FromBody] HoldOrderDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.SetOrderHeldAsync(id, request.Held, request.Reason, Actor, cancellationToken);
            if (result is null) return NotFound(new { error = $"Order with ID {id} not found" });

            // A hold takes a ticket off every board, so the other screens need to hear about
            // it immediately — a held order still showing as next-in-line is the exact
            // confusion the hold exists to prevent.
            await _orderNotifier.BroadcastDashboardUpdateAsync(new { orderId = id, held = result.IsHeld });

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting the hold on order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while holding the order" });
        }
    }

    /// <summary>
    /// Everything that has happened to an order, newest first.
    /// </summary>
    /// <remarks>
    /// The answer to "what happened to order 42?" — asked an hour later, when something has
    /// gone wrong. Every other table holds current state, which is enough to run a service
    /// and useless for that question.
    /// </remarks>
    /// <response code="200">The activity log.</response>
    [HttpGet("{id}/activity")]
    [ProducesResponseType(typeof(List<OrderActivityDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<OrderActivityDto>>> GetOrderActivity(int id, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _orderService.GetOrderActivityAsync(id, cancellationToken));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading the activity for order {OrderId}", id);
            return StatusCode(500, new { error = "An error occurred while reading the order's history" });
        }
    }

    /// <summary>
    /// Marks one dish on an order as done, or takes the mark back.
    /// </summary>
    /// <remarks>
    /// The kitchen's per-dish control. Ticking the LAST outstanding dish finishes the
    /// order (it moves to Ready) and emails the customer — both once, both decided in
    /// <c>OrderService.SetItemCompletedAsync</c> rather than here, so the rule cannot be
    /// bypassed by a second caller.
    ///
    /// PUT rather than POST, because the caller states the state the line should be in
    /// rather than asking for a change: sending the same body twice leaves the same
    /// result, which matters on a tablet whose taps are sometimes doubled.
    /// </remarks>
    /// <param name="id">Order ID.</param>
    /// <param name="itemId">The order item's own ID — what the board's tick sends.</param>
    /// <param name="request">The state to set.</param>
    /// <response code="200">The line's new state, and what it did to the order.</response>
    /// <response code="400">The line is not on this order, or the order is closed.</response>
    /// <response code="404">Order not found.</response>
    [HttpPut("{id}/items/{itemId}/completed")]
    [ProducesResponseType(typeof(OrderItemCompletionResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderItemCompletionResponseDto>> SetItemCompleted(
        int id,
        int itemId,
        [FromBody] SetOrderItemCompletedDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _orderService.SetItemCompletedAsync(id, itemId, request.IsCompleted, cancellationToken);
            if (result is null)
            {
                return NotFound(new { error = $"Order with ID {id} not found" });
            }

            // The other tablets hear about the tick, and hear about the order moving when
            // it moves. Broadcast AFTER the write and never as part of it: a push that
            // fails must not undo a tick the cook has already been shown.
            await BroadcastItemCompletedAsync(result);

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            // A refused tick is a business answer, not a fault: the line is on another
            // order, or this ticket is cancelled and is not being cooked. The message
            // names the reason so the console can say it.
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error marking item {ItemId} on order {OrderId}", itemId, id);
            return StatusCode(500, new { error = "An error occurred while updating the item" });
        }
    }

    /// <summary>
    /// Pushes a status change, without letting a push failure fail the request.
    /// </summary>
    /// <remarks>
    /// The dashboard polls every thirty seconds as well, so a missed push delays the
    /// other screens rather than losing the change. The alternative — failing the write
    /// because a socket was closed — would refuse a status change that has already been
    /// saved, which is the worse of the two by a distance.
    /// </remarks>
    private async Task BroadcastStatusAsync(int orderId, string status, string? reason, string source)
    {
        try
        {
            await _orderNotifier.BroadcastStatusUpdateAsync(orderId, status, reason);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast status {Status} for order {OrderId} ({Source})", status, orderId, source);
        }
    }

    /// <summary>
    /// Pushes a tick, and the order's move if the tick finished it.
    /// </summary>
    private async Task BroadcastItemCompletedAsync(OrderItemCompletionResponseDto result)
    {
        await BroadcastStatusAsync(
            result.OrderId,
            result.OrderStatus,
            result.OrderMarkedReady ? "All dishes done" : null,
            "item-completion");
    }
}
