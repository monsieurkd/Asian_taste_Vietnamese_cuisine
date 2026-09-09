namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Detailed order information for admin view.
/// </summary>
public class AdminOrderDetailDto
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public string OrderType { get; set; } = string.Empty;
    public DateTime RequestedTime { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public List<AdminOrderItemDto> Items { get; set; } = new();
}

/// <summary>
/// Order item information for admin view.
/// </summary>
public class AdminOrderItemDto
{
    public int Id { get; set; }
    public int MenuItemId { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
    public string? SpecialInstructions { get; set; }
    public List<AdminOrderItemModifierDto> Modifiers { get; set; } = new();
}

/// <summary>
/// Order item modifier information for admin view.
/// </summary>
public class AdminOrderItemModifierDto
{
    public int Id { get; set; }
    public int ModifierId { get; set; }
    public string ModifierName { get; set; } = string.Empty;
    public decimal PriceAdjustment { get; set; }
}
