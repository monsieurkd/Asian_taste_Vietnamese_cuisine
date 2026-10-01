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
/// A queued "your order is updated" email.
/// </summary>
/// <remarks>
/// Carries the words as well as the status, because the same subject line is used for
/// several states and the sentence is the part the customer actually reads. It is
/// composed by the caller (which knows the order) rather than by the worker (which
/// would need the order, the settings and the templates again just to say one line).
/// </remarks>
public record OrderStatusUpdateEmailJob(
    int OrderId,
    string ToEmail,
    string ToName,
    string OrderNumber,
    string Status,
    string Message);

/// <summary>
/// Queue for outbound order-confirmation emails.
/// </summary>
public interface IOrderEmailQueue
{
    /// <summary>Enqueues an order confirmation email for background delivery.</summary>
    ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default);

    /// <summary>Enqueues an order status-update email for background delivery.</summary>
    ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default);

    /// <summary>Reads jobs for the background worker.</summary>
    IAsyncEnumerable<OrderEmailJob> ReadAllAsync(CancellationToken cancellationToken);
}

/// <summary>
/// One unit of work for the email worker — either kind of message.
/// </summary>
/// <remarks>
/// A single channel of these rather than two channels: the two kinds are the same job
/// in every respect that matters here (send now, order it belongs to, log the outcome),
/// and two channels would mean two workers or a worker that starves one queue while
/// draining the other. At the volume this shop sends, that is not a trade worth making.
/// </remarks>
public abstract record OrderEmailJob(int OrderId);

/// <summary>An order confirmation.</summary>
public sealed record OrderConfirmationEmailWork(OrderConfirmationEmailJob Job) : OrderEmailJob(Job.OrderId);

/// <summary>A status update, including "your order is ready".</summary>
public sealed record OrderStatusUpdateEmailWork(OrderStatusUpdateEmailJob Job) : OrderEmailJob(Job.OrderId);

/// <summary>
/// In-process channel-backed email queue.
/// </summary>
public class OrderEmailQueue : IOrderEmailQueue
{
    private readonly Channel<OrderEmailJob> _channel =
        Channel.CreateUnbounded<OrderEmailJob>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });

    public ValueTask EnqueueAsync(OrderConfirmationEmailJob job, CancellationToken cancellationToken = default) =>
        _channel.Writer.WriteAsync(new OrderConfirmationEmailWork(job), cancellationToken);

    public ValueTask EnqueueStatusUpdateAsync(OrderStatusUpdateEmailJob job, CancellationToken cancellationToken = default) =>
        _channel.Writer.WriteAsync(new OrderStatusUpdateEmailWork(job), cancellationToken);

    public IAsyncEnumerable<OrderEmailJob> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}

/// <summary>
/// Background worker that sends queued order emails.
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

                switch (job)
                {
                    case OrderConfirmationEmailWork confirmation:
                        await SendConfirmationAsync(scope, emailService, confirmation.Job, stoppingToken);
                        break;

                    case OrderStatusUpdateEmailWork update:
                        await SendStatusUpdateAsync(emailService, update.Job, stoppingToken);
                        break;

                    default:
                        _logger.LogWarning("Unrecognised email job for order {OrderId}", job.OrderId);
                        break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never let a failed email kill the worker.
                _logger.LogError(ex, "Failed to send queued email for order {OrderId}", job.OrderId);
            }
        }
    }

    private async Task SendConfirmationAsync(
        IServiceScope scope,
        IEmailService emailService,
        OrderConfirmationEmailJob job,
        CancellationToken stoppingToken)
    {
        var orderRepository = scope.ServiceProvider.GetRequiredService<Repositories.IOrderRepository>();

        var sent = await emailService.SendOrderConfirmationAsync(
            job.ToEmail, job.ToName, job.Model, stoppingToken);

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

    /// <summary>
    /// Sends a status update.
    /// </summary>
    /// <remarks>
    /// Deliberately does NOT clear <c>ready_notified_at</c> on failure. That column
    /// records "the kitchen finished this order and someone was told", and a failed
    /// send is a reason to look in the logs, not a reason to re-announce the order on
    /// the next tick of an unrelated line. A retry belongs with the send, not with a
    /// later request that happens to touch the same order.
    /// </remarks>
    private async Task SendStatusUpdateAsync(
        IEmailService emailService,
        OrderStatusUpdateEmailJob job,
        CancellationToken stoppingToken)
    {
        var sent = await emailService.SendOrderStatusUpdateAsync(
            job.ToEmail, job.ToName, job.OrderNumber, job.Status, job.Message, stoppingToken);

        if (sent)
        {
            _logger.LogInformation(
                "Order {OrderNumber} status email sent to the customer ({Status})", job.OrderNumber, job.Status);
        }
        else
        {
            _logger.LogWarning(
                "Order {OrderNumber} status email could NOT be sent ({Status}) — the order is still marked notified",
                job.OrderNumber, job.Status);
        }
    }
}
