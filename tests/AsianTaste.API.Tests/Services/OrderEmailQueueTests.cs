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
            Assert.Equal(job.OrderId, received.OrderId);
            Assert.Equal(job.ToEmail, received.ToEmail);
            Assert.Equal(job.Model.OrderNumber, received.Model.OrderNumber);
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
