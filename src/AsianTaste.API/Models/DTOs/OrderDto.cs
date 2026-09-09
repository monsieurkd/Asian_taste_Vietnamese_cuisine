using AsianTaste.API.Models.Enums;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Data transfer object for orders.
/// </summary>
public class OrderDto
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public OrderType OrderType { get; set; }
    public DateTime RequestedTime { get; set; }
    public OrderStatus Status { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();

    // Payment fields (Phase 2-5)
    public PaymentMethod? PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;
    public decimal? PaidAmount { get; set; }
    public DateTime? PaidAt { get; set; }
}

/// <summary>
/// Data transfer object for order items.
/// </summary>
public class OrderItemDto
{
    public int Id { get; set; }
    public int MenuItemId { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
    public string? SpecialInstructions { get; set; }
    public List<OrderItemModifierDto> Modifiers { get; set; } = new();
}

/// <summary>
/// Data transfer object for order item modifiers.
/// </summary>
public class OrderItemModifierDto
{
    public int Id { get; set; }
    public string ModifierName { get; set; } = string.Empty;
    public decimal PriceAdjustment { get; set; }
}
