using System.Data;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Services.Lightspeed;
using AsianTaste.API.WebSockets;
using Dapper;

namespace AsianTaste.API.Services;

/// <summary>
/// Background service for syncing orders to Lightspeed POS.
/// Runs continuously to process pending and failed sync operations.
/// </summary>
public class OrderSyncBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<OrderSyncBackgroundService> _logger;
    private readonly IConfiguration _config;

    // Configuration defaults (can be overridden via appsettings)
    private readonly int _maxRetryAttempts = 3;

    public OrderSyncBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<OrderSyncBackgroundService> logger,
        IConfiguration config)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Order Sync Background Service starting...");

        // Read configuration values
        var intervalSeconds = _config.GetValue<int>("Lightspeed:Sync:PollingIntervalSeconds", 30);
        var pollingInterval = TimeSpan.FromSeconds(intervalSeconds);

        _logger.LogInformation("Sync polling interval: {Interval}s", intervalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingOrdersAsync(stoppingToken);
                await ProcessFailedOrdersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in order sync background service");
            }

            // Wait before next batch
            await Task.Delay(pollingInterval, stoppingToken);
        }

        _logger.LogInformation("Order Sync Background Service stopping...");
    }

    /// <summary>
    /// Processes orders with Pending sync status.
    /// </summary>
    private async Task ProcessPendingOrdersAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var orderService = scope.ServiceProvider.GetRequiredService<ILightspeedOrderService>();
        var dbConnectionFactory = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        var webSocketHandler = scope.ServiceProvider.GetRequiredService<OrderWebSocketHandler>();

        using var connection = dbConnectionFactory.CreateConnection();
        connection.Open();

        var batchSize = _config.GetValue<int>("Lightspeed:Sync:BatchSize", 10);

        // Get orders pending sync
        const string sql = @"
            SELECT o.id,
                   o.order_number as OrderNumber,
                   o.customer_name as CustomerName,
                   o.customer_phone as CustomerPhone,
                   o.customer_email as CustomerEmail,
                   o.order_type::text as OrderType,
                   o.status::text as Status,
                   o.payment_method::text as PaymentMethod,
                   o.payment_status::text as PaymentStatus,
                   o.subtotal as Subtotal,
                   o.tax as Tax,
                   o.total as Total,
                   o.notes as Notes,
                   o.created_at as CreatedAt,
                   o.lightspeed_order_id as LightspeedOrderId
            FROM orders o
            WHERE o.lightspeed_sync_status = 'Pending'::sync_status
               OR (o.lightspeed_sync_status = 'NotSynced'::sync_status
                   AND o.payment_status = 'Succeeded'::payment_status)
            ORDER BY o.id ASC
            LIMIT @Limit";

        var pendingOrders = await connection.QueryAsync<OrderDto>(
            new CommandDefinition(sql, new { Limit = batchSize }, cancellationToken: ct));

        var orders = pendingOrders.AsList();
        if (orders.Count == 0)
        {
            return; // No pending orders
        }

        _logger.LogInformation("Processing {Count} pending order(s) for sync", orders.Count);

        foreach (var order in orders)
        {
            if (ct.IsCancellationRequested)
                break;

            // Skip if already synced (idempotency check)
            if (!string.IsNullOrEmpty(order.LightspeedOrderId))
            {
                _logger.LogDebug("Order {OrderId} already has Lightspeed order ID, skipping", order.Id);
                continue;
            }

            try
            {
                // Mark as InProgress
                await UpdateSyncStatusAsync(connection, order.Id, SyncStatus.InProgress, null, null, ct);

                // Get order items
                var items = await GetOrderItemsAsync(connection, order.Id, ct);

                // Create full order object
                var fullOrder = new Order
                {
                    Id = order.Id,
                    OrderNumber = order.OrderNumber,
                    CustomerName = order.CustomerName,
                    CustomerPhone = order.CustomerPhone,
                    CustomerEmail = order.CustomerEmail,
                    OrderType = order.OrderType,
                    Status = order.Status,
                    PaymentMethod = order.PaymentMethod,
                    PaymentStatus = order.PaymentStatus,
                    Subtotal = order.Subtotal,
                    Tax = order.Tax,
                    Total = order.Total,
                    Notes = order.Notes,
                    CreatedAt = order.CreatedAt,
                    Items = items
                };

                // Sync to Lightspeed
                var result = await orderService.CreateOrderAsync(fullOrder);

                if (result.Success)
                {
                    await UpdateSyncStatusAsync(
                        connection,
                        order.Id,
                        SyncStatus.Synced,
                        null,
                        result.LightspeedOrderId!.Value.ToString(),
                        ct);

                    _logger.LogInformation("Successfully synced order {OrderId} to Lightspeed (ID: {LightspeedOrderId})",
                        order.Id, result.LightspeedOrderId);

                    // Notify WebSocket listeners
                    await webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "Synced");
                }
                else
                {
                    await UpdateSyncStatusAsync(
                        connection,
                        order.Id,
                        SyncStatus.Failed,
                        result.ErrorMessage,
                        null,
                        ct);

                    _logger.LogWarning("Failed to sync order {OrderId} to Lightspeed: {Error}",
                        order.Id, result.ErrorMessage);
                }
            }
            catch (Exception ex)
            {
                await UpdateSyncStatusAsync(
                    connection,
                    order.Id,
                    SyncStatus.Failed,
                    ex.Message,
                    null,
                    ct);

                _logger.LogError(ex, "Error syncing order {OrderId}", order.Id);
            }
        }
    }

    /// <summary>
    /// Processes orders with Failed sync status for retry.
    /// </summary>
    private async Task ProcessFailedOrdersAsync(CancellationToken ct)
    {
        var maxRetries = _config.GetValue<int>("Lightspeed:Sync:MaxRetries", _maxRetryAttempts);

        using var scope = _serviceProvider.CreateScope();
        var orderService = scope.ServiceProvider.GetRequiredService<ILightspeedOrderService>();
        var dbConnectionFactory = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        var webSocketHandler = scope.ServiceProvider.GetRequiredService<OrderWebSocketHandler>();

        using var connection = dbConnectionFactory.CreateConnection();
        connection.Open();

        // Every order currently marked Failed.
        //
        // This does NOT filter by retry count, despite what the previous comment
        // claimed: the count is parsed from the sync_error text, so it cannot be
        // compared in SQL. The limit check happens per-order below instead. The
        // practical effect was that a given-up order was selected forever and
        // reported as "Retrying" on every polling interval.
        const string sql = @"
            SELECT id,
                   order_number as OrderNumber,
                   customer_name as CustomerName,
                   customer_phone as CustomerPhone,
                   customer_email as CustomerEmail,
                   order_type::text as OrderType,
                   status::text as Status,
                   payment_method::text as PaymentMethod,
                   subtotal as Subtotal,
                   tax as Tax,
                   total as Total,
                   notes as Notes,
                   created_at as CreatedAt,
                   sync_error as SyncError
            FROM orders
            WHERE lightspeed_sync_status = 'Failed'::sync_status
            ORDER BY updated_at ASC
            LIMIT @Limit";

        var batchSize = _config.GetValue<int>("Lightspeed:Sync:RetryBatchSize", 5);

        var failedOrders = await connection.QueryAsync<OrderWithRetryInfoDto>(
            new CommandDefinition(sql, new { Limit = batchSize }, cancellationToken: ct));

        var orders = failedOrders.AsList();
        if (orders.Count == 0)
        {
            return; // Nothing marked Failed, so nothing to retry.
        }

        // Separate orders that can still be retried from those that have given up,
        // BEFORE logging anything.
        //
        // The old code logged "Retrying {Count} failed order(s)" using the raw query
        // count and then skipped exhausted orders with a Debug-level message.
        // Production logs at Information, so the skip was invisible: the "Retrying"
        // line was emitted every 30 seconds for an order that was never retried,
        // making the sync look busy when it had actually given up. That is the
        // message this fix exists to stop.
        var retryable = orders.Where(o => ParseRetryCount(o.SyncError) < maxRetries).ToList();
        var exhausted = orders.Count - retryable.Count;

        if (exhausted > 0)
        {
            // Warning, not Debug: a given-up order needs a human, and this is the
            // only place that says so.
            _logger.LogWarning(
                "{Exhausted} order(s) exceeded the retry limit of {MaxRetries} and will not be retried again. " +
                "They need manual attention: see lightspeed_sync_status = 'Failed' in the orders table.",
                exhausted, maxRetries);
        }

        if (retryable.Count == 0)
        {
            return; // Everything outstanding has already given up.
        }

        _logger.LogInformation("Retrying {Count} failed order(s)", retryable.Count);

        foreach (var order in retryable)
        {
            if (ct.IsCancellationRequested)
                break;

            var retryCount = ParseRetryCount(order.SyncError);

            try
            {
                // Get order items
                var items = await GetOrderItemsAsync(connection, order.Id, ct);

                var fullOrder = new Order
                {
                    Id = order.Id,
                    OrderNumber = order.OrderNumber,
                    CustomerName = order.CustomerName,
                    CustomerPhone = order.CustomerPhone,
                    CustomerEmail = order.CustomerEmail,
                    OrderType = order.OrderType,
                    Status = order.Status,
                    PaymentMethod = order.PaymentMethod,
                    Subtotal = order.Subtotal,
                    Tax = order.Tax,
                    Total = order.Total,
                    Notes = order.Notes,
                    CreatedAt = order.CreatedAt,
                    Items = items
                };

                // Retry sync
                var result = await orderService.CreateOrderAsync(fullOrder);

                if (result.Success)
                {
                    await UpdateSyncStatusAsync(
                        connection,
                        order.Id,
                        SyncStatus.Synced,
                        null,
                        result.LightspeedOrderId!.Value.ToString(),
                        ct);

                    _logger.LogInformation("Successfully retried sync for order {OrderId} (attempt {Attempt})",
                        order.Id, retryCount + 1);

                    // Notify WebSocket listeners
                    await webSocketHandler.BroadcastStatusUpdateAsync(order.Id, "Synced");
                }
                else
                {
                    await UpdateSyncStatusAsync(
                        connection,
                        order.Id,
                        SyncStatus.Failed,
                        $"Attempt {retryCount + 1}: {result.ErrorMessage}",
                        null,
                        ct);

                    _logger.LogWarning("Retry {Attempt} failed for order {OrderId}: {Error}",
                        retryCount + 1, order.Id, result.ErrorMessage);
                }
            }
            catch (Exception ex)
            {
                await UpdateSyncStatusAsync(
                    connection,
                    order.Id,
                    SyncStatus.Failed,
                    $"Attempt {retryCount + 1}: {ex.Message}",
                    null,
                    ct);

                _logger.LogError(ex, "Error retrying sync for order {OrderId}", order.Id);
            }
        }
    }

    /// <summary>
    /// Gets order items for an order.
    /// </summary>
    private async Task<List<OrderItem>> GetOrderItemsAsync(
        IDbConnection connection,
        int orderId,
        CancellationToken ct)
    {
        const string sql = @"
            SELECT id,
                   order_id as OrderId,
                   menu_item_id as MenuItemId,
                   menu_item_name as MenuItemName,
                   quantity,
                   unit_price as UnitPrice,
                   total_price as TotalPrice,
                   special_instructions as SpecialInstructions
            FROM order_items
            WHERE order_id = @OrderId
            ORDER BY id";

        var items = await connection.QueryAsync<OrderItem>(
            new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: ct));

        return items.AsList();
    }

    /// <summary>
    /// Updates the sync status of an order.
    /// </summary>
    private async Task UpdateSyncStatusAsync(
        IDbConnection connection,
        int orderId,
        SyncStatus status,
        string? errorMessage = null,
        string? lightspeedOrderId = null,
        CancellationToken ct = default)
    {
        const string sql = @"
            UPDATE orders
            SET lightspeed_sync_status = @SyncStatus::sync_status,
                synced_to_lightspeed_at = CASE WHEN @SyncStatus = 'Synced' THEN @Now ELSE synced_to_lightspeed_at END,
                sync_error = @SyncError,
                lightspeed_order_id = COALESCE(@LightspeedOrderId, lightspeed_order_id),
                updated_at = @Now
            WHERE id = @OrderId";

        await connection.ExecuteAsync(
            new CommandDefinition(sql, new
            {
                OrderId = orderId,
                SyncStatus = status.ToString(),
                SyncError = errorMessage,
                LightspeedOrderId = lightspeedOrderId,
                Now = DateTime.UtcNow
            }, cancellationToken: ct));
    }

    /// <summary>
    /// Parses retry count from sync error message.
    /// </summary>
    /// <summary>
    /// Reads the attempt number back out of the stored error message.
    ///
    /// This is a round-trip through human-readable text rather than a column: the
    /// writer stores $"Attempt {n}: {message}" and this parses the number back.
    /// That is fragile — the format is the contract between the two — so it is
    /// internal for tests, which pin both halves against each other.
    /// </summary>
    internal static int ParseRetryCount(string? errorMessage)
    {
        if (string.IsNullOrEmpty(errorMessage))
            return 0;

        var match = System.Text.RegularExpressions.Regex.Match(errorMessage, @"Attempt (\d+):");
        return match.Success && int.TryParse(match.Groups[1].Value, out var count)
            ? count
            : 0;
    }

    #region DTOs

    /// <summary>
    /// DTO for order queries from Dapper.
    /// </summary>
    private class OrderDto
    {
        public int Id { get; init; }
        public string OrderNumber { get; init; } = string.Empty;
        public string CustomerName { get; init; } = string.Empty;
        public string CustomerPhone { get; init; } = string.Empty;
        public string CustomerEmail { get; init; } = string.Empty;
        public OrderType OrderType { get; init; }
        public OrderStatus Status { get; init; }
        public PaymentMethod PaymentMethod { get; init; }
        public PaymentStatus PaymentStatus { get; init; }
        public decimal Subtotal { get; init; }
        public decimal Tax { get; init; }
        public decimal Total { get; init; }
        public string? Notes { get; init; }
        public DateTime CreatedAt { get; init; }
        public string? LightspeedOrderId { get; init; }
    }

    /// <summary>
    /// DTO for order with retry information.
    /// </summary>
    private class OrderWithRetryInfoDto : OrderDto
    {
        public string? SyncError { get; init; }
    }

    #endregion
}
