using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using AsianTaste.API.Services;

namespace AsianTaste.API.WebSockets;

/// <summary>
/// WebSocket handler for real-time order updates to admin dashboard clients.
/// </summary>
public class OrderWebSocketHandler
{
    private readonly ConcurrentDictionary<string, WebSocket> _connections = new();
    private readonly ILogger<OrderWebSocketHandler> _logger;
    private readonly JwtService _jwtService;

    public OrderWebSocketHandler(ILogger<OrderWebSocketHandler> logger, JwtService jwtService)
    {
        _logger = logger;
        _jwtService = jwtService;
    }

    /// <summary>
    /// Handles an incoming WebSocket connection.
    /// </summary>
    public async Task HandleWebSocketAsync(WebSocket webSocket, string? token)
    {
        // Validate JWT token
        if (string.IsNullOrWhiteSpace(token) || _jwtService.ValidateToken(token) == null)
        {
            _logger.LogWarning("WebSocket connection rejected: Invalid or missing token");
            await webSocket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Unauthorized", CancellationToken.None);
            return;
        }

        var connectionId = Guid.NewGuid().ToString();
        _connections[connectionId] = webSocket;

        _logger.LogInformation("WebSocket connected: {ConnectionId}", connectionId);

        try
        {
            // Send welcome message
            await SendMessageAsync(webSocket, new
            {
                type = "connected",
                connectionId = connectionId,
                timestamp = DateTime.UtcNow
            });

            // Receive loop
            var buffer = new byte[4096];
            while (webSocket.State == WebSocketState.Open)
            {
                var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "WebSocket error for connection {ConnectionId}", connectionId);
        }
        finally
        {
            _connections.TryRemove(connectionId, out _);
            _logger.LogInformation("WebSocket disconnected: {ConnectionId}", connectionId);
        }
    }

    /// <summary>
    /// Broadcasts a new order notification to all connected admin clients.
    /// </summary>
    public async Task BroadcastNewOrderAsync(object orderData)
    {
        var message = new
        {
            type = "new_order",
            data = orderData,
            timestamp = DateTime.UtcNow
        };

        await BroadcastAsync(message);
        _logger.LogInformation("Broadcasted new order to {Count} clients", _connections.Count);
    }

    /// <summary>
    /// Broadcasts an order status update to all connected admin clients.
    /// </summary>
    public async Task BroadcastStatusUpdateAsync(int orderId, string status, string? reason = null)
    {
        var message = new
        {
            type = "status_update",
            orderId = orderId,
            status = status,
            reason = reason,
            timestamp = DateTime.UtcNow
        };

        await BroadcastAsync(message);
        _logger.LogInformation("Broadcasted status update for order {OrderId} to {Count} clients", orderId, _connections.Count);
    }

    /// <summary>
    /// Broadcasts a dashboard stats update to all connected admin clients.
    /// </summary>
    public async Task BroadcastDashboardUpdateAsync(object statsData)
    {
        var message = new
        {
            type = "dashboard_update",
            data = statsData,
            timestamp = DateTime.UtcNow
        };

        await BroadcastAsync(message);
    }

    /// <summary>
    /// Sends a message to a specific WebSocket connection.
    /// </summary>
    private async Task SendMessageAsync(WebSocket webSocket, object message)
    {
        if (webSocket.State != WebSocketState.Open) return;

        var json = JsonSerializer.Serialize(message);
        var buffer = Encoding.UTF8.GetBytes(json);
        await webSocket.SendAsync(
            new ArraySegment<byte>(buffer),
            WebSocketMessageType.Text,
            true,
            CancellationToken.None);
    }

    /// <summary>
    /// Broadcasts a message to all connected WebSocket clients.
    /// </summary>
    private async Task BroadcastAsync(object message)
    {
        var json = JsonSerializer.Serialize(message);
        var buffer = Encoding.UTF8.GetBytes(json);

        var deadConnections = new List<string>();

        foreach (var (connectionId, webSocket) in _connections)
        {
            try
            {
                if (webSocket.State == WebSocketState.Open)
                {
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(buffer),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None);
                }
                else
                {
                    deadConnections.Add(connectionId);
                }
            }
            catch
            {
                deadConnections.Add(connectionId);
            }
        }

        // Clean up dead connections
        foreach (var connectionId in deadConnections)
        {
            _connections.TryRemove(connectionId, out _);
        }
    }

    /// <summary>
    /// Gets the number of active connections.
    /// </summary>
    public int GetConnectionCount() => _connections.Count;
}
