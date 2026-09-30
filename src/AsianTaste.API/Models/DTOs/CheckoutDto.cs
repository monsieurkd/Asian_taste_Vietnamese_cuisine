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

    /// <summary>
    /// Allergies or dietary requirements the customer declared, in their own words.
    /// </summary>
    /// <remarks>
    /// Separate from <see cref="SpecialInstructions"/> on purpose. An allergy is a
    /// medical constraint that the kitchen must see before it starts cooking; a
    /// special instruction is a preference. Mixing them into one free-text field means
    /// the important one competes for attention with "extra napkins", and the kitchen
    /// has to read every note to find it.
    /// </remarks>
    [StringLength(500)]
    public string? AllergyDeclaration { get; set; }

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

    /// <summary>
    /// Scheduled time (required if Type is "SCHEDULED"), in UTC.
    /// </summary>
    /// <remarks>
    /// Callers must send an offset ("2026-09-26T03:00:00+09:30") or a Z-suffixed
    /// instant. A bare local string is read as UTC, which silently shifts the request
    /// by the restaurant's offset — a "3am" pickup sent without an offset arrives as
    /// 12:30pm and is correctly but confusingly accepted.
    /// </remarks>
    public DateTime? ScheduledTime { get; set; }
}

/// <summary>
/// The single interpretation of a <see cref="PickupTimeDto"/>.
/// </summary>
/// <remarks>
/// Extracted because there WERE two interpretations, and they disagreed. The trading
/// rule compared the type exactly (<c>== "SCHEDULED"</c>) while the repository treated
/// anything that was not ASAP as scheduled. A client sending "scheduled" therefore had
/// its order stored as scheduled and judged as immediate — so an order for a time the
/// kitchen is shut could be accepted, at a time a later query would read back as the
/// customer's choice.
///
/// One helper, used by both, is what stops that drifting again. It is case-insensitive
/// because the type is a free-text string in JSON and no client contract guarantees its
/// casing.
/// </remarks>
public static class PickupTime
{
    /// <summary>True when the customer chose a time rather than "as soon as possible".</summary>
    public static bool IsAsap(PickupTimeDto? pickupTime) =>
        pickupTime is null || string.Equals(pickupTime.Type?.Trim(), "ASAP", StringComparison.OrdinalIgnoreCase);

    public static bool IsScheduled(PickupTimeDto? pickupTime) => !IsAsap(pickupTime);

    /// <summary>
    /// The instant the order is wanted, in UTC.
    /// </summary>
    /// <remarks>
    /// A scheduled order with no time falls back to now rather than throwing: the
    /// request is malformed, and the safe reading is that the customer wants it
    /// immediately — which the trading rule then applies to.
    /// </remarks>
    public static DateTime ResolveRequestedTime(PickupTimeDto? pickupTime) =>
        IsScheduled(pickupTime) && pickupTime!.ScheduledTime.HasValue
            ? pickupTime.ScheduledTime.Value
            : DateTime.UtcNow;
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
