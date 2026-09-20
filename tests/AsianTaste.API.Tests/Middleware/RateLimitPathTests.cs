using AsianTaste.API.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AsianTaste.API.Tests.Middleware;

/// <summary>
/// Tests for the stricter per-path rate limit added in docs/TODO.md §9 item 9.
/// </summary>
/// <remarks>
/// Order creation previously shared the global 100-requests-per-minute budget, which is
/// fine for menu reads and useless for the one endpoint that writes a row, calls Stripe
/// and queues an email — a script trips that limit only after creating 100 orders.
///
/// These exercise the middleware directly rather than through a running host, so they are
/// deterministic and need no network. What they cannot prove is behaviour under genuine
/// concurrency; that is a property of <c>ConcurrentDictionary</c> rather than of this code.
/// </remarks>
public class RateLimitPathTests
{
    private static DefaultHttpContext ContextFor(string path, string ip = "203.0.113.9")
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(ip);
        context.Response.Body = new MemoryStream();
        return context;
    }

    /// <summary>Counts how many requests reached the next middleware.</summary>
    private static async Task<int> DriveAsync(RateLimitOptions options, string path, int requests, string ip = "203.0.113.9")
    {
        var reached = 0;
        RequestDelegate next = _ =>
        {
            reached++;
            return Task.CompletedTask;
        };

        var middleware = new RateLimitMiddleware(next, NullLogger<RateLimitMiddleware>.Instance, options);

        for (var i = 0; i < requests; i++)
        {
            await middleware.InvokeAsync(ContextFor(path, ip));
        }

        return reached;
    }

    private static RateLimitOptions OptionsWithOrderLimit(int orderLimit, int globalLimit = 100) => new()
    {
        MaxRequests = globalLimit,
        Window = TimeSpan.FromMinutes(1),
        PathLimits = new[]
        {
            new PathLimit { PathPrefix = "/api/orders", MaxRequests = orderLimit, Window = TimeSpan.FromMinutes(1) },
        },
    };

    [Fact]
    public async Task Order_Creation_Trips_Much_Sooner_Than_The_Global_Limit()
    {
        // The whole point: 20 requests to /api/orders must not all reach the handler just
        // because the global ceiling is 100.
        var reached = await DriveAsync(OptionsWithOrderLimit(orderLimit: 10), "/api/orders", requests: 20);
        Assert.Equal(10, reached);
    }

    [Fact]
    public async Task A_Path_With_No_Specific_Limit_Still_Uses_The_Global_One()
    {
        // The menu must stay browsable — the strict order limit is not a global throttle.
        var reached = await DriveAsync(OptionsWithOrderLimit(orderLimit: 10), "/api/menu", requests: 30);
        Assert.Equal(30, reached);
    }

    [Fact]
    public async Task The_Two_Budgets_Do_Not_Consume_Each_Other()
    {
        // Browsing must not spend the order allowance.
        //
        // This drives BOTH paths through ONE middleware instance on purpose. An earlier
        // version called the helper twice, which built two middlewares with two independent
        // counters — so it passed even when the per-prefix counter key was removed, and it
        // was asserting nothing. Sharing the instance is what makes it a real test: with a
        // single counter, 20 menu reads would leave only 0 of the 10 order slots.
        var options = OptionsWithOrderLimit(orderLimit: 10);
        var menuReached = 0;
        var orderReached = 0;

        var middleware = new RateLimitMiddleware(
            ctx =>
            {
                var path = ctx.Request.Path.Value ?? "";
                if (path.StartsWith("/api/orders")) orderReached++;
                else menuReached++;
                return Task.CompletedTask;
            },
            NullLogger<RateLimitMiddleware>.Instance,
            options);

        for (var i = 0; i < 20; i++)
        {
            await middleware.InvokeAsync(ContextFor("/api/menu"));
        }
        for (var i = 0; i < 10; i++)
        {
            await middleware.InvokeAsync(ContextFor("/api/orders"));
        }

        Assert.Equal(20, menuReached);
        Assert.Equal(10, orderReached);
    }

    [Fact]
    public async Task The_Order_Limit_Is_Per_Client()
    {
        // One abusive address must not lock out everybody else. Without per-IP keys a
        // single script would deny the whole restaurant's customers.
        //
        // Both addresses go through ONE middleware, so this would fail if the identifier
        // were dropped from the counter key — the bug this test exists to catch.
        var options = OptionsWithOrderLimit(orderLimit: 3);
        var reached = 0;
        var middleware = new RateLimitMiddleware(
            _ => { reached++; return Task.CompletedTask; },
            NullLogger<RateLimitMiddleware>.Instance,
            options);

        for (var i = 0; i < 5; i++)
        {
            await middleware.InvokeAsync(ContextFor("/api/orders", ip: "203.0.113.1"));
        }
        var afterNoisyClient = reached;

        for (var i = 0; i < 3; i++)
        {
            await middleware.InvokeAsync(ContextFor("/api/orders", ip: "198.51.100.7"));
        }

        Assert.Equal(3, afterNoisyClient); // the abusive client used up only its own budget
        Assert.Equal(6, reached);          // the quiet client still got all three
    }

    [Fact]
    public async Task Exempt_Paths_Bypass_The_Order_Limit()
    {
        // /api/dev is Development-only and must stay usable for local work; an exempt
        // prefix must win over a stricter path limit rather than being overridden by it.
        var options = new RateLimitOptions
        {
            MaxRequests = 100,
            Window = TimeSpan.FromMinutes(1),
            ExemptPaths = new[] { "/api/dev" },
            PathLimits = new[]
            {
                new PathLimit { PathPrefix = "/api", MaxRequests = 2, Window = TimeSpan.FromMinutes(1) },
            },
        };

        var reached = await DriveAsync(options, "/api/dev/db/status", requests: 10);
        Assert.Equal(10, reached);
    }

    [Fact]
    public async Task The_Longest_Matching_Prefix_Wins_Regardless_Of_Declaration_Order()
    {
        // Declared broad-first on purpose: the specific rule must still win, or the
        // behaviour would depend on array order and a new prefix inserted in the middle
        // would silently change what applies.
        var options = new RateLimitOptions
        {
            MaxRequests = 100,
            Window = TimeSpan.FromMinutes(1),
            PathLimits = new[]
            {
                new PathLimit { PathPrefix = "/api", MaxRequests = 50, Window = TimeSpan.FromMinutes(1) },
                new PathLimit { PathPrefix = "/api/orders", MaxRequests = 3, Window = TimeSpan.FromMinutes(1) },
            },
        };

        var ordersReached = await DriveAsync(options, "/api/orders", requests: 10);
        Assert.Equal(3, ordersReached);
    }

    [Fact]
    public async Task A_Request_Over_The_Limit_Gets_A_429_And_A_Retry_After()
    {
        var options = OptionsWithOrderLimit(orderLimit: 1);
        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new RateLimitMiddleware(next, NullLogger<RateLimitMiddleware>.Instance, options);

        var context = ContextFor("/api/orders");
        await middleware.InvokeAsync(context); // the one allowed request
        await middleware.InvokeAsync(context); // over the limit

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
        Assert.True(context.Response.Headers.ContainsKey("Retry-After"));
    }

    [Fact]
    public async Task The_Rejection_Does_Not_Reveal_The_Configured_Limit()
    {
        // Telling a caller the exact ceiling helps them tune the rate of an attack, and a
        // legitimate caller (someone who double-tapped Pay) only needs to know to wait.
        var options = OptionsWithOrderLimit(orderLimit: 1);
        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new RateLimitMiddleware(next, NullLogger<RateLimitMiddleware>.Instance, options);

        var context = ContextFor("/api/orders");
        await middleware.InvokeAsync(context);
        context.Response.Body.Position = 0;
        await middleware.InvokeAsync(context);

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.DoesNotContain("10", body);
        Assert.DoesNotContain("/minute", body);
        Assert.Contains("wait", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task The_Default_Options_Apply_No_Path_Limits()
    {
        // A caller that constructs RateLimitOptions without PathLimits must get the old
        // behaviour — the array defaults to empty rather than to something restrictive
        // that would silently throttle a test or a dev run.
        var options = new RateLimitOptions { MaxRequests = 5, Window = TimeSpan.FromMinutes(1) };
        var reached = await DriveAsync(options, "/api/orders", requests: 5);
        Assert.Equal(5, reached);
    }
}
