using System.Net;

namespace AsianTaste.API.Middleware;

/// <summary>
/// IP-range helpers for <see cref="WebhookSecurityMiddleware"/>, extracted so they can be
/// unit-tested without standing up a request pipeline.
/// </summary>
/// <remarks>
/// These are pure functions on purpose. They previously lived as private static methods on the
/// middleware, which meant the only way to test CIDR boundaries was to fake an <c>HttpContext</c>
/// — so in practice they were not tested at all, and a subnet edge case is exactly the kind of
/// thing that either lets a forged webhook through or silently drops real Stripe ones.
/// </remarks>
public static class IpRange
{
    /// <summary>
    /// Whether <paramref name="ip"/> falls inside a CIDR block such as <c>203.0.113.0/24</c>.
    /// </summary>
    /// <returns>
    /// <c>false</c> for malformed input. Input arrives from an HTTP header, so refusing to parse
    /// is a normal outcome rather than an exceptional one — and an unparseable allow-list entry
    /// must never be treated as "allow".
    /// </returns>
    public static bool IsInCidr(string? ip, string? cidr)
    {
        if (string.IsNullOrWhiteSpace(ip) || string.IsNullOrWhiteSpace(cidr))
        {
            return false;
        }

        var slash = cidr.IndexOf('/');
        if (slash <= 0 || slash == cidr.Length - 1)
        {
            return false;
        }

        var networkText = cidr[..slash];
        if (!int.TryParse(cidr[(slash + 1)..], out var prefixLength))
        {
            return false;
        }

        if (!IPAddress.TryParse(ip.Trim(), out var address) ||
            !IPAddress.TryParse(networkText.Trim(), out var network))
        {
            return false;
        }

        // Mixed families are never a match. Comparing them by address family matters because
        // IPv4-mapped IPv6 addresses (::ffff:203.0.113.5) would otherwise be compared
        // byte-for-byte against a 4-byte network and produce nonsense.
        if (address.AddressFamily != network.AddressFamily)
        {
            return false;
        }

        var addressBytes = address.GetAddressBytes();
        var networkBytes = network.GetAddressBytes();

        if (prefixLength < 0 || prefixLength > networkBytes.Length * 8)
        {
            return false;
        }

        // Walk whole bytes first, then the remaining bits of the boundary byte.
        var wholeBytes = prefixLength / 8;
        for (var i = 0; i < wholeBytes; i++)
        {
            if (addressBytes[i] != networkBytes[i])
            {
                return false;
            }
        }

        var remainingBits = prefixLength % 8;
        if (remainingBits == 0)
        {
            return true;
        }

        var mask = (byte)(0xFF << (8 - remainingBits));
        return (addressBytes[wholeBytes] & mask) == (networkBytes[wholeBytes] & mask);
    }

    /// <summary>
    /// Whether an address is loopback or unspecified, on either IPv4 or IPv6.
    /// </summary>
    public static bool IsLoopbackOrUnspecified(string? ip)
    {
        if (string.IsNullOrWhiteSpace(ip) || !IPAddress.TryParse(ip.Trim(), out var address))
        {
            return false;
        }

        if (IPAddress.IsLoopback(address))
        {
            return true;
        }

        // An unspecified address (0.0.0.0 / ::) means the connection did not carry a real
        // remote address. It is not loopback, but it is equally untrustworthy for a webhook
        // allow-list decision, so callers treat the two the same way.
        return address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any);
    }

    /// <summary>
    /// Whether an address matches any entry in an allow-list. Entries may be a bare address or
    /// a CIDR block, and blank entries are skipped rather than matched.
    /// </summary>
    public static bool IsAllowed(string? ip, IEnumerable<string>? allowList)
    {
        if (string.IsNullOrWhiteSpace(ip) || allowList is null)
        {
            return false;
        }

        foreach (var entry in allowList)
        {
            if (string.IsNullOrWhiteSpace(entry))
            {
                continue;
            }

            var trimmed = entry.Trim();
            if (trimmed.Contains('/'))
            {
                if (IsInCidr(ip, trimmed))
                {
                    return true;
                }
            }
            else if (string.Equals(ip.Trim(), trimmed, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
