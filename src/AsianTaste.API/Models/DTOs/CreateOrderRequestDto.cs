using AsianTaste.API.Models.Enums;
using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Request DTO for creating a new order.
/// </summary>
public class CreateOrderRequestDto
{
    [Required]
    [StringLength(255)]
    public string CustomerName { get; set; } = string.Empty;

    [Required]
    [StringLength(50)]
    [Phone]
    public string CustomerPhone { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string CustomerEmail { get; set; } = string.Empty;

    public OrderType OrderType { get; set; } = OrderType.Pickup;

    public DateTime? RequestedTime { get; set; }  // null = ASAP

    [StringLength(1000)]
    public string? Notes { get; set; }

    [Required]
    [MinLength(1)]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    /// <summary>
    /// Square payment nonce from Web Payments SDK.
    /// </summary>
    [Required]
    [StringLength(255)]
    public string PaymentNonce { get; set; } = string.Empty;
}

/// <summary>
/// Request DTO for an item in a create order request.
/// </summary>
public class CreateOrderItemDto
{
    public int MenuItemId { get; set; }

    [Range(1, 10)]
    public int Quantity { get; set; } = 1;

    [StringLength(500)]
    public string? SpecialInstructions { get; set; }

    public List<int> SelectedModifierIds { get; set; } = new();
}

/// <summary>
/// Response DTO after creating an order.
/// </summary>
public class CreateOrderResponseDto
{
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public DateTime EstimatedReadyTime { get; set; }
    public decimal Total { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();
}
