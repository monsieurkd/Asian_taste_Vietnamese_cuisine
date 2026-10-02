namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// What moving one dish to a cook state did to its order.
/// </summary>
/// <remarks>
/// The same shape as the completion response, extended with the cooking count, because the
/// back-of-house screens show three numbers rather than two: how many are still to cook,
/// how many are on the wok, and how many are done. A screen that could only show two would
/// have to derive the third and eventually disagree with the server about it.
/// </remarks>
public class CookStateResponseDto
{
    public int OrderId { get; set; }
    public int OrderItemId { get; set; }

    /// <summary>Queued, Cooking or Done.</summary>
    public string CookState { get; set; } = string.Empty;

    /// <summary>Dishes at Done, after this change.</summary>
    public int DoneLines { get; set; }

    /// <summary>Dishes on the order.</summary>
    public int TotalLines { get; set; }

    /// <summary>Dishes on the wok.</summary>
    public int CookingLines { get; set; }

    /// <summary>The order's status now.</summary>
    public string OrderStatus { get; set; } = string.Empty;

    /// <summary>True when THIS move finished the order and moved it to Ready.</summary>
    public bool OrderMarkedReady { get; set; }

    /// <summary>True when this move was the one that told the customer.</summary>
    public bool CustomerNotified { get; set; }
}

/// <summary>
/// A kitchen note as stored.
/// </summary>
public class KitchenNoteResponseDto
{
    public int OrderId { get; set; }
    public int OrderItemId { get; set; }

    /// <summary>The note, or null when it was cleared.</summary>
    public string? KitchenNote { get; set; }

    /// <summary>Who wrote it.</summary>
    public string? NoteBy { get; set; }
}

/// <summary>
/// A ticket's hold state as stored.
/// </summary>
public class HoldResponseDto
{
    public int OrderId { get; set; }
    public bool IsHeld { get; set; }
    public string? HeldReason { get; set; }
    public string? HeldBy { get; set; }
}
