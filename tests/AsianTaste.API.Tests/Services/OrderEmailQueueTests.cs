using AsianTaste.API.Services;
using AsianTaste.API.Services.Email;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests the order-confirmation email queue. This is the mechanism that replaced
/// the previous fire-and-forget Task.Run (which could be cancelled when the
/// request completed because it captured the request's CancellationToken).
/// </summary>
public class OrderEmailQueueTests
{
    private static OrderConfirmationEmailJob CreateJob(int orderId = 1, string email = "customer@example.com") =>
        new(orderId, email, "Test Customer", new OrderConfirmationEmailModel
        {
            OrderNumber = $"AT-010100-{orderId:D4}",
            CustomerName = "Test Customer",
            Total = 25.50m,
        });

    [Fact]
    public async Task Enqueue_Then_Read_Yields_The_Job()
    {
        var queue = new OrderEmailQueue();
        var job = CreateJob();

        await queue.EnqueueAsync(job, CancellationToken.None);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var received in queue.ReadAllAsync(cts.Token))
        {
            // The queue now carries two kinds of message, so the reader gets the union
            // and picks the one it means. A confirmation must still arrive AS a
            // confirmation — losing that distinction is how a status update would be
            // sent with a null model.
            var confirmation = Assert.IsType<OrderConfirmationEmailWork>(received);
            Assert.Equal(job.OrderId, confirmation.Job.OrderId);
            Assert.Equal(job.ToEmail, confirmation.Job.ToEmail);
            Assert.Equal(job.Model.OrderNumber, confirmation.Job.Model.OrderNumber);
            break;
        }
    }

    /// <summary>
    /// A "your order is ready" message travels the same queue as a confirmation, and must
    /// arrive as its own kind so the worker sends the right email.
    /// </summary>
    [Fact]
    public async Task EnqueueStatusUpdate_Then_Read_Yields_A_Status_Update()
    {
        var queue = new OrderEmailQueue();
        var job = new OrderStatusUpdateEmailJob(
            7, "customer@example.com", "Test Customer", "AT-010100-0007", "Ready", "Your food is ready.");

        await queue.EnqueueStatusUpdateAsync(job, CancellationToken.None);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var received in queue.ReadAllAsync(cts.Token))
        {
            var update = Assert.IsType<OrderStatusUpdateEmailWork>(received);
            Assert.Equal("Ready", update.Job.Status);
            Assert.Equal("Your food is ready.", update.Job.Message);
            Assert.Equal(7, update.Job.OrderId);
            break;
        }
    }

    [Fact]
    public async Task Enqueue_Preserves_Ordering()
    {
        var queue = new OrderEmailQueue();

        for (var i = 1; i <= 5; i++)
        {
            await queue.EnqueueAsync(CreateJob(i), CancellationToken.None);
        }

        var receivedIds = new List<int>();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var job in queue.ReadAllAsync(cts.Token))
        {
            receivedIds.Add(job.OrderId);
            if (receivedIds.Count == 5)
            {
                break;
            }
        }

        Assert.Equal(new[] { 1, 2, 3, 4, 5 }, receivedIds);
    }

    [Fact]
    public async Task Enqueue_Is_Not_Tied_To_The_Caller_Token()
    {
        // Regression guard: the old Task.Run(cancellationToken) approach could be
        // cancelled when the originating request completed. Jobs must survive the
        // cancellation of the token used to enqueue them.
        var queue = new OrderEmailQueue();

        using var requestCts = new CancellationTokenSource();
        await queue.EnqueueAsync(CreateJob(orderId: 42), requestCts.Token);

        // Simulate the request finishing and its token being cancelled.
        requestCts.Cancel();

        using var readCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var job in queue.ReadAllAsync(readCts.Token))
        {
            Assert.Equal(42, job.OrderId);
            return;
        }

        Assert.Fail("Queued job was lost when the enqueuing token was cancelled");
    }
}
