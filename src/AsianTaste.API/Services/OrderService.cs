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
    private readonly ILogger<OrderService> _logger;

    public OrderService(
        IOrderRepository orderRepository,
        ICustomerRepository customerRepository,
        IEmailService emailService,
        ILogger<OrderService> logger)
    {
        _orderRepository = orderRepository;
        _customerRepository = customerRepository;
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new order from the checkout request.
    /// </summary>
    public async Task<CheckoutOrderResponseDto> CreateOrderAsync(CreateCheckoutOrderDto request, CancellationToken cancellationToken = default)
    {
        // Generate order number
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

        // Send order confirmation email
        _ = Task.Run(async () =>
        {
            try
            {
                var items = await _orderRepository.GetOrderItemsAsync(order.Id, cancellationToken);

                var emailModel = new OrderConfirmationEmailModel
                {
                    OrderNumber = order.OrderNumber,
                    CustomerName = order.CustomerName,
                    OrderDate = order.CreatedAt,
                    EstimatedReadyTime = order.RequestedTime.AddMinutes(20),
                    OrderType = order.OrderType.ToString(),
                    PaymentMethod = order.PaymentMethod.ToString(),
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
                    SpecialInstructions = order.Notes
                };

                await _emailService.SendOrderConfirmationAsync(
                    order.CustomerEmail,
                    order.CustomerName,
                    emailModel,
                    cancellationToken);

                // Mark email as sent
                await _orderRepository.MarkEmailConfirmationSentAsync(order.Id, cancellationToken);

                _logger.LogInformation("Order confirmation email sent for {OrderNumber}", orderNumber);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send order confirmation email for {OrderNumber}", orderNumber);
            }
        }, cancellationToken);

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
    /// Generates a unique order number.
    /// </summary>
    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken = default)
    {
        // Generate order number like AT-08021030-A1B2 (max 20 chars)
        // Format: AT-DDHHMM-XXXX (12 chars total, well under 20)
        var timestamp = DateTime.UtcNow.ToString("ddHHmm");
        var uniqueSuffix = Guid.NewGuid().ToString("N").Substring(0, 4).ToUpper();
        return $"AT-{timestamp}-{uniqueSuffix}";
    }
}
