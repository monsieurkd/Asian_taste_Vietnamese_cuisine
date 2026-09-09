using System.Collections.Concurrent;

namespace AsianTaste.API.Middleware;

/// <summary>
/// Rate limiting middleware to prevent abuse of API endpoints.
/// </summary>
public class RateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitMiddleware> _logger;
    private readonly RateLimitOptions _options;
    private readonly ConcurrentDictionary<string, RateLimitCounter> _counters;

    public RateLimitMiddleware(
        RequestDelegate next,
        ILogger<RateLimitMiddleware> logger,
        RateLimitOptions options)
    {
        _next = next;
        _logger = logger;
        _options = options;
        _counters = new ConcurrentDictionary<string, RateLimitCounter>();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var identifier = GetIdentifier(context);
        var path = context.Request.Path.Value ?? "";

        // Skip rate limiting for exempted paths
        if (_options.ExemptPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        var counter = _counters.AddOrUpdate(
            identifier,
            _ => new RateLimitCounter { Count = 1, WindowStart = DateTime.UtcNow },
            (_, existing) =>
            {
                // Reset if window expired
                if (existing.WindowStart + _options.Window < DateTime.UtcNow)
                {
                    return new RateLimitCounter { Count = 1, WindowStart = DateTime.UtcNow };
                }
                // Increment counter
                return new RateLimitCounter { Count = existing.Count + 1, WindowStart = existing.WindowStart };
            }
        );

        if (counter.Count > _options.MaxRequests)
        {
            _logger.LogWarning("Rate limit exceeded for {Identifier} on {Path}", identifier, path);
            context.Response.StatusCode = 429; // Too Many Requests
            context.Response.Headers.Append("Retry-After", "60");
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Rate limit exceeded",
                retryAfter = 60
            });
            return;
        }

        await _next(context);
    }

    private string GetIdentifier(HttpContext context)
    {
        // Use IP address as identifier
        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private class RateLimitCounter
    {
        public int Count { get; set; }
        public DateTime WindowStart { get; set; }
    }
}

/// <summary>
/// Configuration options for rate limiting.
/// </summary>
public class RateLimitOptions
{
    public int MaxRequests { get; set; } = 100;
    public TimeSpan Window { get; set; } = TimeSpan.FromMinutes(1);
    public string[] ExemptPaths { get; set; } = Array.Empty<string>();
}
