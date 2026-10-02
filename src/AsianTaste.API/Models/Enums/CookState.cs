using System.Text.Json.Serialization;

namespace AsianTaste.API.Models.Enums;

/// <summary>
/// What the kitchen is doing with one dish.
/// </summary>
/// <remarks>
/// Three states, and the middle one is the whole point. The board before this could only
/// record that a dish was finished, so a ticket with half its dishes on the wok read the
/// same as one nobody had started — which is the difference a cook most needs to see when
/// they pick up a ticket mid-service.
///
/// Deliberately NOT tied to the order's own <see cref="OrderStatus"/>: an order is
/// "Preparing" because somebody accepted it, while individual dishes are queued, cooking
/// or done. Conflating the two would mean an order could not be accepted before its
/// dishes started, or a dish could not be finished before the order was.
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CookState
{
    /// <summary>On the list, not started.</summary>
    Queued = 0,

    /// <summary>On the wok / being plated right now.</summary>
    Cooking = 1,

    /// <summary>Finished and off the cook's list.</summary>
    Done = 2
}
