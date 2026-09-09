using System.Data;
using System.Text;
using System.Text.Json;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using Dapper;

namespace AsianTaste.API.Services.Lightspeed;

/// <summary>
/// Lightspeed K-Series order sync service implementation.
/// Handles bidirectional synchronization of orders with Lightspeed POS.
/// </summary>
public class LightspeedOrderService : ILightspeedOrderService
{
    private readonly ILightspeedAuthService _authService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<LightspeedOrderService> _logger;
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IConfiguration _config;

    private const string BaseUrl = "https://api.lightspeedapp.com/API";
    private const int DefaultSyncBatchSize = 10;

    public LightspeedOrderService(
        ILightspeedAuthService authService,
        IHttpClientFactory httpClientFactory,
        ILogger<LightspeedOrderService> logger,
        IDbConnectionFactory dbConnectionFactory,
        IConfiguration config)
    {
        _authService = authService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _dbConnectionFactory = dbConnectionFactory;
        _config = config;
    }

    public async Task<LightspeedOrderResult> CreateOrderAsync(Order order)
    {
        try
        {
            _logger.LogInformation("Creating order in Lightspeed for local order {OrderId}", order.Id);

            // Get valid access token
            var accessToken = await _authService.GetValidAccessTokenAsync();
            var accountId = await _authService.GetAccountIdAsync();

            if (string.IsNullOrEmpty(accountId))
            {
                return LightspeedOrderResult.Failed("Lightspeed Account ID not found", "account_not_found");
            }

            // Build order payload
            var payload = BuildOrderPayload(order);

            // Create HTTP request
            var httpClient = _httpClientFactory.CreateClient("Lightspeed");
            using var request = new HttpRequestMessage(HttpMethod.Post, $"Account/{accountId}/Order");
            request.Headers.Add("Authorization", $"Bearer {accessToken}");
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                }),
                Encoding.UTF8,
                "application/json");

            // Send request
            var response = await httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Lightspeed order creation failed: {StatusCode} - {Content}",
                    response.StatusCode, content);

                var errorMessage = ParseErrorMessage(content);
                return LightspeedOrderResult.Failed(
                    errorMessage,
                    $"http_{(int)response.StatusCode}");
            }

            // Parse response
            var jsonDoc = JsonDocument.Parse(content);
            var root = jsonDoc.RootElement;

            var lightspeedOrderId = root.GetProperty("ID").GetInt32();
            var orderNumber = root.TryGetProperty("Num", out var numElement)
                ? numElement.GetString()
                : null;

            _logger.LogInformation("Successfully created Lightspeed order {LightspeedOrderId} (Num: {OrderNum}) for local order {LocalOrderId}",
                lightspeedOrderId, orderNumber, order.Id);

            return LightspeedOrderResult.Successful(lightspeedOrderId, orderNumber);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error creating Lightspeed order for local order {OrderId}", order.Id);
            return LightspeedOrderResult.Failed("Network error connecting to Lightspeed", "network_error");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error creating Lightspeed order for local order {OrderId}", order.Id);
            return LightspeedOrderResult.Failed(ex.Message, "unexpected_error");
        }
    }

    public async Task<LightspeedOrderResult> UpdateOrderAsync(int lightspeedOrderId, LightspeedOrderUpdate update)
    {
        try
        {
            var accessToken = await _authService.GetValidAccessTokenAsync();
            var accountId = await _authService.GetAccountIdAsync();

            if (string.IsNullOrEmpty(accountId))
            {
                return LightspeedOrderResult.Failed("Lightspeed Account ID not found", "account_not_found");
            }

            // Build update payload
            var payload = new Dictionary<string, object?>();

            if (!string.IsNullOrEmpty(update.Status))
                payload["status"] = update.Status;

            if (!string.IsNullOrEmpty(update.Note))
                payload["note"] = update.Note;

            if (update.SaleDate.HasValue)
                payload["saleDate"] = update.SaleDate.Value.ToString("o");

            // Create HTTP request
            var httpClient = _httpClientFactory.CreateClient("Lightspeed");
            using var request = new HttpRequestMessage(HttpMethod.Patch, $"Account/{accountId}/Order/{lightspeedOrderId}");
            request.Headers.Add("Authorization", $"Bearer {accessToken}");
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                }),
                Encoding.UTF8,
                "application/json");

            var response = await httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Lightspeed order update failed: {StatusCode} - {Content}",
                    response.StatusCode, content);
                return LightspeedOrderResult.Failed(ParseErrorMessage(content), $"http_{(int)response.StatusCode}");
            }

            _logger.LogInformation("Successfully updated Lightspeed order {OrderId}", lightspeedOrderId);
            return LightspeedOrderResult.Successful(lightspeedOrderId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating Lightspeed order {OrderId}", lightspeedOrderId);
            return LightspeedOrderResult.Failed(ex.Message, "update_error");
        }
    }

    public async Task<LightspeedOrder?> GetOrderAsync(int lightspeedOrderId)
    {
        try
        {
            var accessToken = await _authService.GetValidAccessTokenAsync();
            var accountId = await _authService.GetAccountIdAsync();

            if (string.IsNullOrEmpty(accountId))
                return null;

            var httpClient = _httpClientFactory.CreateClient("Lightspeed");
            using var request = new HttpRequestMessage(HttpMethod.Get, $"Account/{accountId}/Order/{lightspeedOrderId}");
            request.Headers.Add("Authorization", $"Bearer {accessToken}");

            var response = await httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to retrieve Lightspeed order {OrderId}: {StatusCode}",
                    lightspeedOrderId, response.StatusCode);
                return null;
            }

            return ParseLightspeedOrder(content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving Lightspeed order {OrderId}", lightspeedOrderId);
            return null;
        }
    }

    public async Task<bool> SyncOrderStatusAsync(int orderId, OrderStatus status)
    {
        try
        {
            using var connection = _dbConnectionFactory.CreateConnection();
            connection.Open();

            // Get order with Lightspeed ID
            const string sql = @"
                SELECT id, order_number, lightspeed_order_id, status::text as status,
                       customer_name, customer_phone, customer_email, order_type::text as order_type
                FROM orders
                WHERE id = @OrderId";

            var order = await connection.QueryFirstOrDefaultAsync<Order>(
                new CommandDefinition(sql, new { OrderId = orderId }));

            if (order == null || string.IsNullOrEmpty(order.LightspeedOrderId))
            {
                _logger.LogWarning("Cannot sync status: order {OrderId} not found or not synced to Lightspeed", orderId);
                return false;
            }

            if (!int.TryParse(order.LightspeedOrderId, out var lightspeedOrderId))
            {
                _logger.LogWarning("Invalid Lightspeed order ID format: {LightspeedOrderId}", order.LightspeedOrderId);
                return false;
            }

            var lightspeedStatus = GetLightspeedStatus(status);

            var result = await UpdateOrderAsync(lightspeedOrderId, new LightspeedOrderUpdate
            {
                Status = lightspeedStatus
            });

            return result.Success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing status for order {OrderId}", orderId);
            return false;
        }
    }

    public async Task<int> RetryFailedSyncsAsync()
    {
        var batchSize = _config.GetValue<int>("Lightspeed:Sync:BatchSize", DefaultSyncBatchSize);
        var maxRetries = _config.GetValue<int>("Lightspeed:Sync:MaxRetries", 3);

        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Get failed orders with retry count
        const string sql = @"
            SELECT id, order_number, customer_name, customer_phone, customer_email,
                   order_type::text as OrderType, status::text as Status, payment_method::text as PaymentMethod,
                   subtotal, tax, total, notes, created_at
            FROM orders
            WHERE lightspeed_sync_status = 'Failed'::sync_status
            ORDER BY created_at ASC
            LIMIT @BatchSize";

        var failedOrders = await connection.QueryAsync<Order>(
            new CommandDefinition(sql, new { BatchSize = batchSize }));

        var successCount = 0;

        foreach (var order in failedOrders)
        {
            // Get order items
            var items = await GetOrderItemsAsync(order.Id);
            order.Items = items;

            // Check retry count (using sync_error to track attempts)
            var retryCount = ParseRetryCount(order.SyncError);
            if (retryCount >= maxRetries)
            {
                _logger.LogWarning("Order {OrderId} has exceeded max retry count ({MaxRetries})", order.Id, maxRetries);
                continue;
            }

            _logger.LogInformation("Retrying sync for order {OrderId} (attempt {Attempt}/{MaxRetries})",
                order.Id, retryCount + 1, maxRetries);

            var result = await CreateOrderAsync(order);

            if (result.Success)
            {
                await UpdateOrderSyncInfoAsync(order.Id, result.LightspeedOrderId!.Value, SyncStatus.Synced);
                successCount++;
            }
            else
            {
                await UpdateOrderSyncInfoAsync(order.Id, null, SyncStatus.Failed,
                    $"Attempt {retryCount + 1}: {result.ErrorMessage}");
            }
        }

        return successCount;
    }

    public async Task<LightspeedSyncStats> GetSyncStatsAsync()
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT
                COUNT(*) FILTER (WHERE lightspeed_sync_status = 'Pending'::sync_status) as PendingCount,
                COUNT(*) FILTER (WHERE lightspeed_sync_status = 'Failed'::sync_status) as FailedCount,
                COUNT(*) FILTER (WHERE lightspeed_sync_status = 'Synced'::sync_status) as SyncedCount,
                COUNT(*) FILTER (WHERE lightspeed_sync_status = 'NotSynced'::sync_status) as NotSyncedCount,
                MAX(synced_to_lightspeed_at) as LastSuccessfulSyncAt,
                MAX(sync_error) FILTER (WHERE lightspeed_sync_status = 'Failed'::sync_status) as LastSyncError
            FROM orders";

        var stats = await connection.QuerySingleAsync<StatsDto>(
            new CommandDefinition(sql));

        return new LightspeedSyncStats
        {
            PendingCount = stats.PendingCount,
            FailedCount = stats.FailedCount,
            SyncedCount = stats.SyncedCount,
            NotSyncedCount = stats.NotSyncedCount,
            LastSuccessfulSyncAt = stats.LastSuccessfulSyncAt,
            LastSyncError = stats.LastSyncError
        };
    }

    #region Private Methods

    /// <summary>
    /// Builds the Lightspeed order payload from local order.
    /// </summary>
    private object BuildOrderPayload(Order order)
    {
        // Split customer name into first/last
        var nameParts = order.CustomerName.Split(' ', 2);
        var firstName = nameParts[0];
        var lastName = nameParts.Length > 1 ? nameParts[1] : "";

        // Build order lines
        var lines = new List<object>();
        foreach (var item in order.Items)
        {
            var line = new Dictionary<string, object?>
            {
                ["quantity"] = item.Quantity,
                ["unitPrice"] = item.UnitPrice
            };

            // Add product reference if Lightspeed product ID is available
            if (item is OrderItemWithProductId { LightspeedProductId: not null } itemWithProduct)
            {
                line["product"] = new { ID = itemWithProduct.LightspeedProductId };
            }
            else
            {
                // Fallback: use note to describe the item
                line["description"] = $"{item.MenuItemName} x{item.Quantity}";
            }

            lines.Add(line);
        }

        // Build payment info if payment was completed
        var payments = new List<object>();
        if (order.PaymentStatus == PaymentStatus.Succeeded && order.PaidAmount.HasValue)
        {
            payments.Add(new
            {
                type = GetPaymentType(order.PaymentMethod),
                amount = order.PaidAmount.Value
            });
        }

        return new
        {
            status = GetLightspeedStatus(order.Status),
            saleDate = order.CreatedAt.ToString("o"),
            contact = new
            {
                firstName,
                lastName,
                email = order.CustomerEmail,
                phone = order.CustomerPhone
            },
            lines = lines,
            note = BuildOrderNote(order),
            payments = payments.Count > 0 ? payments : null
        };
    }

    /// <summary>
    /// Builds the order note with order type and special notes.
    /// </summary>
    private string BuildOrderNote(Order order)
    {
        var note = new StringBuilder();

        note.Append($"Order Type: {order.OrderType}");
        note.Append($" | Order #: {order.OrderNumber}");

        if (!string.IsNullOrEmpty(order.Notes))
        {
            note.Append($" | Notes: {order.Notes}");
        }

        return note.ToString();
    }

    /// <summary>
    /// Maps local order status to Lightspeed status.
    /// </summary>
    private string GetLightspeedStatus(OrderStatus status)
    {
        return status switch
        {
            OrderStatus.Pending => "layby",
            OrderStatus.Confirmed => "confirmed",
            OrderStatus.Preparing => "in_progress",
            OrderStatus.Ready => "ready",
            OrderStatus.Completed => "completed",
            OrderStatus.Cancelled => "cancelled",
            _ => "layby"
        };
    }

    /// <summary>
    /// Maps payment method to Lightspeed payment type.
    /// </summary>
    private string GetPaymentType(PaymentMethod? method)
    {
        return method switch
        {
            PaymentMethod.Card => "1",  // Credit Card
            PaymentMethod.Cash => "0",  // Cash
            _ => "0"                     // Default to Cash
        };
    }

    /// <summary>
    /// Parses error message from Lightspeed API response.
    /// </summary>
    private string ParseErrorMessage(string content)
    {
        try
        {
            var jsonDoc = JsonDocument.Parse(content);
            var root = jsonDoc.RootElement;

            // Try to get error message
            if (root.TryGetProperty("message", out var messageElement))
            {
                return messageElement.GetString() ?? "Unknown error";
            }

            if (root.TryGetProperty("error", out var errorElement))
            {
                if (errorElement.ValueKind == JsonValueKind.String)
                {
                    return errorElement.GetString() ?? "Unknown error";
                }

                if (errorElement.TryGetProperty("message", out var errMsgElement))
                {
                    return errMsgElement.GetString() ?? "Unknown error";
                }
            }

            return "Unknown Lightspeed API error";
        }
        catch
        {
            return "Failed to parse error response";
        }
    }

    /// <summary>
    /// Parses a Lightspeed order from API response.
    /// </summary>
    private LightspeedOrder? ParseLightspeedOrder(string content)
    {
        try
        {
            var jsonDoc = JsonDocument.Parse(content);
            var root = jsonDoc.RootElement;

            // Parse contact
            LightspeedContact? contact = null;
            if (root.TryGetProperty("Contact", out var contactElement) && contactElement.ValueKind == JsonValueKind.Object)
            {
                contact = new LightspeedContact
                {
                    FirstName = contactElement.TryGetProperty("firstName", out var fnElement)
                        ? fnElement.GetString()
                        : null,
                    LastName = contactElement.TryGetProperty("lastName", out var lnElement)
                        ? lnElement.GetString()
                        : null,
                    Email = contactElement.TryGetProperty("email", out var emailElement)
                        ? emailElement.GetString()
                        : null,
                    Phone = contactElement.TryGetProperty("phone", out var phoneElement)
                        ? phoneElement.GetString()
                        : null
                };
            }

            // Parse lines
            List<LightspeedOrderLine> lines = new();
            if (root.TryGetProperty("Lines", out var linesElement) && linesElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var line in linesElement.EnumerateArray())
                {
                    lines.Add(new LightspeedOrderLine
                    {
                        Id = line.TryGetProperty("ID", out var idElement) ? idElement.GetInt32() : 0,
                        Description = line.TryGetProperty("description", out var descElement)
                            ? descElement.GetString() ?? ""
                            : "",
                        Quantity = line.TryGetProperty("quantity", out var qtyElement)
                            ? qtyElement.GetDecimal()
                            : 0,
                        UnitPrice = line.TryGetProperty("unitPrice", out var priceElement)
                            ? priceElement.GetDecimal()
                            : 0,
                        Total = line.TryGetProperty("total", out var totalLineElement)
                            ? totalLineElement.GetDecimal()
                            : 0
                    });
                }
            }

            var order = new LightspeedOrder
            {
                Id = root.GetProperty("ID").GetInt32(),
                OrderNumber = root.TryGetProperty("Num", out var numElement)
                    ? numElement.GetString() ?? ""
                    : "",
                Status = root.TryGetProperty("status", out var statusElement)
                    ? statusElement.GetString() ?? ""
                    : "",
                Total = root.TryGetProperty("total", out var totalElement)
                    ? totalElement.GetDecimal()
                    : 0,
                CreatedAt = root.TryGetProperty("createdAt", out var createdAtElement)
                    ? createdAtElement.GetDateTime()
                    : DateTime.UtcNow,
                Note = root.TryGetProperty("note", out var noteElement)
                    ? noteElement.GetString()
                    : null,
                Contact = contact,
                Lines = lines
            };

            return order;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing Lightspeed order response");
            return null;
        }
    }

    /// <summary>
    /// Gets order items for an order.
    /// </summary>
    private async Task<List<OrderItem>> GetOrderItemsAsync(int orderId)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id, order_id as OrderId, menu_item_id as MenuItemId, menu_item_name as MenuItemName,
                   quantity, unit_price as UnitPrice, total_price as TotalPrice, special_instructions as SpecialInstructions
            FROM order_items
            WHERE order_id = @OrderId
            ORDER BY id";

        var items = await connection.QueryAsync<OrderItem>(
            new CommandDefinition(sql, new { OrderId = orderId }));

        return items.AsList();
    }

    /// <summary>
    /// Updates order sync info in database.
    /// </summary>
    private async Task UpdateOrderSyncInfoAsync(
        int orderId,
        int? lightspeedOrderId,
        SyncStatus status,
        string? errorMessage = null)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE orders
            SET lightspeed_order_id = @LightspeedOrderId,
                lightspeed_sync_status = @SyncStatus::sync_status,
                synced_to_lightspeed_at = CASE WHEN @SyncStatus = 'Synced' THEN @Now ELSE NULL END,
                sync_error = @SyncError,
                updated_at = @Now
            WHERE id = @OrderId";

        await connection.ExecuteAsync(
            new CommandDefinition(sql, new
            {
                OrderId = orderId,
                LightspeedOrderId = lightspeedOrderId?.ToString(),
                SyncStatus = status.ToString(),
                Now = DateTime.UtcNow,
                SyncError = errorMessage
            }));
    }

    /// <summary>
    /// Parses retry count from sync error message.
    /// </summary>
    private int ParseRetryCount(string? errorMessage)
    {
        if (string.IsNullOrEmpty(errorMessage))
            return 0;

        var match = System.Text.RegularExpressions.Regex.Match(errorMessage, @"Attempt (\d+):");
        if (match.Success && int.TryParse(match.Groups[1].Value, out var count))
        {
            return count;
        }

        return 0;
    }

    #endregion

    #region DTOs

    /// <summary>
    /// DTO for sync stats query.
    /// </summary>
    private class StatsDto
    {
        public int PendingCount { get; init; }
        public int FailedCount { get; init; }
        public int SyncedCount { get; init; }
        public int NotSyncedCount { get; init; }
        public DateTime? LastSuccessfulSyncAt { get; init; }
        public string? LastSyncError { get; init; }
    }

    /// <summary>
    /// OrderItem with LightspeedProductId support.
    /// </summary>
    private class OrderItemWithProductId : OrderItem
    {
        public new int? LightspeedProductId { get; set; }
    }

    /// <summary>
    /// Maps Lightspeed status string to local OrderStatus.
    /// Public static method for use in tests.
    /// </summary>
    public static OrderStatus MapLightspeedStatus(string lightspeedStatus)
    {
        return (lightspeedStatus?.ToLowerInvariant()) switch
        {
            "layby" => OrderStatus.Pending,
            "confirmed" => OrderStatus.Confirmed,
            "in_progress" => OrderStatus.Preparing,
            "ready" => OrderStatus.Ready,
            "completed" => OrderStatus.Completed,
            "cancelled" => OrderStatus.Cancelled,
            _ => OrderStatus.Pending
        };
    }

    #endregion
}
