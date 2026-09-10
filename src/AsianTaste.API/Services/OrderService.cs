using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services.Email;

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
    private readonly ILogger<OrderService> _logger;

    public OrderService(
        IOrderRepository orderRepository,
        ICustomerRepository customerRepository,
        IEmailService emailService,
        IOrderEmailQueue emailQueue,
        IRestaurantSettingsRepository settingsRepository,
        ILogger<OrderService> logger)
    {
        _orderRepository = orderRepository;
        _customerRepository = customerRepository;
        _emailService = emailService;
        _emailQueue = emailQueue;
        _settingsRepository = settingsRepository;
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

        // TODO: Send to Lightspeed K-Series
        // TODO: Process payment if Card

        var response = new CheckoutOrderResponseDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            EstimatedReadyTime = order.RequestedTime.AddMinutes(20), // Default 20 minutes prep time
            Total = order.Total,
            PaymentDisplay = request.PaymentMethod == PaymentMethod.Card
                ? "Paid online"
                : "Pay on pickup",
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

        var items = await _orderRepository.GetOrderItemsAsync(order.Id, cancellationToken);

        return new OrderDetailResponseDto
        {
            OrderId = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            CreatedAt = order.CreatedAt,
            EstimatedReadyTime = order.RequestedTime.AddMinutes(20),
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
                Modifiers = new List<OrderItemModifierDto>()
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
                EstimatedReadyTime = order.RequestedTime.AddMinutes(20),
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
                    Modifiers = new List<OrderItemModifierDto>()
                }).ToList()
            });
        }

        return result;
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

            return new OrderServiceRestaurantSettings
            {
                RestaurantName = Get("restaurant_name", "Asian Taste Vietnamese Cuisine"),
                Phone = Get("phone", ""),
                Address = Get("address", "329 Henley Beach Rd, Brooklyn Park SA 5032"),
                PickupMinutes = pickupMinutes,
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
/// Restaurant details used when composing order emails.
/// </summary>
public class OrderServiceRestaurantSettings
{
    public string RestaurantName { get; set; } = "Asian Taste Vietnamese Cuisine";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "329 Henley Beach Rd, Brooklyn Park SA 5032";
    public int PickupMinutes { get; set; } = 15;
}
