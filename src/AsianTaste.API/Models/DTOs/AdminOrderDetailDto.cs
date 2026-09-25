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

    // What happened to the money, as opposed to what was attempted.
    //
    // The detail screen used to print "Paid online" for every order that was not
    // Cash, because these fields were not selected at all — so a declined card read
    // as a completed sale, and the kitchen had no way to tell. The truth has to come
    // from the row; it cannot be inferred from the payment method.
    public string? PaymentStatus { get; set; }

    /// <summary>Amount actually captured, which is null until a charge succeeds.</summary>
    public decimal? PaidAmount { get; set; }

    /// <summary>When the charge was captured.</summary>
    public DateTime? PaidAt { get; set; }

    /// <summary>Why a charge failed, when one did — the counter staff's next question.</summary>
    public string? PaymentFailureReason { get; set; }

    /// <summary>
    /// The Stripe PaymentIntent id, which is what a refund is issued against.
    /// </summary>
    /// <remarks>
    /// Exposed because the console has to be able to issue the refund itself. Anything
    /// a screen needs to act, it must be able to read — the alternative is asking staff
    /// to copy an id out of the Stripe dashboard, which is the round trip the refund
    /// button exists to remove.
    /// </remarks>
    public string? PaymentIntentId { get; set; }

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
