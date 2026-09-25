using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Email;
using AsianTaste.API.Services.Payment.Interfaces;

using AsianTaste.API.WebSockets;

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
        DateTime? wantedAt = request.PickupTime.Type == "SCHEDULED"
            && request.PickupTime.ScheduledTime.HasValue
            ? request.PickupTime.ScheduledTime.Value
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
