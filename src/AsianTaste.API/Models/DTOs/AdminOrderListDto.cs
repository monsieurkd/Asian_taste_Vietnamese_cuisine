namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// One row of the admin order list.
///
/// This exists because the list used to return the <c>Order</c> ENTITY, which meant
/// the endpoint published every column the table happens to have — the Square and
/// Lightspeed columns, the idempotency key, the sync bookkeeping — none of which the
/// console renders and some of which are internal. A list a kitchen reads needs a
/// list's worth of fields, and naming them is what makes the alias bug below
/// impossible to add again without noticing.
///
/// Enum-shaped values arrive as their own text (`Succeeded`, `Pending`) rather than
/// numbers, so the console reads the same word the database holds.
/// </summary>
public class AdminOrderListDto
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;

    /// <summary>Pickup or DineIn.</summary>
    public string OrderType { get; set; } = string.Empty;

    /// <summary>
    /// When the order is wanted. For an ASAP order this is the moment it was placed;
    /// for a scheduled one it is the time the customer picked, which is the only
    /// place that choice is recorded.
    /// </summary>
    public DateTime RequestedTime { get; set; }

    public string Status { get; set; } = string.Empty;

    /// <summary>Card or Cash. Null when nothing has been chosen.</summary>
    public string? PaymentMethod { get; set; }

    /// <summary>
    /// What actually happened to the money — not what was attempted. Without this the
    /// console can only infer "card order means paid", which reads a declined card as
    /// a paid one, and a declined order still lands on the kitchen board.
    /// </summary>
    public string? PaymentStatus { get; set; }

    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }
    public string? Notes { get; set; }

    /// <summary>
    /// Allergies declared for this order, so the KITCHEN BOARD can flag them.
    /// </summary>
    /// <remarks>
    /// On the list rather than only the detail, because the board is where a cook
    /// decides what to start next — an allergy they only see after opening the ticket
    /// is one they have already begun cooking without.
    /// </remarks>
    public string? AllergyDeclaration { get; set; }
    public DateTime CreatedAt { get; set; }
}
