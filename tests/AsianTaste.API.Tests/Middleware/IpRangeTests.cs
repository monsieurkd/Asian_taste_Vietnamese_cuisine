using AsianTaste.API.Middleware;

namespace AsianTaste.API.Tests.Middleware;

/// <summary>
/// Tests for the webhook IP allow-list helpers.
/// </summary>
/// <remarks>
/// These were private statics on <c>WebhookSecurityMiddleware</c>, so the only way to exercise
/// them was to fake an <c>HttpContext</c> — which meant in practice nobody did. A CIDR edge case
/// here is not cosmetic: it either lets a forged Stripe webhook through, or silently drops real
/// ones and stops orders being confirmed.
///
/// The tests deliberately spend most of their effort on the *refusal* cases. An allow-list that
/// fails open is the failure that costs money, so "does it say no" matters more than "does it
/// say yes".
/// </remarks>
public class IpRangeTests
{
    [Theory]
    [InlineData("203.0.113.5", "203.0.113.0/24", true)]
    [InlineData("203.0.113.255", "203.0.113.0/24", true)]
    [InlineData("203.0.113.0", "203.0.113.0/24", true)]
    [InlineData("203.0.114.1", "203.0.113.0/24", false)]
    [InlineData("203.0.112.255", "203.0.113.0/24", false)]
    public void IsInCidr_Matches_The_Documented_Block(string ip, string cidr, bool expected)
    {
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Fact]
    public void IsInCidr_Includes_The_Network_Address_And_The_Broadcast_Address()
    {
        // Both ends of the range are inside it. A /24 that excludes .0 and .255 looks correct in
        // a quick manual test and then drops the one host that happens to sit on the boundary.
        Assert.True(IpRange.IsInCidr("203.0.113.0", "203.0.113.0/24"));
        Assert.True(IpRange.IsInCidr("203.0.113.255", "203.0.113.0/24"));
    }

    [Theory]
    [InlineData("10.1.2.3", "10.0.0.0/8", true)]
    [InlineData("10.255.255.255", "10.0.0.0/8", true)]
    [InlineData("11.0.0.0", "10.0.0.0/8", false)]
    public void IsInCidr_Handles_Whole_Byte_Prefixes(string ip, string cidr, bool expected)
    {
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Theory]
    // /25 splits the last byte at the 128 boundary: .1-.126 match .0/25, .128+ do not.
    [InlineData("192.0.2.1", "192.0.2.0/25", true)]
    [InlineData("192.0.2.126", "192.0.2.0/25", true)]
    [InlineData("192.0.2.127", "192.0.2.0/25", true)]
    [InlineData("192.0.2.128", "192.0.2.0/25", false)]
    [InlineData("192.0.2.200", "192.0.2.0/25", false)]
    public void IsInCidr_Handles_A_Partial_Byte_At_The_Boundary(string ip, string cidr, bool expected)
    {
        // The bit-masking path. A boundary that is wrong by one bit is a subtle, silent
        // mis-allowance or mis-refusal, and it only shows up on specific addresses.
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Theory]
    [InlineData("192.0.2.255", "192.0.2.0/32", false)]
    [InlineData("192.0.2.0", "192.0.2.0/32", true)]
    public void IsInCidr_Handles_A_Single_Host_Prefix(string ip, string cidr, bool expected)
    {
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Fact]
    public void IsInCidr_Makes_Everything_Match_A_Zero_Prefix()
    {
        // /0 is a legitimate "everything" entry, not a bug — it is how an operator disables the
        // allow-list deliberately rather than by accident.
        Assert.True(IpRange.IsInCidr("8.8.8.8", "0.0.0.0/0"));
    }

    [Theory]
    [InlineData("2001:db8::1", "2001:db8::/32", true)]
    [InlineData("2001:db9::1", "2001:db8::/32", false)]
    public void IsInCidr_Handles_IPv6(string ip, string cidr, bool expected)
    {
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Theory]
    // An IPv4 address can never match an IPv6 block, or vice versa. Comparing them byte-for-byte
    // is how an IPv4-mapped address ends up matching an unrelated network.
    [InlineData("203.0.113.5", "2001:db8::/32", false)]
    [InlineData("2001:db8::1", "203.0.113.0/24", false)]
    public void IsInCidr_Refuses_Mixed_Address_Families(string ip, string cidr, bool expected)
    {
        Assert.Equal(expected, IpRange.IsInCidr(ip, cidr));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-ip")]
    [InlineData("999.999.999.999")]
    public void IsInCidr_Refuses_A_Bad_Address(string? ip)
    {
        // Input arrives from an HTTP header, so refusing to parse is normal, not exceptional.
        Assert.False(IpRange.IsInCidr(ip, "203.0.113.0/24"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("203.0.113.0")]        // no prefix at all
    [InlineData("203.0.113.0/")]       // prefix missing
    [InlineData("/24")]                // network missing
    [InlineData("203.0.113.0/abc")]    // prefix not a number
    [InlineData("203.0.113.0/33")]     // prefix beyond an IPv4 address
    [InlineData("203.0.113.0/-1")]     // negative prefix
    [InlineData("nonsense/24")]        // network not an address
    public void IsInCidr_Refuses_A_Malformed_Block(string? cidr)
    {
        // An allow-list entry that cannot be parsed must never be read as "matches". Failing
        // closed on a typo means a misconfigured webhook is rejected loudly, which is
        // recoverable; failing open means a forged one is accepted, which is not.
        Assert.False(IpRange.IsInCidr("203.0.113.5", cidr));
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    public void IsLoopbackOrUnspecified_Recognises_Loopback(string ip)
    {
        Assert.True(IpRange.IsLoopbackOrUnspecified(ip));
    }

    [Theory]
    [InlineData("0.0.0.0")]
    [InlineData("::")]
    public void IsLoopbackOrUnspecified_Recognises_An_Absent_Remote_Address(string ip)
    {
        // A connection with no real remote address is as untrustworthy as loopback for an
        // allow-list decision.
        Assert.True(IpRange.IsLoopbackOrUnspecified(ip));
    }

    [Theory]
    [InlineData("203.0.113.5")]
    [InlineData("8.8.8.8")]
    [InlineData("not-an-ip")]
    [InlineData(null)]
    public void IsLoopbackOrUnspecified_Rejects_Everything_Else(string? ip)
    {
        Assert.False(IpRange.IsLoopbackOrUnspecified(ip));
    }

    [Fact]
    public void IsAllowed_Matches_A_Bare_Address()
    {
        Assert.True(IpRange.IsAllowed("203.0.113.5", new[] { "203.0.113.5" }));
        Assert.False(IpRange.IsAllowed("203.0.113.6", new[] { "203.0.113.5" }));
    }

    [Fact]
    public void IsAllowed_Matches_A_Cidr_Entry()
    {
        Assert.True(IpRange.IsAllowed("203.0.113.9", new[] { "203.0.113.0/24" }));
    }

    [Fact]
    public void IsAllowed_Matches_Any_Entry_In_The_List()
    {
        var list = new[] { "198.51.100.1", "203.0.113.0/24", "2001:db8::/32" };
        Assert.True(IpRange.IsAllowed("203.0.113.77", list));
        Assert.True(IpRange.IsAllowed("198.51.100.1", list));
        Assert.True(IpRange.IsAllowed("2001:db8::5", list));
        Assert.False(IpRange.IsAllowed("8.8.8.8", list));
    }

    [Fact]
    public void IsAllowed_Fails_Closed_For_A_Null_Or_Empty_List()
    {
        Assert.False(IpRange.IsAllowed("203.0.113.5", null));
        Assert.False(IpRange.IsAllowed("203.0.113.5", Array.Empty<string>()));
        Assert.False(IpRange.IsAllowed(null, new[] { "203.0.113.5" }));
    }

    [Fact]
    public void IsAllowed_Skips_Blank_Entries_Rather_Than_Matching_Them()
    {
        // A blank line in a comma-separated config value must not become a wildcard.
        var list = new[] { "", "   ", null!, "203.0.113.5" };
        Assert.True(IpRange.IsAllowed("203.0.113.5", list));
        Assert.False(IpRange.IsAllowed("8.8.8.8", list));
    }

    [Fact]
    public void IsAllowed_Ignores_Surrounding_Whitespace()
    {
        var list = new[] { "  203.0.113.0/24  " };
        Assert.True(IpRange.IsAllowed("  203.0.113.9  ", list));
    }
}
