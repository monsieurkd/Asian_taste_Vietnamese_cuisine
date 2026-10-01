namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// What ticking one dish did to the order.
/// </summary>
/// <remarks>
/// The board needs all of this from one response, because it has to update three things
/// at once and cannot afford to guess any of them: the line itself, the "2 of 4" progress
/// on the ticket, and whether the order has just left the cook's column. A response that
/// only said "ok" would force the console to re-derive the order's new state from a
/// refetch, and during service a refetch is a flicker on the screen a cook is reading.
///
/// <see cref="OrderMarkedReady"/> and <see cref="CustomerNotified"/> are separate on
/// purpose. "The order is ready" and "the customer knows" are different facts, and the
/// second can be false while the first is true — a counter order has nobody to email, and
/// a send can fail. The console says which, so a cook knows whether to call out the number
/// or ring the customer.
/// </remarks>
public class OrderItemCompletionResponseDto
{
    public int OrderId { get; set; }
    public int OrderItemId { get; set; }

    /// <summary>The state the line is now in, as sent.</summary>
    public bool IsCompleted { get; set; }

    /// <summary>Dishes ticked, after this change.</summary>
    public int DoneLines { get; set; }

    /// <summary>Dishes on the order, ticked or not.</summary>
    public int TotalLines { get; set; }

    /// <summary>The order's status now, as text.</summary>
    public string OrderStatus { get; set; } = string.Empty;

    /// <summary>True when THIS tick finished the order and moved it to Ready.</summary>
    public bool OrderMarkedReady { get; set; }

    /// <summary>True when this tick was the one that told the customer.</summary>
    public bool CustomerNotified { get; set; }
}
