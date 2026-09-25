using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests for the ONE interpretation of a pickup time.
///
/// Regression context, found on 2026-09-25 while verifying the closed-kitchen rule in
/// production: there were two interpretations, and they disagreed.
///
///   - the trading rule compared the type exactly: `Type == "SCHEDULED"`
///   - the repository treated anything that was not ASAP as scheduled:
///     `Type == "ASAP" ? now : ScheduledTime`
///
/// So a client sending <c>"scheduled"</c> in lowercase had its order STORED as
/// scheduled and JUDGED as immediate. The order is accepted for a time the kitchen is
/// shut, and a later query reads the customer's chosen time back — so the two halves
/// of the same request disagree, and the wrong one decided whether to accept it.
///
/// That is the shape of bug this codebase keeps producing: two places encoding one
/// rule. The fix is a single helper both call sites use, which is what these tests pin.
/// </summary>
public class PickupTimeTests
{
    [Theory]
    [InlineData("ASAP")]
    [InlineData("asap")]
    [InlineData("Asap")]
    [InlineData("  ASAP  ")]
    public void Recognises_an_immediate_order_whatever_the_casing(string type)
    {
        Assert.True(PickupTime.IsAsap(new PickupTimeDto { Type = type }));
        Assert.False(PickupTime.IsScheduled(new PickupTimeDto { Type = type }));
    }

    [Theory]
    [InlineData("SCHEDULED")]
    [InlineData("scheduled")]
    [InlineData("Scheduled")]
    [InlineData("  scheduled ")]
    public void Recognises_a_scheduled_order_whatever_the_casing(string type)
    {
        // The case that was broken. A lowercase value must not be read as immediate,
        // because that is what let an out-of-hours pickup through.
        Assert.True(PickupTime.IsScheduled(new PickupTimeDto { Type = type }));
        Assert.False(PickupTime.IsAsap(new PickupTimeDto { Type = type }));
    }

    [Fact]
    public void An_immediate_order_resolves_to_now()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var resolved = PickupTime.ResolveRequestedTime(new PickupTimeDto { Type = "ASAP" });

        Assert.InRange(resolved, before, DateTime.UtcNow.AddSeconds(1));
    }

    [Fact]
    public void A_scheduled_order_resolves_to_the_time_chosen()
    {
        var wanted = new DateTime(2026, 9, 26, 3, 0, 0, DateTimeKind.Utc);
        var resolved = PickupTime.ResolveRequestedTime(
            new PickupTimeDto { Type = "SCHEDULED", ScheduledTime = wanted });

        // Stored as given. Converted to a local string anywhere along this path and the
        // instant shifts by the restaurant's offset — which is how a "3am" pickup
        // arrives as lunchtime.
        Assert.Equal(wanted, resolved);
    }

    [Fact]
    public void A_scheduled_order_with_no_time_falls_back_to_now()
    {
        // A malformed request. Falling back to now means the trading rule still applies
        // to something, rather than the order slipping through unrestricted.
        var before = DateTime.UtcNow.AddSeconds(-1);
        var resolved = PickupTime.ResolveRequestedTime(new PickupTimeDto { Type = "SCHEDULED" });

        Assert.InRange(resolved, before, DateTime.UtcNow.AddSeconds(1));
    }

    [Fact]
    public void A_missing_pickup_time_is_immediate()
    {
        // The DTO defaults Type to "ASAP", and a null object must read the same way —
        // a checkout that omits the block wants the food now.
        Assert.True(PickupTime.IsAsap(null));
        Assert.Equal(DateTimeKind.Utc, PickupTime.ResolveRequestedTime(null).Kind);
    }

    [Fact]
    public void Storing_and_judging_agree_for_every_shape_of_request()
    {
        // The invariant the bug violated: whatever the pickup block says, the instant
        // that gets STORED and the instant that gets JUDGED must be the same one.
        var wanted = new DateTime(2026, 9, 26, 3, 0, 0, DateTimeKind.Utc);

        foreach (var type in new[] { "ASAP", "asap", "SCHEDULED", "scheduled", "Scheduled" })
        {
            var dto = new PickupTimeDto { Type = type, ScheduledTime = wanted };
            var stored = PickupTime.ResolveRequestedTime(dto);

            // The trading rule judges `ScheduledTime` when IsScheduled, else "now".
            var judged = PickupTime.IsScheduled(dto) ? dto.ScheduledTime!.Value : stored;

            Assert.Equal(stored, judged);
        }
    }
}
