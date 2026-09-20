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

        // A stricter limit for a specific prefix wins over the global one. The counter
        // key includes the prefix so the two budgets cannot consume each other: browsing
        // the menu must not use up the allowance for placing orders, and vice versa.
        var pathLimit = FindPathLimit(path);
        var maxRequests = pathLimit?.MaxRequests ?? _options.MaxRequests;
        var window = pathLimit?.Window ?? _options.Window;
        var bucket = pathLimit is null ? identifier : $"{identifier}|{pathLimit.PathPrefix}";

        var counter = _counters.AddOrUpdate(
            bucket,
            _ => new RateLimitCounter { Count = 1, WindowStart = DateTime.UtcNow },
            (_, existing) =>
            {
                // Reset if window expired
                if (existing.WindowStart + window < DateTime.UtcNow)
                {
                    return new RateLimitCounter { Count = 1, WindowStart = DateTime.UtcNow };
                }
                // Increment counter
                return new RateLimitCounter { Count = existing.Count + 1, WindowStart = existing.WindowStart };
            }
        );

        if (counter.Count > maxRequests)
        {
            var retryAfterSeconds = Math.Max(1, (int)Math.Ceiling(window.TotalSeconds));
            _logger.LogWarning(
                "Rate limit exceeded for {Identifier} on {Path} ({Count} > {Max} per {Window})",
                identifier, path, counter.Count, maxRequests, window);

            context.Response.StatusCode = 429; // Too Many Requests
            context.Response.Headers.Append("Retry-After", retryAfterSeconds.ToString());

            // A generic message: telling a caller exactly which limit they hit and what it
            // is helps them tune an attack, and the legitimate caller (a person who
            // double-tapped Pay) only needs to know to wait.
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Too many requests. Please wait a moment and try again.",
                retryAfter = retryAfterSeconds
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

    /// <summary>
    /// The per-path limit that applies, if a stricter one is configured.
    /// </summary>
    /// <remarks>
    /// A single global limit cannot express the difference between reading the menu and
    /// creating an order. Menu reads are idempotent and cheap, so a generous limit is
    /// right for them; order creation writes a row, calls Stripe and queues an email, so
    /// a script can do real damage there long before it trips a 100-per-minute ceiling.
    ///
    /// The longest matching prefix wins, so a more specific rule always beats a broader
    /// one regardless of the order they were declared in — otherwise the behaviour would
    /// depend on array order, which is the kind of thing that silently changes when
    /// someone adds a prefix to the middle of the list.
    /// </remarks>
    private PathLimit? FindPathLimit(string path)
    {
        PathLimit? best = null;
        foreach (var limit in _options.PathLimits)
        {
            if (string.IsNullOrEmpty(limit.PathPrefix)) continue;
            if (!path.StartsWith(limit.PathPrefix, StringComparison.OrdinalIgnoreCase)) continue;

            if (best is null || limit.PathPrefix.Length > best.PathPrefix.Length)
            {
                best = limit;
            }
        }
        return best;
    }

    private class RateLimitCounter
    {
        public int Count { get; set; }
        public DateTime WindowStart { get; set; }
    }
}

/// <summary>
/// A stricter limit for a specific path prefix.
/// </summary>
public class PathLimit
{
    /// <summary>Path prefix this limit applies to, e.g. <c>/api/orders</c>.</summary>
    public string PathPrefix { get; set; } = "";

    /// <summary>Maximum requests allowed per window for this prefix.</summary>
    public int MaxRequests { get; set; } = 100;

    /// <summary>Window length; falls back to the global window when unset.</summary>
    public TimeSpan? Window { get; set; }
}

/// <summary>
/// Configuration options for rate limiting.
/// </summary>
public class RateLimitOptions
{
    public int MaxRequests { get; set; } = 100;
    public TimeSpan Window { get; set; } = TimeSpan.FromMinutes(1);
    public string[] ExemptPaths { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Stricter limits for specific path prefixes. A prefix with no entry uses the
    /// global <see cref="MaxRequests"/>.
    /// </summary>
    public PathLimit[] PathLimits { get; set; } = Array.Empty<PathLimit>();
}
