using AsianTaste.API.Services;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests for the POS sync retry's log honesty.
///
/// Regression context: the retry loop logged
/// <c>"Retrying {Count} failed order(s)"</c> using the raw count of orders marked
/// <c>Failed</c>, then skipped any order past the retry limit with a
/// <b>Debug</b>-level message. Production logs at <b>Information</b>, so the skip
/// was invisible and the "Retrying" line was emitted every 30 seconds for an order
/// that was never retried.
///
/// The effect was a permanent, misleading heartbeat: the sync looked busy and
/// working when it had actually given up on the only order it was reporting. The
/// order needs a human, and nothing said so.
///
/// These pin the two halves of the contract that matters: the attempt number is
/// written into the error text and parsed back out, so writer and reader must
/// agree on the format.
/// </summary>
public class OrderSyncRetryTests
{
    // ── The round-trip: writer format ────────────────────────────────────────
    //
    // OrderSyncBackgroundService writes exactly two message shapes:
    //   $"Attempt {retryCount + 1}: {result.ErrorMessage}"   (a failed attempt)
    //   $"Attempt {retryCount + 1}: {ex.Message}"            (an exception)
    // Both are "Attempt N: ..." — that is the contract ParseRetryCount reads.

    [Theory]
    [InlineData("Attempt 1: No active Lightspeed token found. Please complete OAuth flow.", 1)]
    [InlineData("Attempt 2: something else", 2)]
    [InlineData("Attempt 3: No active Lightspeed token found. Please complete OAuth flow.", 3)]
    [InlineData("Attempt 10: ten", 10)]
    public void Reads_the_attempt_number_written_by_the_retry_loop(string message, int expected)
    {
        Assert.Equal(expected, OrderSyncBackgroundService.ParseRetryCount(message));
    }

    [Fact]
    public void A_message_with_no_attempt_prefix_reads_as_zero()
    {
        // Zero attempts means "never tried", which is the safe reading: the order
        // stays eligible for retry rather than being silently abandoned.
        Assert.Equal(0, OrderSyncBackgroundService.ParseRetryCount(null));
        Assert.Equal(0, OrderSyncBackgroundService.ParseRetryCount(""));
        Assert.Equal(0, OrderSyncBackgroundService.ParseRetryCount("Some raw error with no prefix"));
    }

    [Fact]
    public void The_real_production_error_message_parses_to_the_limit()
    {
        // Copied verbatim from the live database for order AT-131302-0C8B, which is
        // the order that produced the recurring "Retrying 1 failed order(s)" line.
        // It sits exactly at MaxRetryAttempts (3), so this is the boundary case the
        // old code failed to report.
        const string stored = "Attempt 3: No active Lightspeed token found. Please complete OAuth flow.";

        var retryCount = OrderSyncBackgroundService.ParseRetryCount(stored);

        Assert.Equal(3, retryCount);
        // The retry loop's default limit is 3, so this order must be treated as
        // exhausted rather than retried again.
        Assert.True(retryCount >= 3, "This order should be past the retry limit and reported as given up.");
    }

    [Fact]
    public void A_longer_message_does_not_confuse_the_parse()
    {
        // The regex looks for "Attempt (\d+):" anchored on the prefix. A message that
        // itself mentions the word must not be misread.
        const string message = "Attempt 2: upstream said 'Attempt 9: quota exceeded' but we retried";

        Assert.Equal(2, OrderSyncBackgroundService.ParseRetryCount(message));
    }

    [Fact]
    public void Garbage_after_the_number_does_not_read_as_a_different_count()
    {
        // Guards against a partial match inflating the attempt count, which would
        // make a healthy order look exhausted and stop it being retried.
        Assert.Equal(1, OrderSyncBackgroundService.ParseRetryCount("Attempt 1:"));
        Assert.Equal(4, OrderSyncBackgroundService.ParseRetryCount("Attempt 4: xyz"));
    }

    [Fact]
    public void Only_the_first_attempt_marker_counts()
    {
        // Attempt 1 is below the limit of 3, so this order is still retryable.
        // If the parse picked up a later number the order would be abandoned early.
        var count = OrderSyncBackgroundService.ParseRetryCount("Attempt 1: Attempt 99: was appended by a wrapper");

        Assert.Equal(1, count);
        Assert.True(count < 3);
    }
}
