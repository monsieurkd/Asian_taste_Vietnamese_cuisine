using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Email;
using AsianTaste.API.Services.Payment.Interfaces;

using AsianTaste.API.WebSockets;

using System.Globalization;

namespace AsianTaste.API.Services;

/// <summary>
/// Service for handling order-related business logic.
/// </summary>
public class OrderService
{
    private readonly IOrderRepository _orderRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly IEmailService _emailService;
    private readonly IOrderEmailQueue _emailQueue;
    private readonly IRestaurantSettingsRepository _settingsRepository;
    private readonly IPaymentGatewayService _paymentGateway;
    private readonly IOrderNotifier _orderNotifier;
    private readonly TradingHours _tradingHours;
    private readonly IMenuRepository _menuRepository;
    private readonly ILogger<OrderService> _logger;

    public OrderService(
        IOrderRepository orderRepository,
        ICustomerRepository customerRepository,
        IEmailService emailService,
        IOrderEmailQueue emailQueue,
        IRestaurantSettingsRepository settingsRepository,
        IPaymentGatewayService paymentGateway,
        IOrderNotifier orderNotifier,
        TradingHours tradingHours,
        IMenuRepository menuRepository,
        ILogger<OrderService> logger)
    {
        _orderRepository = orderRepository;
        _customerRepository = customerRepository;
        _emailService = emailService;
        _emailQueue = emailQueue;
        _settingsRepository = settingsRepository;
        _paymentGateway = paymentGateway;
        _orderNotifier = orderNotifier;
        _tradingHours = tradingHours;
        _menuRepository = menuRepository;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new order from the checkout request.
    /// </summary>
    public async Task<CheckoutOrderResponseDto> CreateOrderAsync(CreateCheckoutOrderDto request, CancellationToken cancellationToken = default)
    {
        // Load restaurant settings once (Adelaide timezone, pickup estimate, contact details).
        var settings = await LoadRestaurantSettingsAsync(cancellationToken);
        var pickupMinutes = settings.PickupMinutes;

        // Refuse an order the kitchen cannot cook, BEFORE anything is written or charged.
        //
        // This is the only real control on trading hours: the storefront shows "Closed"
        // as a courtesy, but the API is public, so a script, a stale tab or a bookmark
        // could otherwise place and pay for an order at 2am. The cost of that is a
        // refund, a phone call and a customer who now distrusts the site.
        //
        // Ordering matters. This runs before the order row, before the charge and before
        // the confirmation email, so a refusal leaves nothing behind to clean up.
        //
        // A scheduled order is judged against its OWN time, not now: ordering at 4pm for
        // a 7pm pickup is fine even though the shop is shut at 7pm.
        var trading = EvaluateTrading(settings, request);
        if (!trading.Open)
        {
            _logger.LogInformation(
                "Refused order for {Email}: {Reason}", request.CustomerEmail, trading.Reason);

            throw new ShopClosedException(trading.Reason);
        }

        // Generate order number (uses the restaurant's local time, not UTC)
        string orderNumber = await GenerateOrderNumberAsync(cancellationToken);

        _logger.LogInformation("Creating order {OrderNumber} for customer {Email}", orderNumber, request.CustomerEmail);

        // Find or create guest customer
        var customer = await _customerRepository.FindOrCreateGuestAsync(
            request.CustomerName,
            request.CustomerEmail,
            request.CustomerPhone,
            cancellationToken);

        // Create order
        var order = await _orderRepository.CreateOrderAsync(request, orderNumber, cancellationToken);

        // Tell any connected admin dashboards that a new order has arrived.
        //
        // This is what makes the kitchen tablet work without anyone refreshing:
        // BroadcastNewOrderAsync existed and was documented but nothing ever
        // called it, so an order placed by a customer only appeared once someone
        // reloaded the page. Orders are accepted visually as "sent", which made
        // that easy to miss.
        //
        // A failure here must not fail the order — the customer has already
        // committed, and the dashboard polls the list anyway, so a missed push
        // delays the kitchen rather than losing the order.
        try
        {
            await _orderNotifier.BroadcastNewOrderAsync(new
            {
                orderId = order.Id,
                orderNumber = order.OrderNumber,
                customerName = order.CustomerName,
                orderType = order.OrderType.ToString(),
                total = order.Total,
                paymentMethod = order.PaymentMethod?.ToString(),
                estimatedReadyTime = order.RequestedTime.AddMinutes(pickupMinutes),
                createdAt = order.CreatedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast new order {OrderNumber} to admin dashboards", orderNumber);
        }

        // Handle account creation if requested
        bool accountCreated = false;
        if (request.CreateAccount && !string.IsNullOrEmpty(request.Password))
        {
            // This would be handled via separate endpoint to keep the order flow fast
            _logger.LogInformation("Account creation requested for order {OrderNumber}", orderNumber);
            // Account will be created via /api/customers/create-from-order endpoint
        }

        // Queue the order confirmation email for background delivery.
        // Enqueuing (rather than fire-and-forget Task.Run) means the email is not
        // tied to this request's CancellationToken and survives the response.
        try
        {
            var items = await _orderRepository.GetOrderItemsAsync(order.Id, cancellationToken);

            var emailModel = new OrderConfirmationEmailModel
            {
                OrderNumber = order.OrderNumber,
                CustomerName = order.CustomerName,
                OrderDate = order.CreatedAt,
                EstimatedReadyTime = order.RequestedTime.AddMinutes(pickupMinutes),
                OrderType = order.OrderType.ToString(),
                PaymentMethod = order.PaymentMethod?.ToString() ?? string.Empty,
                Subtotal = order.Subtotal,
                Total = order.Total,
                Items = items.Select(i => new OrderItemEmailModel
                {
                    Name = i.MenuItemName,
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    TotalPrice = i.TotalPrice,
                    SpecialInstructions = i.SpecialInstructions,
                    Modifiers = i.Modifiers?.Any() == true
                        ? string.Join(", ", i.Modifiers.Select(m => m.ModifierName ?? ""))
                        : null
                }).ToList(),
                SpecialInstructions = order.Notes,
                RestaurantName = settings.RestaurantName,
                RestaurantPhone = settings.Phone,
                RestaurantAddress = settings.Address,
            };

            await _emailQueue.EnqueueAsync(
                new OrderConfirmationEmailJob(
                    order.Id,
                    order.CustomerEmail,
                    order.CustomerName,
                    emailModel),
                cancellationToken);
        }
        catch (Exception ex)
        {
            // A failure to queue the email must not fail the order.
            _logger.LogError(ex, "Failed to queue order confirmation email for {OrderNumber}", orderNumber);
        }

        // Payment. This is what makes "Paid online" true rather than an assertion.
        //
        // The order row is created first (above) because the charge needs an order
        // reference for its metadata and idempotency key. The charge is then
        // attempted BEFORE the customer is told the order succeeded, and a failed
        // charge marks the order as failed rather than leaving it looking paid.
        //
        // The frontend creates the Stripe PaymentIntent and confirms it in the
        // browser (3-D Secure needs the browser), then passes the intent id as
        // PaymentToken for the server to verify against Stripe. Verifying rather
        // than trusting is the point: without it, a caller could claim payment.
        var paymentOutcome = await ProcessPaymentAsync(order, request, cancellationToken);

        var response = new CheckoutOrderResponseDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            EstimatedReadyTime = order.RequestedTime.AddMinutes(pickupMinutes),
            Total = order.Total,
            // Derived from what actually happened, not from what was requested. The
            // earlier version printed "Paid online" for every card order whether or
            // not a payment had been taken.
            PaymentDisplay = paymentOutcome switch
            {
                PaymentOutcome.Paid => "Paid online",
                PaymentOutcome.Failed => "Payment failed — please try again",
                _ => "Pay on pickup",
            },
            Items = new List<OrderItemDto>(),
            AccountCreated = accountCreated
        };

        _logger.LogInformation("Order {OrderNumber} created successfully. Response: OrderId={OrderId}, OrderNumber={OrderNumber}",
            orderNumber, response.OrderId, response.OrderNumber);

        return response;
    }

    /// <summary>
    /// Gets detailed order information by order number.
    /// </summary>
    public async Task<OrderDetailResponseDto?> GetOrderByNumberAsync(string orderNumber, CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByNumberAsync(orderNumber, cancellationToken);
        if (order == null) return null;

        // The estimate comes from the restaurant's own setting, exactly as it does at
        // checkout. It used to be a literal 20 here and a setting there, so the
        // confirmation screen and the tracking screen could promise different times
        // for the same order — and changing the setting moved only one of them.
        var settings = await LoadRestaurantSettingsAsync(cancellationToken);
        var items = await _orderRepository.GetOrderItemsAsync(order.Id, cancellationToken);

        return new OrderDetailResponseDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            CreatedAt = order.CreatedAt,
            EstimatedReadyTime = order.RequestedTime.AddMinutes(settings.PickupMinutes),
            CustomerName = order.CustomerName,
            CustomerPhone = order.CustomerPhone,
            CustomerEmail = order.CustomerEmail,
            OrderType = order.OrderType,
            PaymentMethod = order.PaymentMethod,
            PaymentStatus = order.PaymentStatus,
            PaidAmount = order.PaidAmount,
            PaidAt = order.PaidAt,
            Subtotal = order.Subtotal,
            Total = order.Total,
            SpecialInstructions = order.Notes,
            Items = items.Select(i => new OrderItemDto
            {
                Id = i.Id,
                MenuItemId = i.MenuItemId,
                MenuItemName = i.MenuItemName,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                TotalPrice = i.TotalPrice,
                SpecialInstructions = i.SpecialInstructions,
                // The modifiers are already loaded by GetOrderItemsAsync above. This
                // used to emit an empty list regardless, so a customer confirming an
                // order saw none of the choices they had made — no spice level, no
                // allergy, no paid extra — while the kitchen's copy of the same order
                // did show them.
                Modifiers = i.Modifiers.Select(m => new OrderItemModifierDto
                {
                    Id = m.Id,
                    ModifierName = m.ModifierName,
                    PriceAdjustment = m.PriceAdjustment
                }).ToList()
            }).ToList()
        };
    }

    /// <summary>
    /// Replaces an order's contents, re-pricing it from the current menu.
    /// </summary>
    /// <remarks>
    /// This is the phone-change path: staff take a call, the customer wants one dish
    /// swapped, and nobody wants to cancel-and-rebuild (which would refund, re-charge
    /// and give the kitchen a second ticket for the same food).
    ///
    /// Two rules do the work here rather than in the repository:
    ///
    ///  1. **Prices come from the menu, not the request.** The caller says which dish
    ///     and how many; the money is computed here from `menu_items`. A request that
    ///     could name its own prices could set any total.
    ///  2. **The new pickup time is judged by the same trading rule as checkout.** An
    ///     edit that moves an order to 3am is the same mistake as placing one at 3am,
    ///     and it would otherwise be the way around the closed-kitchen guard.
    ///
    /// It does NOT touch what was paid. The order's `paid_amount` records money that
    /// actually moved; an edit changes what is owed. Reconciling the difference is a
    /// refund or a counter payment, and both are explicit acts.
    /// </remarks>
    /// <returns>The recomputed figures, or null when the order does not exist.</returns>
    /// <exception cref="ShopClosedException">The new pickup time is outside trading hours.</exception>
    /// <exception cref="InvalidOperationException">A dish in the request is not on the menu.</exception>
    public async Task<UpdateOrderItemsResponseDto?> UpdateOrderItemsAsync(
        int orderId,
        UpdateOrderItemsDto request,
        CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        var settings = await LoadRestaurantSettingsAsync(cancellationToken);

        // A new pickup time is judged exactly as a new order's would be. Null means the
        // time is unchanged, so the existing one is left alone rather than re-validated
        // — an order already in progress must not be invalidated by a rule that changed
        // after it was placed.
        if (request.PickupTime is not null)
        {
            var trading = _tradingHours.Evaluate(
                settings.Windows,
                settings.Timezone,
                PickupTime.ResolveRequestedTime(request.PickupTime));

            if (!trading.Open)
            {
                throw new ShopClosedException(trading.Open ? "" : trading.Reason);
            }
        }

        // Price every line from the CURRENT menu.
        var menuIds = request.Items.Select(i => i.MenuItemId).Distinct().ToList();
        var prices = await _menuRepository.GetPricesForItemsAsync(menuIds, cancellationToken);

        var missing = menuIds.Where(id => !prices.ContainsKey(id)).ToList();
        if (missing.Count > 0)
        {
            // Refused rather than skipped: silently dropping a dish the customer asked
            // for would send out food that does not match the ticket.
            throw new InvalidOperationException(
                $"Not on the menu any more: {string.Join(", ", missing)}. Remove it from the order and try again.");
        }

        var lines = new List<OrderLineWrite>();
        foreach (var item in request.Items)
        {
            // Duplicate lines for the same dish with different options are legitimate,
            // and so is the same dish twice; they are carried through positionally
            // rather than merged, because merging would lose one set of instructions.
            var dish = prices[item.MenuItemId];

            lines.Add(new OrderLineWrite
            {
                MenuItemId = item.MenuItemId,
                MenuItemName = dish.Name,
                Quantity = item.Quantity,
                UnitPrice = dish.Price,
                SpecialInstructions = item.SpecialInstructions,
                ModifierIds = item.ModifierIds,
            });
        }

        var written = await _orderRepository.ReplaceOrderItemsAsync(orderId, lines, cancellationToken);
        if (written is null) return null;

        // Move the pickup time as part of the same change, if one was given.
        if (request.PickupTime is not null)
        {
            order.RequestedTime = PickupTime.ResolveRequestedTime(request.PickupTime);
            order.Notes = request.Reason ?? order.Notes;
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);
        }

        var (subtotal, total) = written.Value;
        var paid = order.PaidAmount ?? 0m;

        var response = new UpdateOrderItemsResponseDto
        {
            OrderId = orderId,
            OrderNumber = order.OrderNumber,
            Subtotal = subtotal,
            Total = total,
            // Anything not settled online owes money at the counter, and so does a
            // settled order whose total has since gone up. The declined-card case is
            // the one that matters: the kitchen will still cook it (that is the shop's
            // choice), so the counter has to be told to collect — otherwise the food
            // goes out unpaid because the screen implied it was handled.
            AmountDueAtCounter = order.PaymentStatus != Models.Enums.PaymentStatus.Succeeded || total > paid,
            PaymentNote = BuildPaymentNote(order, paid, total),
        };

        _logger.LogInformation(
            "Order {OrderNumber} edited: {LineCount} line(s), new total {Total} (was {Previous})",
            order.OrderNumber, lines.Count, total, order.Total);

        return response;
    }

    /// <summary>
    /// Says what an edit did to the money, in the operator's terms.
    /// </summary>
    /// <remarks>
    /// The case worth spelling out is a paid order whose total went UP: the customer
    /// now owes the difference and nothing here will collect it. Saying so turns a
    /// silent shortfall into a line the operator reads out on the phone.
    /// </remarks>
    private static string BuildPaymentNote(Order order, decimal paid, decimal total)
    {
        if (order.PaymentStatus != Models.Enums.PaymentStatus.Succeeded)
        {
            return total > 0
                ? "This order was never paid online — collect the new total at the counter."
                : string.Empty;
        }

        if (total > paid)
        {
            var due = total - paid;
            return $"The card was charged {paid:0.00}. Collect the remaining {due:0.00} at the counter.";
        }

        if (total < paid)
        {
            var back = paid - total;
            return $"The card was charged {paid:0.00}, which is {back:0.00} more than the order now costs. "
                 + "Refund the difference from this ticket.";
        }

        return "The total is unchanged.";
    }

    /// <summary>
    /// Updates the status of an order.
    /// </summary>
    public async Task<bool> UpdateOrderStatusAsync(int orderId, OrderStatus status, CancellationToken cancellationToken = default)
    {
        try
        {
            await _orderRepository.UpdateOrderStatusAsync(orderId, status, cancellationToken);
            _logger.LogInformation("Order {OrderId} status updated to {Status}", orderId, status);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update order {OrderId} status", orderId);
            return false;
        }
    }

    /// <summary>
    /// Ticks or unticks one dish on an order, and finishes the order when it was the last one.
    /// </summary>
    /// <remarks>
    /// This is the kitchen's actual unit of work. A ticket with four dishes is four
    /// things to cook, and until this existed the only progress the system could express
    /// was "the whole order has moved stage", which is not a question a cook ever asks.
    ///
    /// Three rules, none of which belong in the repository (which knows only rows) or in
    /// the controller (which knows only HTTP):
    ///
    ///  1. **The last line finishes the order.** A ticket whose every dish is ticked is
    ///     ready — that is what the ticks mean, and making staff press a second control
    ///     for the same fact is how the board goes stale. Only orders that are actually
    ///     being cooked are advanced: a cancelled order must not come back to life, and
    ///     an order someone already marked Ready is left exactly as it is.
    ///  2. **The customer is told ONCE.** The trigger is a condition that can be reached
    ///     twice (untick then re-tick, or two tablets racing on the last two lines), so
    ///     the send is claimed against `ready_notified_at` rather than decided here. The
    ///     claim is the guarantee; this method only asks for it.
    ///  3. **A tick never moves an order BACKWARDS.** Unticking a dish on an order that
    ///     has already gone Ready leaves it Ready. The food is on the counter, the
    ///     customer has been emailed, and a mistap on a tablet must not un-announce it.
    /// </remarks>
    /// <returns>
    /// What the tick did, or null when the order or the line does not exist. The caller
    /// needs every part: the item, the counts (the board shows "2 of 4"), whether the
    /// order moved, and whether a message was sent.
    /// </returns>
    /// <exception cref="InvalidOperationException">
    /// The line does not belong to this order, or the order is closed (cancelled or
    /// already collected) so there is nothing to tick.
    /// </exception>
    public async Task<OrderItemCompletionResponseDto?> SetItemCompletedAsync(
        int orderId,
        int orderItemId,
        bool isCompleted,
        CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        // A closed order is not being cooked, so there is no line left to tick. Saying so
        // is better than accepting the tick and rendering it: a ticked line on a
        // cancelled ticket reads as "this was made", which is the opposite of what
        // happened and is exactly the note someone would later cook from.
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Completed)
        {
            throw new InvalidOperationException(
                $"Order {order.OrderNumber} is {order.Status} — its items are no longer being cooked.");
        }

        var result = await _orderRepository.SetOrderItemCompletedAsync(orderId, orderItemId, isCompleted, cancellationToken);
        if (result is null)
        {
            // The repository's update is scoped by order, so this covers both "no such
            // line" and "that line belongs to a different order".
            throw new InvalidOperationException($"Item {orderItemId} is not on order {order.OrderNumber}.");
        }

        var orderMarkedReady = false;
        var customerNotified = false;

        // Rule 1: every dish is done. Only a LIVE order moves — `Ready` is left alone
        // (it is already there) and anything closed was rejected above.
        if (result.AllDone && order.Status is OrderStatus.Pending or OrderStatus.Confirmed or OrderStatus.Preparing)
        {
            await _orderRepository.UpdateOrderStatusAsync(orderId, OrderStatus.Ready, cancellationToken);
            orderMarkedReady = true;

            // The claim on `ready_notified_at` happens inside NotifyCustomerOrderReadyAsync
            // and nowhere else. Claiming it here as well would mark the order announced and
            // then let the send be skipped as "already announced" — an order that is ready
            // and a customer who is never told.
            customerNotified = await NotifyCustomerOrderReadyAsync(order, cancellationToken);
        }

        _logger.LogInformation(
            "Order {OrderNumber} item {ItemId} marked {State}: {Done}/{Total} done",
            order.OrderNumber, orderItemId, isCompleted ? "done" : "not done",
            result.DoneLines, result.TotalLines);

        return new OrderItemCompletionResponseDto
        {
            OrderId = orderId,
            OrderItemId = orderItemId,
            IsCompleted = isCompleted,
            DoneLines = result.DoneLines,
            TotalLines = result.TotalLines,
            OrderStatus = orderMarkedReady ? nameof(OrderStatus.Ready) : order.Status.ToString(),
            OrderMarkedReady = orderMarkedReady,
            CustomerNotified = customerNotified,
        };
    }

    // ══ Back-of-house (§18) ══════════════════════════════════════════════════════

    /// <summary>
    /// The kitchen's board, with the day's counts.
    /// </summary>
    /// <remarks>
    /// One response rather than two, because the board and its numbers are read together
    /// and two requests means two chances to disagree about how many orders are live.
    ///
    /// Overdue is judged against the restaurant's own `pickup_minutes` setting rather than
    /// a number in this method: the shop already decides how long it promises, and a second
    /// hard-coded threshold would be a promise the kitchen does not keep.
    /// </remarks>
    public async Task<KitchenBoardDto> GetKitchenBoardAsync(bool includeFinished, CancellationToken cancellationToken = default)
    {
        var tickets = await _orderRepository.GetKitchenBoardAsync(includeFinished, cancellationToken);
        var settings = await LoadRestaurantSettingsAsync(cancellationToken);

        // An order is late when it was wanted `pickupMinutes` ago. A scheduled order is
        // judged against its OWN time, which is what requested_time holds for both kinds.
        var now = DateTime.UtcNow;
        var overdueAfter = TimeSpan.FromMinutes(settings.PickupMinutes);

        var live = tickets.Where(t => !string.Equals(t.Status, "Cancelled", StringComparison.OrdinalIgnoreCase)).ToList();

        return new KitchenBoardDto
        {
            Tickets = tickets,
            Summary = new KitchenBoardSummaryDto
            {
                LiveOrders = live.Count(t => !t.IsHeld),
                AwaitingAcceptance = live.Count(t => string.Equals(t.Status, "Pending", StringComparison.OrdinalIgnoreCase)),
                DishesToCook = live.Where(t => !t.IsHeld).Sum(t => t.RemainingLines),
                DishesCooking = live.Where(t => !t.IsHeld).Sum(t => t.CookingLines),
                OverdueOrders = live.Count(t => !t.IsHeld && !t.IsScheduled && (now - DateTime.SpecifyKind(t.RequestedTime, DateTimeKind.Utc)) > overdueAfter),
                HeldOrders = live.Count(t => t.IsHeld),
                CollectedToday = live.Count(t => string.Equals(t.Status, "Completed", StringComparison.OrdinalIgnoreCase)),
            },
        };
    }

    /// <summary>
    /// Moves one dish to a cook state, and finishes the order when the last one is plated.
    /// </summary>
    /// <remarks>
    /// The same three rules as <see cref="SetItemCompletedAsync"/>, restated for three
    /// states rather than two, and in the same one place so no caller can bypass them:
    ///
    ///  1. **The last dish at Done finishes the order.** A dish moving to Done is the only
    ///     transition that can complete a ticket; moving to Cooking never does, because a
    ///     ticket with everything on the wok is not ready.
    ///  2. **The customer is told at most once**, claimed against `ready_notified_at`.
    ///  3. **A dish never moves an order backwards.** Putting a plated dish back to Queued
    ///     is a correction, and the order stays Ready — the food is on the counter and the
    ///     customer has been emailed.
    ///
    /// Every move is written to the activity log with its author, from here rather than
    /// from the repository, so the sentence a person reads ("Mai marked Pho Bo as cooking")
    /// is composed where the dish's name is known.
    /// </remarks>
    public async Task<CookStateResponseDto?> SetItemCookStateAsync(
        int orderId,
        int orderItemId,
        string state,
        string? actor,
        CancellationToken cancellationToken = default)
    {
        var parsed = ParseCookState(state);
        if (parsed is null)
        {
            throw new InvalidOperationException($"Unknown cook state '{state}'. Use Queued, Cooking or Done.");
        }

        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Completed)
        {
            throw new InvalidOperationException(
                $"Order {order.OrderNumber} is {order.Status} — its dishes are no longer being cooked.");
        }

        var result = await _orderRepository.SetItemCookStateAsync(orderId, orderItemId, parsed.Value.ToString(), actor, cancellationToken);
        if (result is null)
        {
            throw new InvalidOperationException($"Item {orderItemId} is not on order {order.OrderNumber}.");
        }

        var dishName = await GetDishNameAsync(orderId, orderItemId, cancellationToken);

        // Write to the log BEFORE deciding anything else, so a move that turns out to change
        // nothing is still recorded — "who put this back on the queue" is a question that
        // only ever gets asked about a change somebody regrets.
        await SafeLogAsync(
            orderId, orderItemId, "ItemCookState",
            $"{Describe(actor)} marked {dishName} as {parsed.Value.ToString().ToLowerInvariant()}.",
            actor, order.Status.ToString(), cancellationToken);

        var orderMarkedReady = false;
        var customerNotified = false;

        if (result.AllDone && order.Status is OrderStatus.Pending or OrderStatus.Confirmed or OrderStatus.Preparing)
        {
            await _orderRepository.UpdateOrderStatusAsync(orderId, OrderStatus.Ready, cancellationToken);
            orderMarkedReady = true;

            await SafeLogAsync(
                orderId, null, "StatusChanged",
                $"Every dish is done — order moved to ready by {Describe(actor)}.",
                actor, nameof(OrderStatus.Ready), cancellationToken);

            customerNotified = await NotifyCustomerOrderReadyAsync(order, cancellationToken);

            if (customerNotified)
            {
                await SafeLogAsync(
                    orderId, null, "ReadyNotified",
                    $"Customer told {order.OrderNumber} is ready to collect.",
                    null, nameof(OrderStatus.Ready), cancellationToken);
            }
        }

        _logger.LogInformation(
            "Order {OrderNumber} item {ItemId} -> {State} by {Actor}: {Done}/{Total} done, {Cooking} cooking",
            order.OrderNumber, orderItemId, parsed.Value, actor ?? "system",
            result.DoneLines, result.TotalLines, result.CookingLines);

        return new CookStateResponseDto
        {
            OrderId = orderId,
            OrderItemId = orderItemId,
            CookState = parsed.Value.ToString(),
            DoneLines = result.DoneLines,
            TotalLines = result.TotalLines,
            CookingLines = result.CookingLines,
            OrderStatus = orderMarkedReady ? nameof(OrderStatus.Ready) : order.Status.ToString(),
            OrderMarkedReady = orderMarkedReady,
            CustomerNotified = customerNotified,
        };
    }

    /// <summary>
    /// Writes or clears the kitchen's note on a dish.
    /// </summary>
    /// <remarks>
    /// A separate act from ticking the dish, because it is a different kind of fact: the
    /// tick says "done", the note says "and here is something the front needs to know".
    /// Logged with the note's own text, so the log is readable without the row it describes.
    /// </remarks>
    public async Task<KitchenNoteResponseDto?> SetItemKitchenNoteAsync(int orderId, int orderItemId, string? note, string? actor, CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        var cleared = string.IsNullOrWhiteSpace(note);
        var ok = await _orderRepository.SetItemKitchenNoteAsync(orderId, orderItemId, note, actor, cancellationToken);
        if (!ok)
        {
            throw new InvalidOperationException($"Item {orderItemId} is not on order {order.OrderNumber}.");
        }

        var dishName = await GetDishNameAsync(orderId, orderItemId, cancellationToken);

        await SafeLogAsync(
            orderId, orderItemId, "NoteAdded",
            cleared
                ? $"{Describe(actor)} cleared the kitchen note on {dishName}."
                : $"{Describe(actor)} noted on {dishName}: \u201c{note!.Trim()}\u201d",
            actor, order.Status.ToString(), cancellationToken);

        return new KitchenNoteResponseDto
        {
            OrderId = orderId,
            OrderItemId = orderItemId,
            KitchenNote = cleared ? null : note!.Trim(),
            NoteBy = cleared ? null : actor,
        };
    }

    /// <summary>
    /// Holds a ticket off the line, or puts it back.
    /// </summary>
    /// <remarks>
    /// The reason is required to hold and required to be thrown away to resume. A held
    /// ticket with no reason is one the next person has to ask about, which defeats the
    /// point of taking it off the line quietly instead of cancelling it.
    ///
    /// Holding deliberately does NOT change the order's status. The stage still describes
    /// how far the cooking got; the hold is a separate axis, and collapsing them would mean
    /// a resumed order had to guess which stage to go back to.
    /// </remarks>
    public async Task<HoldResponseDto?> SetOrderHeldAsync(int orderId, bool held, string? reason, string? actor, CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        if (held && string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("Give a reason for holding the order — the next person has to act on it.");
        }

        if (order.Status is OrderStatus.Cancelled or OrderStatus.Completed)
        {
            throw new InvalidOperationException($"Order {order.OrderNumber} is {order.Status} — there is nothing to hold.");
        }

        await _orderRepository.SetOrderHeldAsync(orderId, held, reason, actor, cancellationToken);

        await SafeLogAsync(
            orderId, null, held ? "Held" : "Resumed",
            held
                ? $"{Describe(actor)} took this order off the line: \u201c{reason!.Trim()}\u201d"
                : $"{Describe(actor)} put this order back on the line.",
            actor, order.Status.ToString(), cancellationToken);

        _logger.LogInformation(
            "Order {OrderNumber} {Action} by {Actor}{Reason}",
            order.OrderNumber, held ? "held" : "resumed", actor ?? "system",
            held ? $": {reason}" : string.Empty);

        return new HoldResponseDto
        {
            OrderId = orderId,
            IsHeld = held,
            HeldReason = held ? reason!.Trim() : null,
            HeldBy = held ? actor : null,
        };
    }

    /// <summary>
    /// Moves an order's promised pickup time, leaving everything else on the ticket alone.
    /// </summary>
    /// <remarks>
    /// The small sibling of <see cref="UpdateOrderItemsAsync"/>. That path answers "the
    /// customer changed their mind about WHAT they want" and rewrites the lines; this one
    /// answers "the customer is running late" and rewrites one timestamp. Keeping them
    /// apart is what stops a time change from deleting the kitchen's per-dish ticks — see
    /// the note on <c>ReplaceOrderItemsAsync</c>.
    ///
    /// The new time is judged by the same trading rule as checkout: a time the kitchen
    /// cannot serve is a business refusal, so it is a 409 rather than a saved order the
    /// kitchen would never cook.
    /// </remarks>
    /// <returns>The stored time, or null when the order does not exist.</returns>
    /// <exception cref="ShopClosedException">The new time is outside trading hours.</exception>
    public async Task<PickupTimeResponseDto?> SetOrderPickupTimeAsync(
        int orderId,
        SetPickupTimeDto request,
        string? actor,
        CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null) return null;

        var settings = await LoadRestaurantSettingsAsync(cancellationToken);
        var requestedTime = PickupTime.ResolveRequestedTime(request.PickupTime);

        var trading = _tradingHours.Evaluate(settings.Windows, settings.Timezone, requestedTime);
        if (!trading.Open)
        {
            throw new ShopClosedException(trading.Reason);
        }

        var moved = await _orderRepository.SetOrderRequestedTimeAsync(orderId, requestedTime, cancellationToken);
        if (!moved) return null;

        var isScheduled = PickupTime.IsScheduled(request.PickupTime);

        await SafeLogAsync(
            orderId, null, "PickupTimeChanged",
            $"{Describe(actor)} moved the pickup time to {DescribeLocal(settings.Timezone, requestedTime)}"
                + (string.IsNullOrWhiteSpace(request.Reason) ? "." : $": \u201c{request.Reason.Trim()}\u201d"),
            actor, order.Status.ToString(), cancellationToken);

        _logger.LogInformation(
            "Order {OrderNumber} pickup time moved to {RequestedTime:o} by {Actor}",
            order.OrderNumber, requestedTime, actor ?? "system");

        return new PickupTimeResponseDto
        {
            OrderId = orderId,
            OrderNumber = order.OrderNumber,
            RequestedTime = requestedTime,
            IsScheduled = isScheduled,
        };
    }

    /// <summary>Everything that has happened to an order, newest first.</summary>
    public Task<List<OrderActivityDto>> GetOrderActivityAsync(int orderId, CancellationToken cancellationToken = default) =>
        _orderRepository.GetActivityAsync(orderId, cancellationToken);

    /// <summary>
    /// Records an order-level event from another path (an edit, a refund).
    /// </summary>
    /// <remarks>
    /// Public so the controller can log an act that <see cref="OrderService"/> does not own,
    /// with the actor the request carries.
    /// </remarks>
    public Task LogActivityAsync(int orderId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken = default) =>
        SafeLogAsync(orderId, null, kind, detail, actor, statusAtEvent, cancellationToken);

    /// <summary>
    /// Writes to the activity log, and never lets a logging failure fail the action.
    /// </summary>
    /// <remarks>
    /// The kitchen's change has already happened by the time this runs, and refusing the
    /// tick because a log row could not be written would be the worst of both — the food is
    /// on the pass and the screen says it is not. A failure is logged loudly instead.
    /// </remarks>
    private async Task SafeLogAsync(int orderId, int? orderItemId, string kind, string detail, string? actor, string? statusAtEvent, CancellationToken cancellationToken)
    {
        try
        {
            await _orderRepository.AddActivityAsync(orderId, orderItemId, kind, detail, actor, statusAtEvent, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not write the activity log for order {OrderId} ({Kind})", orderId, kind);
        }
    }

    /// <summary>The dish's name, for a log line a person reads.</summary>
    private async Task<string> GetDishNameAsync(int orderId, int orderItemId, CancellationToken cancellationToken)
    {
        try
        {
            var items = await _orderRepository.GetOrderItemsAsync(orderId, cancellationToken);
            return items.FirstOrDefault(i => i.Id == orderItemId)?.MenuItemName ?? $"item {orderItemId}";
        }
        catch
        {
            // A log line is not worth failing a kitchen action over; the id still identifies
            // the dish well enough to follow up.
            return $"item {orderItemId}";
        }
    }

    /// <summary>Reads a cook state from the wire, case-insensitively.</summary>
    private static CookState? ParseCookState(string? state) =>
        Enum.TryParse<CookState>(state?.Trim(), ignoreCase: true, out var parsed) ? parsed : null;

    /// <summary>
    /// How to name the person who did something, in a sentence.
    /// </summary>
    /// <remarks>
    /// "System" rather than "someone" when there is no actor: the events with no actor are
    /// the ones the API did itself (a webhook, a timer), and saying so is more useful than
    /// a vague pronoun when the question being asked is "who moved my order".
    /// </remarks>
    private static string Describe(string? actor) => string.IsNullOrWhiteSpace(actor) ? "The system" : actor;

    /// <summary>
    /// A UTC instant as the shop's wall-clock time, for a log line.
    /// </summary>
    /// <remarks>
    /// The activity log is read by people standing in the shop, so a pickup time in UTC
    /// is worse than useless — 18:30 Adelaide prints as 08:00 the same day in winter. The
    /// stored value stays UTC; only the sentence is localised. An unreadable timezone
    /// falls back to a labelled UTC reading rather than throwing over a log line.
    /// </remarks>
    private static string DescribeLocal(string timezoneId, DateTime utc)
    {
        try
        {
            var instant = utc.Kind == DateTimeKind.Utc ? utc : DateTime.SpecifyKind(utc, DateTimeKind.Utc);
            var tz = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
            var local = TimeZoneInfo.ConvertTimeFromUtc(instant, tz);
            return local.ToString("h:mm tt", CultureInfo.InvariantCulture);
        }
        catch
        {
            return utc.ToString("HH:mm", CultureInfo.InvariantCulture) + " UTC";
        }
    }

    /// <summary>
    /// Tells the customer their food is ready, at most once.
    /// </summary>
    /// <remarks>
    /// The same care as the confirmation email, for the same reason: this runs on the
    /// request that happened to tick the last dish, so a failure must not fail the tick
    /// (the food IS ready — the cook is holding the plate) and the message must not be
    /// sent twice.
    ///
    /// Returns whether the claim succeeded, which is what the console shows the cook.
    /// A walk-in has no address to send to, so it returns false without pretending.
    /// </remarks>
    private async Task<bool> NotifyCustomerOrderReadyAsync(Order order, CancellationToken cancellationToken)
    {
        try
        {
            // Nothing to send to. Reported as "not told", because it is not.
            if (string.IsNullOrWhiteSpace(order.CustomerEmail))
            {
                _logger.LogInformation(
                    "Order {OrderNumber} is ready but has no customer email (counter order); nobody to tell.",
                    order.OrderNumber);
                return false;
            }

            var claimed = await _orderRepository.TryMarkReadyNotifiedAsync(orderId: order.Id, cancellationToken);
            if (!claimed)
            {
                // Someone else's tick got here first. Not an error: the customer is
                // already holding the message, and this is the guard doing its job.
                _logger.LogInformation(
                    "Order {OrderNumber} was already announced as ready; not sending a second message.",
                    order.OrderNumber);
                return false;
            }

            var settings = await LoadRestaurantSettingsAsync(cancellationToken);

            await _emailQueue.EnqueueStatusUpdateAsync(
                new OrderStatusUpdateEmailJob(
                    order.Id,
                    order.CustomerEmail,
                    order.CustomerName,
                    order.OrderNumber,
                    "Ready",
                    $"{order.CustomerName}, every dish on order {order.OrderNumber} is ready. "
                    + $"Collect it at {settings.Address}."),
                cancellationToken);

            return true;
        }
        catch (Exception ex)
        {
            // The order is ready whether or not this worked, so the tick stands. The
            // exception is logged loudly because a customer now has to be rung instead.
            _logger.LogError(ex, "Could not queue the ready notification for order {OrderNumber}", order.OrderNumber);
            return false;
        }
    }

    /// <summary>
    /// Gets order history for a customer.
    /// </summary>
    public async Task<List<OrderDetailResponseDto>> GetCustomerOrdersAsync(string email, CancellationToken cancellationToken = default)
    {
        var orders = await _orderRepository.GetOrdersByCustomerEmailAsync(email, cancellationToken);

        // Loaded once for the whole history rather than per order, and for the same
        // reason as above: the customer must not be shown one pickup estimate on the
        // confirmation and a different one on their order list.
        var settings = await LoadRestaurantSettingsAsync(cancellationToken);

        var result = new List<OrderDetailResponseDto>();

        foreach (var order in orders)
        {
            var items = await _orderRepository.GetOrderItemsAsync(order.Id, cancellationToken);

            result.Add(new OrderDetailResponseDto
            {
                OrderId = order.Id,
                OrderNumber = order.OrderNumber,
                Status = order.Status,
                CreatedAt = order.CreatedAt,
                EstimatedReadyTime = order.RequestedTime.AddMinutes(settings.PickupMinutes),
                CustomerName = order.CustomerName,
                CustomerPhone = order.CustomerPhone,
                CustomerEmail = order.CustomerEmail,
                OrderType = order.OrderType,
                PaymentMethod = order.PaymentMethod,
                PaymentStatus = order.PaymentStatus,
                PaidAmount = order.PaidAmount,
                PaidAt = order.PaidAt,
                Subtotal = order.Subtotal,
                Total = order.Total,
                SpecialInstructions = order.Notes,
                Items = items.Select(i => new OrderItemDto
                {
                    Id = i.Id,
                    MenuItemId = i.MenuItemId,
                    MenuItemName = i.MenuItemName,
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    TotalPrice = i.TotalPrice,
                    SpecialInstructions = i.SpecialInstructions,
                    Modifiers = i.Modifiers.Select(m => new OrderItemModifierDto
                    {
                        Id = m.Id,
                        ModifierName = m.ModifierName,
                        PriceAdjustment = m.PriceAdjustment
                    }).ToList()
                }).ToList()
            });
        }

        return result;
    }

    /// <summary>
    /// Whether this order may be placed, judged at the instant it is wanted.
    /// </summary>
    /// <remarks>
    /// Two rules that look like edge cases and are not:
    ///
    /// 1. **A scheduled order is judged at its own time.** Ordering at 4pm for a 7pm
    ///    pickup is legitimate even though 7pm is past closing; judging it against now
    ///    would refuse the shop's most useful orders. The reverse — ordering at 4pm for
    ///    a pickup inside opening hours — is judged there too.
    /// 2. **Windows we could not read mean refuse, not allow.** If `restaurant_settings`
    ///    or `operating_hours` cannot be read, there is no evidence the kitchen is open,
    ///    and the failure mode of guessing "open" is an order nobody cooks. The order
    ///    path already has a rule for this shape (see Payment__UseMockGateway): when a
    ///    fact cannot be established, take the safe branch and say why.
    /// </remarks>
    private TradingState EvaluateTrading(OrderServiceRestaurantSettings settings, CreateCheckoutOrderDto request)
    {
        if (settings.Windows.Count == 0)
        {
            return TradingState.Shut(
                "The kitchen is not taking orders at the moment. Please call the shop.");
        }

        // An ASAP order is wanted now; a scheduled one is judged at the time chosen.
        //
        // The comparison is case-insensitive and the lookup is a helper, because BOTH
        // the comparison HERE and the one that stores `requested_time` have to agree.
        // They did not: this one compared exactly while the repository's treated
        // anything that was not "ASAP" as scheduled, so a client sending "scheduled"
        // was stored as a scheduled order and JUDGED as an immediate one — accepted at
        // a time the kitchen is shut. Same request, two readings, and the wrong one
        // decided whether to take the order.
        DateTime? wantedAt = PickupTime.IsScheduled(request.PickupTime)
            ? request.PickupTime.ScheduledTime
            : null;

        return _tradingHours.Evaluate(settings.Windows, settings.Timezone, wantedAt);
    }

    /// <summary>
    /// Generates a unique order number using the restaurant's local time.
    /// Format: AT-DDHHMM-XXXX (e.g. AT-08021030-A1B2).
    /// </summary>
    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken = default)
    {
        var now = await GetRestaurantLocalTimeAsync(cancellationToken);
        var timestamp = now.ToString("ddHHmm");
        var uniqueSuffix = Guid.NewGuid().ToString("N").Substring(0, 4).ToUpper();
        return $"AT-{timestamp}-{uniqueSuffix}";
    }

    /// <summary>
    /// Gets the current time in the restaurant's configured timezone
    /// (Australia/Adelaide), falling back to UTC if the timezone is unavailable.
    /// </summary>
    private async Task<DateTime> GetRestaurantLocalTimeAsync(CancellationToken cancellationToken)
    {
        try
        {
            var timezoneId = await _settingsRepository.GetAsync("timezone", cancellationToken);
            if (!string.IsNullOrWhiteSpace(timezoneId))
            {
                var tz = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
                return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not resolve restaurant timezone; falling back to UTC");
        }

        return DateTime.UtcNow;
    }

    /// <summary>
    /// Takes payment for a card order and records the outcome.
    ///
    /// Returns what actually happened so the response can say "Paid online" only
    /// when it is true. A failure never throws: the order exists, the customer is
    /// standing at the counter, and the useful outcome is an order marked unpaid
    /// with a reason — not a 500 that hides whether the charge went through.
    /// </summary>
    private async Task<PaymentOutcome> ProcessPaymentAsync(
        Order order,
        CreateCheckoutOrderDto request,
        CancellationToken cancellationToken)
    {
        // Cash is paid at pickup, so there is nothing to take now.
        if (request.PaymentMethod != PaymentMethod.Card)
        {
            _logger.LogInformation("Order {OrderNumber} is pay-on-pickup; no payment taken now.", order.OrderNumber);
            return PaymentOutcome.PayOnPickup;
        }

        try
        {
            // The frontend confirms the PaymentIntent with Stripe (3-D Secure needs
            // the browser), then sends the intent id as PaymentToken. The server
            // verifies it with Stripe rather than trusting the client's word, so a
            // forged request cannot produce a paid order.
            var result = await _paymentGateway.AuthorizePaymentAsync(
                new PaymentRequest
                {
                    OrderId = order.Id.ToString(),
                    OrderNumber = order.OrderNumber,
                    // Minor units. The API computes the total itself, so this is the
                    // server's own figure and not a client-supplied amount.
                    Amount = (int)Math.Round(order.Total * 100, MidpointRounding.AwayFromZero),
                    Currency = "aud",
                    PaymentMethodId = request.PaymentToken,
                    PaymentMethodType = PaymentMethodType.Card,
                    // The payment namespace declares its own OrderType with matching
                    // members; map it rather than relying on an implicit conversion that
                    // does not exist.
                    OrderType = request.OrderType == Models.Enums.OrderType.DineIn
                        ? Payment.Interfaces.OrderType.DineIn
                        : Payment.Interfaces.OrderType.Pickup,
                    CustomerEmail = order.CustomerEmail,
                    CustomerPhone = order.CustomerPhone,
                    Metadata = new Dictionary<string, string>
                    {
                        ["orderNumber"] = order.OrderNumber,
                        ["orderId"] = order.Id.ToString(),
                    },
                    // Deterministic, so a retried request cannot double-charge.
                    IdempotencyKey = $"order-{order.Id}-payment",
                },
                cancellationToken);

            if (result.Success)
            {
                order.PaymentStatus = Models.Enums.PaymentStatus.Succeeded;
                order.ExternalPaymentId = result.AuthorizationId;
                order.PaidAmount = order.Total;
                order.PaidAt = DateTime.UtcNow;
                order.PaymentFailureReason = null;

                await _orderRepository.UpdateOrderAsync(order, cancellationToken);

                _logger.LogInformation(
                    "Payment captured for order {OrderNumber}: {Amount} AUD, authorization {AuthorizationId}",
                    order.OrderNumber, order.Total, result.AuthorizationId);

                return PaymentOutcome.Paid;
            }

            order.PaymentStatus = Models.Enums.PaymentStatus.Failed;
            order.PaymentFailureReason = result.ErrorMessage ?? "Payment was declined.";
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);

            _logger.LogWarning(
                "Payment declined for order {OrderNumber}: {Reason}",
                order.OrderNumber, order.PaymentFailureReason);

            return PaymentOutcome.Failed;
        }
        catch (Exception ex)
        {
            // A gateway outage must not lose the order. Mark it failed with the
            // reason so it is visible in the dashboard and can be re-attempted.
            order.PaymentStatus = Models.Enums.PaymentStatus.Failed;
            order.PaymentFailureReason = $"Payment could not be processed: {ex.Message}";
            await _orderRepository.UpdateOrderAsync(order, cancellationToken);

            _logger.LogError(ex, "Payment attempt threw for order {OrderNumber}", order.OrderNumber);
            return PaymentOutcome.Failed;
        }
    }

    /// <summary>
    /// Creates an order taken at the counter, by a staff member, for a customer in front of them.
    /// </summary>
    /// <remarks>
    /// A different path from <see cref="CreateOrderAsync"/> in four ways, each deliberate:
    ///
    ///  1. **No trading-hours gate.** That rule exists to stop a script or a stale browser
    ///     tab ordering from a building the shop cannot see into. A logged-in staff member
    ///     with a tablet IS the evidence the shop is open, and the gate would otherwise
    ///     refuse a walk-in at 9:55pm — the last five minutes of trade, which is not the
    ///     moment to argue with software.
    ///  2. **No payment provider is contacted.** No token, no PaymentIntent, no charge.
    ///     Staff have already taken the money (cash, or their own terminal); this records
    ///     that, so the board and the day's takings agree with the till. Nothing here can
    ///     take a card, which is the point — a counter order must never be able to fail
    ///     because Stripe is unreachable.
    ///  3. **The order starts Confirmed, not Pending.** Whoever typed it in is the kitchen's
    ///     acceptance; asking them to accept their own order is a second tap that means
    ///     nothing. Pending is for orders arriving from outside, where somebody has to
    ///     decide whether the kitchen can take them.
    ///  4. **No customer record is created.** A walk-in has no email, and
    ///     `customers.email_normalized` is UNIQUE — so the second anonymous walk-in of the
    ///     day would collide with the first. The order carries its own name (that is what
    ///     `orders.customer_*` is for) and is linked to a customer only when staff choose
    ///     to put a phone number on it.
    ///
    /// The price is not a parameter: the repository prices the lines from the current menu,
    /// the same way the public checkout does, so the request cannot name its own total.
    /// </remarks>
    public async Task<CounterOrderResponseDto> CreateCounterOrderAsync(
        CreateCounterOrderDto request,
        CancellationToken cancellationToken = default)
    {
        var orderNumber = await GenerateOrderNumberAsync(cancellationToken);

        // A name is what the food is called out as. Refusing an order because someone would
        // not give one would be the software serving itself rather than the customer.
        var name = string.IsNullOrWhiteSpace(request.CustomerName) ? "Counter" : request.CustomerName.Trim();

        // The till number goes into the notes rather than a column of its own: there is no
        // table layout in v1, and the kitchen reads the note.
        var notes = string.IsNullOrWhiteSpace(request.TableNumber)
            ? request.Notes
            : $"Table {request.TableNumber.Trim()}"
              + (string.IsNullOrWhiteSpace(request.Notes) ? string.Empty : $" — {request.Notes}");

        var paid = request.MarkedPaid;

        var checkoutRequest = new CreateCheckoutOrderDto
        {
            CustomerName = name,
            // Empty is the documented "not given" for a counter order. NOT NULL columns are
            // satisfied by the empty string rather than a placeholder that would read as
            // real contact details later.
            CustomerPhone = request.CustomerPhone?.Trim() ?? string.Empty,
            CustomerEmail = string.Empty,
            OrderType = request.OrderType,
            // ASAP, always: the person is standing at the counter. There is no scheduled
            // counter order to express, so one is not offered.
            PickupTime = new PickupTimeDto { Type = "ASAP" },
            SpecialInstructions = notes,
            AllergyDeclaration = request.AllergyDeclaration,
            Items = request.Items.Select(i => new CheckoutOrderItemDto
            {
                MenuItemId = i.MenuItemId,
                Quantity = i.Quantity,
                SpecialInstructions = i.SpecialInstructions,
                SelectedModifierIds = i.ModifierIds,
            }).ToList(),
            // Cash unless told otherwise, because that is what a counter sale usually is and
            // the value is required to be something. Without MarkedPaid it still reads as
            // owing, which is the safe direction to be wrong in.
            PaymentMethod = request.PaymentMethod ?? PaymentMethod.Cash,
        };

        var order = await _orderRepository.CreateOrderAsync(checkoutRequest, orderNumber, cancellationToken);

        // Status and payment are set together, after creation, because `CreateOrderAsync`
        // owns the insert and hardcodes Pending/unpaid — the public checkout's assumptions.
        order.Status = OrderStatus.Confirmed;
        if (paid)
        {
            order.PaymentStatus = Models.Enums.PaymentStatus.Succeeded;
            order.PaidAmount = order.Total;
            order.PaidAt = DateTime.UtcNow;
        }
        order.Notes = notes;
        await _orderRepository.UpdateOrderAsync(order, cancellationToken);

        _logger.LogInformation(
            "Counter order {OrderNumber} created by staff: {LineCount} line(s), {Total} AUD, payment {Payment}",
            order.OrderNumber, request.Items.Count, order.Total, paid ? "taken" : "outstanding");

        // The kitchen board hears about it the same way it hears about a web order. Without
        // this a counter order would appear on the board only on the next poll, and the cook
        // is looking at the customer who just ordered it.
        try
        {
            await _orderNotifier.BroadcastNewOrderAsync(new
            {
                orderId = order.Id,
                orderNumber = order.OrderNumber,
                customerName = order.CustomerName,
                orderType = order.OrderType.ToString(),
                total = order.Total,
                paymentMethod = order.PaymentMethod?.ToString(),
                source = "counter",
                createdAt = order.CreatedAt
            });
        }
        catch (Exception ex)
        {
            // A missed push delays the board, it does not lose the order — the list polls.
            _logger.LogError(ex, "Failed to broadcast counter order {OrderNumber} to the boards", orderNumber);
        }

        return new CounterOrderResponseDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Subtotal = order.Subtotal,
            Total = order.Total,
            Status = order.Status.ToString(),
            Paid = paid,
            CounterNote = paid
                ? $"Paid {order.Total:0.00} — nothing to collect."
                : $"Collect {order.Total:0.00} when the food is handed over.",
        };
    }

    /// <summary>
    /// Loads the restaurant settings used for emails and pickup estimates.
    /// </summary>
    private async Task<OrderServiceRestaurantSettings> LoadRestaurantSettingsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var all = await _settingsRepository.GetAllAsync(cancellationToken);

            string Get(string key, string fallback) =>
                all.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : fallback;

            var pickupMinutes = 15;
            if (all.TryGetValue("pickup_minutes", out var pickupRaw) &&
                int.TryParse(pickupRaw, out var parsed) && parsed > 0)
            {
                pickupMinutes = parsed;
            }

            // The trading windows, read alongside the settings because both are needed
            // to judge whether an order may be placed at all.
            var hours = await _settingsRepository.GetHoursAsync(cancellationToken);
            var windows = hours
                .Where(h => !h.IsClosed && h.OpenTime.HasValue && h.CloseTime.HasValue)
                .Select(h => new TradingWindow(
                    h.DayOfWeek,
                    h.OpenTime!.Value,
                    h.CloseTime!.Value,
                    h.BreakStart,
                    h.BreakEnd))
                .ToList();

            return new OrderServiceRestaurantSettings
            {
                RestaurantName = Get("restaurant_name", "Asian Taste Vietnamese Cuisine"),
                Phone = Get("phone", ""),
                Address = Get("address", "329 Henley Beach Rd, Brooklyn Park SA 5032"),
                PickupMinutes = pickupMinutes,
                Timezone = Get("timezone", "Australia/Adelaide"),
                Windows = windows,
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load restaurant settings; using defaults");
            return new OrderServiceRestaurantSettings();
        }
    }
}

/// <summary>
/// What happened when payment was attempted, so the response can report the truth
/// rather than assuming a card order succeeded.
/// </summary>
public enum PaymentOutcome
{
    /// <summary>Cash order — nothing is taken now; the customer pays at pickup.</summary>
    PayOnPickup,

    /// <summary>The charge succeeded and the order is paid.</summary>
    Paid,

    /// <summary>The charge was declined or could not be attempted; the order is unpaid.</summary>
    Failed,
}

/// <summary>
/// Restaurant details used when composing order emails.
/// </summary>
public class OrderServiceRestaurantSettings
{
    public string RestaurantName { get; set; } = "Asian Taste Vietnamese Cuisine";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "329 Henley Beach Rd, Brooklyn Park SA 5032";
    public int PickupMinutes { get; set; } = 15;

    /// <summary>Restaurant-local timezone, used to judge whether the kitchen is open.</summary>
    public string Timezone { get; set; } = "Australia/Adelaide";

    /// <summary>
    /// The trading windows, in local time. Empty means the hours could not be read,
    /// which the order path treats as "cannot prove the shop is open" — see
    /// CreateOrderAsync.
    /// </summary>
    public List<TradingWindow> Windows { get; set; } = new();
}

/// <summary>
/// Thrown when an order arrives outside the kitchen's trading hours.
///
/// A distinct type rather than a generic exception, so the controller can answer with
/// an honest 409 and the reason the customer needs, instead of a 500 that reads as a
/// broken site when the site is working exactly as intended.
/// </summary>
public class ShopClosedException : Exception
{
    public ShopClosedException(string reason) : base(reason) { }
}
