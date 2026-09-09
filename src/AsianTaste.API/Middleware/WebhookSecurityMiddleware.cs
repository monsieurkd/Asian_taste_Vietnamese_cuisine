using System.Collections.Concurrent;
using System.Net;

namespace AsianTaste.API.Middleware;

/// <summary>
/// Middleware for securing webhook endpoints with IP validation and rate limiting.
/// </summary>
public class WebhookSecurityMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<WebhookSecurityMiddleware> _logger;
    private readonly IConfiguration _config;
    private readonly ConcurrentDictionary<string, RateLimitEntry> _rateLimitTracker = new();
    private readonly TimeSpan _rateLimitWindow;
    private readonly int _maxRequestsPerWindow;

    // Lightspeed webhook IP ranges (to be configured)
    // These should be obtained from Lightspeed documentation
    private static readonly string[] DefaultLightspeedIps = Array.Empty<string>();

    public WebhookSecurityMiddleware(
        RequestDelegate next,
        ILogger<WebhookSecurityMiddleware> logger,
        IConfiguration config)
    {
        _next = next;
        _logger = logger;
        _config = config;

        var windowMinutes = config.GetValue<int>("Lightspeed:WebhookRateLimitMinutes", 1);
        _rateLimitWindow = TimeSpan.FromMinutes(windowMinutes);
        _maxRequestsPerWindow = config.GetValue<int>("Lightspeed:WebhookRateLimitCount", 100);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Only apply security to webhook endpoints
        if (!context.Request.Path.StartsWithSegments("/api/webhook"))
        {
            await _next(context);
            return;
        }

        var remoteIp = context.Connection.RemoteIpAddress?.ToString();
        var path = context.Request.Path.Value ?? string.Empty;

        _logger.LogDebug("Webhook request from {RemoteIp} to {Path}", remoteIp, path);

        // Skip security for test endpoint in development
        if (context.Request.Path.StartsWithSegments("/api/webhook/test") ||
            context.Request.Path.StartsWithSegments("/api/webhook/simulate"))
        {
            await _next(context);
            return;
        }

        // IP whitelist validation
        if (!IsIpAllowed(remoteIp))
        {
            _logger.LogWarning("Webhook request from blocked IP: {RemoteIp}", remoteIp);
            context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            await context.Response.WriteAsync("IP address not allowed");
            return;
        }

        // Rate limiting
        if (!CheckRateLimit(remoteIp!))
        {
            _logger.LogWarning("Rate limit exceeded for IP: {RemoteIp}", remoteIp);
            context.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            await context.Response.WriteAsync("Rate limit exceeded");
            return;
        }

        // Log the webhook request
        _logger.LogInformation("Webhook request allowed from {RemoteIp} to {Path}", remoteIp, path);

        await _next(context);
    }

    /// <summary>
    /// Checks if the IP address is allowed based on whitelist configuration.
    /// </summary>
    private bool IsIpAllowed(string? remoteIp)
    {
        if (string.IsNullOrEmpty(remoteIp))
        {
            return false;
        }

        // Get allowed IPs from configuration or use defaults
        var allowedIps = _config.GetSection("Lightspeed:WebhookAllowedIps").Get<string[]>()
                      ?? DefaultLightspeedIps;

        // If no whitelist is configured, allow all (for development)
        if (allowedIps.Length == 0)
        {
            _logger.LogDebug("No IP whitelist configured, allowing all requests");
            return true;
        }

        // Check if IP is in allowed list/ranges
        foreach (var allowedIp in allowedIps)
        {
            if (IsIpInRange(remoteIp, allowedIp))
            {
                return true;
            }
        }

        // Allow localhost for development
        if (IsLocalhost(remoteIp))
        {
            return true;
        }

        return false;
    }

    /// <summary>
    /// Checks if an IP is in a CIDR range or matches exactly.
    /// </summary>
    private static bool IsIpInRange(string ip, string allowedIp)
    {
        // Exact match
        if (ip == allowedIp)
        {
            return true;
        }

        // CIDR range check (simplified - for production, use IPNetwork library)
        if (allowedIp.Contains('/'))
        {
            var parts = allowedIp.Split('/');
            if (parts.Length == 2 &&
                IPAddress.TryParse(parts[0], out var networkAddress) &&
                int.TryParse(parts[1], out var prefixLength))
            {
                if (IPAddress.TryParse(ip, out var clientAddress))
                {
                    return IsInSubnet(clientAddress, networkAddress, prefixLength);
                }
            }
        }

        return false;
    }

    /// <summary>
    /// Checks if an IP address is within a subnet.
    /// </summary>
    private static bool IsInSubnet(IPAddress address, IPAddress subnet, int prefixLength)
    {
        if (address.AddressFamily != subnet.AddressFamily)
        {
            return false;
        }

        var addressBytes = address.GetAddressBytes();
        var subnetBytes = subnet.GetAddressBytes();

        if (addressBytes.Length != subnetBytes.Length)
        {
            return false;
        }

        var bytesToCheck = prefixLength / 8;
        var bitsToCheck = prefixLength % 8;

        for (int i = 0; i < bytesToCheck; i++)
        {
            if (addressBytes[i] != subnetBytes[i])
            {
                return false;
            }
        }

        if (bitsToCheck > 0 && bytesToCheck < addressBytes.Length)
        {
            var mask = (byte)(0xFF << (8 - bitsToCheck));
            if ((addressBytes[bytesToCheck] & mask) != (subnetBytes[bytesToCheck] & mask))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Checks if an IP is a localhost address.
    /// </summary>
    private static bool IsLocalhost(string ip)
    {
        return ip == "127.0.0.1" ||
               ip == "::1" ||
               ip == "localhost" ||
               ip.StartsWith("192.168.") ||
               ip.StartsWith("10.") ||
               ip.StartsWith("172.16.");
    }

    /// <summary>
    /// Checks and enforces rate limiting for the IP.
    /// </summary>
    private bool CheckRateLimit(string remoteIp)
    {
        var now = DateTime.UtcNow;
        var key = remoteIp;

        // Clean up old entries
        var expiredEntries = _rateLimitTracker.Where(kvp =>
            kvp.Value.WindowStart + _rateLimitWindow < now).ToList();

        foreach (var entry in expiredEntries)
        {
            _rateLimitTracker.TryRemove(entry.Key, out _);
        }

        // Get or create rate limit entry
        var rateLimitEntry = _rateLimitTracker.GetOrAdd(key, _ => new RateLimitEntry
        {
            WindowStart = now,
            RequestCount = 0
        });

        // Reset if window has expired
        if (rateLimitEntry.WindowStart + _rateLimitWindow < now)
        {
            rateLimitEntry.WindowStart = now;
            rateLimitEntry.RequestCount = 0;
        }

        // Check limit
        if (rateLimitEntry.RequestCount >= _maxRequestsPerWindow)
        {
            return false;
        }

        rateLimitEntry.RequestCount++;
        return true;
    }

    /// <summary>
    /// Rate limit tracking entry.
    /// </summary>
    private class RateLimitEntry
    {
        public DateTime WindowStart { get; set; }
        public int RequestCount { get; set; }
    }
}
