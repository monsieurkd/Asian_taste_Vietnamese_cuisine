using System.Threading.Channels;
using AsianTaste.API.Services.Email;

namespace AsianTaste.API.Services;

/// <summary>
/// A queued order-confirmation email. Carries everything needed to send the
/// email so the background worker does not need to touch request-scoped state.
/// </summary>
public record OrderConfirmationEmailJob(
    int OrderId,
    string ToEmail,
    string ToName,
    OrderConfirmationEmailModel Model);

/// <summary>
/// Queue for outbound order-confirmation emails.
/// </summary>
public interface IOrderEmailQueue
{
    /// <summary>Enqueues an order confirmation email for background delivery.</summary>
    ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default);

    /// <summary>Reads jobs for the background worker.</summary>
    IAsyncEnumerable<OrderConfirmationEmailJob> ReadAllAsync(CancellationToken cancellationToken);
}

/// <summary>
/// In-process channel-backed email queue.
/// </summary>
public class OrderEmailQueue : IOrderEmailQueue
{
    private readonly Channel<OrderConfirmationEmailJob> _channel =
        Channel.CreateUnbounded<OrderConfirmationEmailJob>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });

    public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default) =>
        _channel.Writer.WriteAsync(job, cancellationToken);

    public IAsyncEnumerable<OrderConfirmationEmailJob> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}

/// <summary>
/// Background worker that sends queued order-confirmation emails.
///
/// This replaces the previous fire-and-forget <c>Task.Run</c> in OrderService,
/// which passed the request's CancellationToken into a detached task — the token
/// was disposed when the response completed, so the email could be cancelled
/// before it was ever sent.
/// </summary>
public class OrderEmailBackgroundService : BackgroundService
{
    private readonly IOrderEmailQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderEmailBackgroundService> _logger;

    public OrderEmailBackgroundService(
        IOrderEmailQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<OrderEmailBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
                var orderRepository = scope.ServiceProvider.GetRequiredService<Repositories.IOrderRepository>();

                var sent = await emailService.SendOrderConfirmationAsync(
                    job.ToEmail,
                    job.ToName,
                    job.Model,
                    stoppingToken);

                if (sent)
                {
                    await orderRepository.MarkEmailConfirmationSentAsync(job.OrderId, stoppingToken);
                    _logger.LogInformation("Order confirmation email sent for {OrderNumber}", job.Model.OrderNumber);
                }
                else
                {
                    _logger.LogWarning("Order confirmation email was not sent for {OrderNumber}", job.Model.OrderNumber);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never let a failed email kill the worker.
                _logger.LogError(ex, "Failed to send order confirmation email for {OrderNumber}", job.Model.OrderNumber);
            }
        }
    }
}
