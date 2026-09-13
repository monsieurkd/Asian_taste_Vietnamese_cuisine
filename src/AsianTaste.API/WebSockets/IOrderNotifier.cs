namespace AsianTaste.API.WebSockets;

/// <summary>
/// Push notifications to connected admin dashboards.
///
/// Why this interface exists: <see cref="OrderService"/> needs to announce new
/// orders, but depending on the concrete <see cref="OrderWebSocketHandler"/> drags
/// a <c>JwtService</c> into the service's constructor. That forced every test
/// constructing an OrderService to build authentication machinery it never uses,
/// for a code path unrelated to what those tests check.
///
/// Depending on this contract instead keeps OrderService's dependencies honest
/// about what it actually needs: "tell the dashboards", not "manage WebSocket
/// connections and validate tokens".
///
/// It also makes the broadcast testable. Before this, nothing called
/// BroadcastNewOrderAsync at all — an order placed by a customer reached the
/// kitchen only when someone refreshed the page, and no test could have caught it
/// because there was no seam to observe.
/// </summary>
public interface IOrderNotifier
{
    /// <summary>
    /// Announces that a new order was placed. Implementations must not throw for
    /// the ordinary case of nobody being connected — an empty dashboard list is
    /// normal, not an error.
    /// </summary>
    Task BroadcastNewOrderAsync(object orderData);

    /// <summary>Announces an order status change (e.g. after POS sync).</summary>
    Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null);

    /// <summary>Announces refreshed dashboard statistics.</summary>
    Task BroadcastDashboardUpdateAsync(object statsData);
}
