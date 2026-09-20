using AsianTaste.API.Models.Enums;
using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Request DTO for creating a new order via checkout flow.
/// </summary>
public class CreateCheckoutOrderDto
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

    public PickupTimeDto PickupTime { get; set; } = new();

    [StringLength(1000)]
    public string? SpecialInstructions { get; set; }

    [Required]
    [MinLength(1)]
    public List<CheckoutOrderItemDto> Items { get; set; } = new();

    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Card;

    [StringLength(255)]
    public string? PaymentToken { get; set; }

    // There is deliberately no `SavePaymentMethod` here. One used to exist: the
    // checkout sent it, and nothing ever read it, so ticking "save my card" saved
    // nothing and said nothing. A flag that silently does nothing is worse than an
    // absent feature, because the customer believes a card was stored.
    //
    // The read side is kept (`customer_payment_methods` + the Account page), so
    // finishing saved cards needs a Stripe SetupIntent and an off-session charge
    // path rather than a rebuild. See docs/TODO.md §9.

    public bool CreateAccount { get; set; } = false;

    [StringLength(255)]
    public string? Password { get; set; }
}

/// <summary>
/// Pickup time selection for ASAP or scheduled.
/// </summary>
public class PickupTimeDto
{
    /// <summary>"ASAP" for immediate pickup, "SCHEDULED" for later.</summary>
    public string Type { get; set; } = "ASAP";

    /// <summary>Scheduled time (required if Type is "SCHEDULED").</summary>
    public DateTime? ScheduledTime { get; set; }
}

/// <summary>
/// Order item DTO for checkout requests.
/// </summary>
public class CheckoutOrderItemDto
{
    public int MenuItemId { get; set; }

    [Range(1, 10)]
    public int Quantity { get; set; } = 1;

    [StringLength(500)]
    public string? SpecialInstructions { get; set; }

    public List<int> SelectedModifierIds { get; set; } = new();
}

/// <summary>
/// Response DTO after successfully creating an order.
/// </summary>
public class CheckoutOrderResponseDto
{
    public int OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public DateTime EstimatedReadyTime { get; set; }
    public decimal Total { get; set; }
    public string PaymentDisplay { get; set; } = string.Empty;
    public List<OrderItemDto> Items { get; set; } = new();
    public bool AccountCreated { get; set; }
}

/// <summary>
/// Response DTO for detailed order information.
/// </summary>
public class OrderDetailResponseDto
{
    public int OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime EstimatedReadyTime { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public OrderType OrderType { get; set; }
    public PaymentMethod? PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Pending;
    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }
    public decimal? PaidAmount { get; set; }
    public DateTime? PaidAt { get; set; }
    public string? SpecialInstructions { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();
}

/// <summary>
/// DTO for creating an account after placing an order.
/// </summary>
public class CreateCustomerFromOrderDto
{
    [Required]
    [StringLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    public string Password { get; set; } = string.Empty;

    [Required]
    [StringLength(50)]
    public string OrderNumber { get; set; } = string.Empty;
}

/// <summary>
/// Response DTO for customer information.
/// </summary>
public class CustomerResponseDto
{
    public int Id { get; set; }
    public string CustomerNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
}

/// <summary>
/// Response DTO for order item in checkout context.
/// </summary>
public class OrderItemResponseDto
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
