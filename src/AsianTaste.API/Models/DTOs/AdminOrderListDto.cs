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
    /// <summary>
    /// What each line's progress adds up to.
    /// </summary>
    /// <remarks>
    /// On the LIST, not only the detail, because the board renders every ticket from
    /// this endpoint and the board is where the ticks happen. "2 of 4 done" is also the
    /// one thing that tells a cook which ticket is furthest along without opening it.
    /// </remarks>
    public OrderItemProgressDto ItemsDone { get; set; } = new();

    /// <summary>
    /// The order's lines. Null unless the caller asked for them (<c>includeItems</c>),
    /// which the board does and the Orders table does not.
    /// </summary>
    /// <remarks>
    /// Null rather than an empty list, so "not fetched" and "this order has no lines"
    /// cannot be confused — an empty list renders as a ticket with nothing to cook.
    /// </remarks>
    public List<AdminOrderListLineDto>? Items { get; set; }

    public DateTime CreatedAt { get; set; }
}

    /// <summary>
    /// How many of an order's lines a cook has ticked off.
    /// </summary>
    /// <remarks>
    /// Its properties are set by the ROW, not by Dapper's nested mapping. Dapper 2.1.35
    /// maps columns to properties of the type being queried — it does NOT turn a dotted
    /// alias like <c>"ItemsDone.Total"</c> into a nested object (that is a different
    /// library's feature, and assuming it here is how the counts silently arrived as 0 of
    /// 0 on every ticket). The repository reads two flat columns and builds this.
    /// </remarks>
    public class OrderItemProgressDto
    {
        /// <summary>Lines ticked.</summary>
        public int Done { get; set; }

        /// <summary>Lines on the order. Dishes, not units — one line of qty 3 is one thing to cook.</summary>
        public int Total { get; set; }
    }

/// <summary>
/// One line of an order as the kitchen board needs it: what to cook, and whether it is
/// already on the pass.
/// </summary>
/// <remarks>
/// Deliberately narrower than <see cref="AdminOrderItemDto"/> — no money. The board
/// decides what to cook; the total is a counter question and lives on the ticket page.
/// A price on a kitchen ticket is a number that costs attention and answers nothing.
/// </remarks>
public class AdminOrderListLineDto
{
    /// <summary>The line's id, which is what a tick is sent against.</summary>
    public int Id { get; set; }

    /// <summary>Denormalized dish name, as ordered.</summary>
    public string MenuItemName { get; set; } = string.Empty;

    public int Quantity { get; set; }

    /// <summary>Selected options, already joined for display (e.g. "Extra spicy, No onion").</summary>
    public string? Modifiers { get; set; }

    /// <summary>Per-dish note — "no coriander" applies to one dish, not the whole order.</summary>
    public string? SpecialInstructions { get; set; }

    /// <summary>True once this dish is done and off the cook's list.</summary>
    public bool IsCompleted { get; set; }
}
