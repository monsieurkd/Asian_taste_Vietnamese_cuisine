using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// One dish on a ticket, as the kitchen manages it.
/// </summary>
/// <remarks>
/// Carries the customer's instruction AND the kitchen's own note as separate fields, and
/// the two are never merged. "no coriander" is what the customer asked for and must be
/// honoured; "used cabbage, out of beansprouts" is what the cook needs the front to know.
/// One field for both makes the first compete with the second for the same line, and the
/// one that gets skimmed is the allergy-adjacent one.
/// </remarks>
public class KitchenItemDto
{
    public int Id { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int Quantity { get; set; }

    /// <summary>Selected options, joined for display.</summary>
    public string? Modifiers { get; set; }

    /// <summary>What the customer asked for on this dish.</summary>
    public string? SpecialInstructions { get; set; }

    /// <summary>The kitchen's own note on this dish. Null when nobody has written one.</summary>
    public string? KitchenNote { get; set; }

    /// <summary>Who wrote the kitchen note.</summary>
    public string? NoteBy { get; set; }

    /// <summary>Queued, Cooking or Done.</summary>
    public string CookState { get; set; } = "Queued";

    /// <summary>Kept alongside cook_state so anything reading the old field still works.</summary>
    public bool IsCompleted { get; set; }

    /// <summary>When a cook started this dish. Null while it is still queued.</summary>
    public DateTime? StartedAt { get; set; }

    /// <summary>When it was finished.</summary>
    public DateTime? CompletedAt { get; set; }

    /// <summary>Who started it.</summary>
    public string? StartedBy { get; set; }

    /// <summary>Who finished it.</summary>
    public string? CookedBy { get; set; }

    /// <summary>
    /// Whether this dish is the reason the ticket is being held.
    /// </summary>
    /// <remarks>
    /// Set on the ORDER's hold, not per dish — but surfaced here so a cook looking at a
    /// held ticket can see which line the hold names without cross-referencing.
    /// </remarks>
    public bool HeldFor { get; set; }
}

/// <summary>
/// One line of the kitchen's activity log.
/// </summary>
public class OrderActivityDto
{
    public int Id { get; set; }
    public string Kind { get; set; } = string.Empty;

    /// <summary>A sentence written to be read by a person, not a field-by-field diff.</summary>
    public string Detail { get; set; } = string.Empty;

    /// <summary>Who did it. Null when the system did it (a webhook, a timer).</summary>
    public string? Actor { get; set; }

    /// <summary>The order's stage when it happened.</summary>
    public string? StatusAtEvent { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// A ticket as the back-of-house screens need it: the dishes, and what has happened to it.
/// </summary>
public class KitchenTicketDto : AdminOrderListDto
{
    /// <summary>Queued, Cooking or Done — per dish. This supersedes <see cref="AdminOrderListDto.Items"/>.</summary>
    public new List<KitchenItemDto>? Items { get; set; }

    /// <summary>True when the ticket is off the line and why.</summary>
    public bool IsHeld { get; set; }
    public DateTime? HeldAt { get; set; }
    public string? HeldReason { get; set; }
    public string? HeldBy { get; set; }

    /// <summary>
    /// Dishes still to cook, at any state below Done. What "how much is left" means.
    /// </summary>
    public int RemainingLines { get; set; }

    /// <summary>Dishes on the wok right now.</summary>
    public int CookingLines { get; set; }

    /// <summary>
    /// Minutes since the order arrived, computed in the restaurant's timezone.
    /// </summary>
    /// <remarks>
    /// Sent by the server rather than derived in the browser so the tablet's clock cannot
    /// make a fresh order look late — a kitchen's "this has been sitting 20 minutes" alarm
    /// is only useful if it is the same on every screen in the room.
    /// </remarks>
    public int AgeMinutes { get; set; }

    /// <summary>True when the order is wanted for a specific later time rather than ASAP.</summary>
    public bool IsScheduled { get; set; }
}

/// <summary>
/// Where a dish should move to.
/// </summary>
/// <remarks>
/// The direction is SENT rather than toggled, for the same reason the completion endpoint
/// does it: a doubled tap on a tablet settles on the state the cook meant instead of
/// flipping twice.
/// </remarks>
public class SetCookStateDto
{
    /// <summary>Queued, Cooking or Done.</summary>
    [Required]
    [StringLength(20)]
    public string State { get; set; } = string.Empty;
}

/// <summary>
/// A note from the kitchen about a dish, or about the order.
/// </summary>
public class KitchenNoteDto
{
    /// <summary>
    /// The note. Empty clears it, which is how a mistake is taken back — the same
    /// reasoning as unticking a dish.
    /// </summary>
    [StringLength(500)]
    public string? Note { get; set; }
}

/// <summary>
/// Hold a ticket, or put it back on the line.
/// </summary>
public class HoldOrderDto
{
    /// <summary>True to hold, false to resume.</summary>
    public bool Held { get; set; }

    /// <summary>
    /// Why it is being held. Required when holding, because a held ticket with no reason
    /// is one nobody can act on — the next person has to ask around.
    /// </summary>
    [StringLength(300)]
    public string? Reason { get; set; }
}

/// <summary>
/// What the kitchen's screens need in one response: counts, and the tickets themselves.
/// </summary>
public class KitchenBoardDto
{
    public List<KitchenTicketDto> Tickets { get; set; } = new();

    /// <summary>The one number a manager looks at.</summary>
    public KitchenBoardSummaryDto Summary { get; set; } = new();
}

public class KitchenBoardSummaryDto
{
    /// <summary>Orders not finished, not cancelled, not held.</summary>
    public int LiveOrders { get; set; }

    /// <summary>Live orders nobody has accepted yet.</summary>
    public int AwaitingAcceptance { get; set; }

    /// <summary>Dishes across all live orders that are not yet Done.</summary>
    public int DishesToCook { get; set; }

    /// <summary>Dishes on the wok right now.</summary>
    public int DishesCooking { get; set; }

    /// <summary>Live orders older than the restaurant's own threshold.</summary>
    public int OverdueOrders { get; set; }

    /// <summary>Orders taken off the line.</summary>
    public int HeldOrders { get; set; }

    /// <summary>Handed over today, in the restaurant's timezone.</summary>
    public int CollectedToday { get; set; }
}

/// <summary>
/// One dish's activity, so a ticket can show who did what.
/// </summary>
public class TicketActivityDto
{
    public List<OrderActivityDto> Events { get; set; } = new();
}
