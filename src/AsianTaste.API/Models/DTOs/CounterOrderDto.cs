using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// A counter order — the customer is standing there, so the shop is taking this itself.
/// </summary>
/// <remarks>
/// Deliberately NOT <see cref="CreateCheckoutOrderDto"/> with a flag on it. The two
/// orders differ in ways that matter, and pretending otherwise is how a shop ends up
/// refusing to serve the person in front of it:
///
///   * **No contact details are required.** A walk-in gives a first name, or a nickname,
///     or nothing at all. The PUBLIC checkout requires a name, a phone and an email
///     because it has to take a payment and send a receipt; this has neither job.
///   * **The trading-hours gate does not apply.** That gate exists to stop a stale tab or
///     a script ordering at 2am from a building the shop cannot see into. A staff member
///     holding a tablet is proof the shop is open — and the rule as written would refuse
///     them a counter order at 9:55pm, which is a busy moment in a restaurant, not a
///     mistake to protect against.
///   * **Payment is what happened at the counter**, not an intent to charge a card. There
///     is no token and no gateway call, so this says which way the money was taken rather
///     than asking a payment provider anything.
///
/// Prices are NOT part of this request. The caller sends dishes and quantities; the
/// server prices them from the current menu, exactly as the public checkout does.
/// </remarks>
public class CreateCounterOrderDto
{
    /// <summary>
    /// Who the order is for, for calling out. Blank is stored as "Counter" rather than
    /// rejected — a customer who will not give a name still gets fed.
    /// </summary>
    [StringLength(255)]
    public string? CustomerName { get; set; }

    /// <summary>Optional, and usually blank. Kept for the odd regular who asks to be on file.</summary>
    [StringLength(50)]
    public string? CustomerPhone { get; set; }

    /// <summary>
    /// Pickup (they are waiting) or DineIn (they are sitting down).
    /// </summary>
    public Enums.OrderType OrderType { get; set; } = Enums.OrderType.Pickup;

    /// <summary>
    /// The till number, when the staff member chooses to give one.
    /// </summary>
    /// <remarks>
    /// Free text rather than a reference to a table, because v1 has no table layout and
    /// an unused foreign key is a promise the app does not keep. It lands in the kitchen
    /// note, which is where the cook will actually read it.
    /// </remarks>
    [StringLength(20)]
    public string? TableNumber { get; set; }

    /// <summary>A note for the kitchen — "no coriander", "waiting in the car".</summary>
    [StringLength(1000)]
    public string? Notes { get; set; }

    /// <summary>
    /// Anything the customer said about allergies, in their own words.
    /// </summary>
    /// <remarks>
    /// Asked at the counter for the same reason it is asked online: the kitchen has to see
    /// it before it starts cooking. A walk-in can declare one just as a web customer can,
    /// and until this existed the counter path had nowhere to put it.
    /// </remarks>
    [StringLength(500)]
    public string? AllergyDeclaration { get; set; }

    /// <summary>
    /// How the money was taken. <c>Succeeded</c> records it as paid; anything else leaves
    /// the order owing, which the console shows and the counter settles.
    /// </summary>
    public Enums.PaymentMethod? PaymentMethod { get; set; }

    /// <summary>
    /// True when the staff member has the money in hand (cash box, or their own EFTPOS
    /// terminal). This app takes NO payment for a counter order — it records what already
    /// happened, so that the kitchen's board and the day's takings agree.
    /// </summary>
    public bool MarkedPaid { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "A counter order needs at least one dish.")]
    public List<CounterOrderItemDto> Items { get; set; } = new();
}

/// <summary>
/// One dish on a counter order.
/// </summary>
public class CounterOrderItemDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Choose a dish.")]
    public int MenuItemId { get; set; }

    /// <summary>
    /// Upper bound matches the public checkout and the order editor, so a counter order
    /// cannot be built to a shape the rest of the app refuses to edit.
    /// </summary>
    [Range(1, 10, ErrorMessage = "Quantity must be between 1 and 10.")]
    public int Quantity { get; set; } = 1;

    [StringLength(500)]
    public string? SpecialInstructions { get; set; }

    public List<int> ModifierIds { get; set; } = new();
}

/// <summary>
/// What the counter screen gets back, so it can clear and move on.
/// </summary>
public class CounterOrderResponseDto
{
    public int OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;

    /// <summary>What the kitchen is now cooking, read back from the stored row.</summary>
    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }

    /// <summary>The order's status — <c>Confirmed</c>, because taking it IS accepting it.</summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>True when the money was recorded as taken.</summary>
    public bool Paid { get; set; }

    /// <summary>
    /// A line for the person at the counter, e.g. the amount still to collect.
    /// </summary>
    public string CounterNote { get; set; } = string.Empty;
}
