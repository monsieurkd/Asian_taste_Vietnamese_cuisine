namespace AsianTaste.API.Tests.Services.Payment;

/// <summary>
/// Guards that a card order can only be recorded as paid when a charge was VERIFIED.
///
/// Regression context, found in production on 2026-09-25 by the deployment probe:
/// a card order posted with no payment token at all came back
/// <c>"paymentDisplay": "Paid online"</c>, and the order row was written as paid
/// having taken no money.
///
/// The cause was <c>StripePaymentGateway.AuthorizePaymentAsync</c>. Its comment said
/// the server "verifies it with Stripe rather than trusting the client's word", but
/// the code never used the client's PaymentIntent id: it CREATED A NEW one and
/// returned <c>Success = true</c> unconditionally. The intent it created was
/// uncaptured, so no money moved — and because Stripe returned it happily, the
/// failure was invisible from inside the app.
///
/// These assert on the source text rather than driving the gateway, for the same
/// reason as the wallet tests: the risk is someone reinstating a "just create one"
/// path during an unrelated change, and the Stripe SDK cannot be exercised without
/// live keys.
/// </summary>
public class StripePaymentVerificationTests
{
    private static string GatewaySource()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");

        var path = Path.Combine(
            dir!.FullName, "src", "AsianTaste.API", "Services", "Payment", "StripePaymentGateway.cs");

        Assert.True(File.Exists(path), $"StripePaymentGateway.cs not found at {path}");
        return File.ReadAllText(path);
    }

    /// <summary>
    /// The body of AuthorizePaymentAsync only — other methods legitimately create
    /// intents (InitiatePaymentAsync is what the browser confirms), so a file-wide
    /// assertion would be meaningless.
    /// </summary>
    private static string AuthorizeBody()
    {
        var source = GatewaySource();
        var start = source.IndexOf("AuthorizePaymentAsync(", StringComparison.Ordinal);
        Assert.True(start >= 0, "AuthorizePaymentAsync not found.");

        var open = source.IndexOf('{', start);
        var depth = 0;
        for (var i = open; i < source.Length; i++)
        {
            if (source[i] == '{') depth++;
            else if (source[i] == '}')
            {
                depth--;
                if (depth == 0) return source[open..(i + 1)];
            }
        }

        throw new InvalidOperationException("Unbalanced braces in AuthorizePaymentAsync");
    }

    [Fact]
    public void A_card_authorization_must_verify_the_clients_payment_intent()
    {
        var body = AuthorizeBody();

        Assert.True(
            body.Contains("service.GetAsync("),
            "AuthorizePaymentAsync must RETRIEVE the client's confirmed PaymentIntent. Creating a new " +
            "one returns success without charging the card the customer confirmed, which is how an " +
            "order was recorded as 'Paid online' with no money taken.");

        Assert.False(
            body.Contains("service.CreateAsync("),
            "AuthorizePaymentAsync must not create a PaymentIntent. Intents are created for the browser " +
            "to confirm (InitiatePaymentAsync); creating one here charges nothing and reports success.");
    }

    [Fact]
    public void A_card_authorization_without_a_token_is_refused()
    {
        var body = AuthorizeBody();

        // The exact defect: no token in, "Paid online" out.
        Assert.True(
            body.Contains("IsNullOrWhiteSpace(request.PaymentMethodId)"),
            "AuthorizePaymentAsync must refuse a card authorization that carries no PaymentIntent id. " +
            "Without this guard a card order with no token is reported as paid.");
    }

    [Fact]
    public void Only_a_settled_payment_intent_counts_as_paid()
    {
        var body = AuthorizeBody();

        Assert.True(
            body.Contains("\"succeeded\""),
            "AuthorizePaymentAsync must require the intent's status to be 'succeeded' (or " +
            "'requires_capture'). Treating any intent as paid is what made a declined or unfinished " +
            "card read as a completed sale.");

        Assert.True(
            body.Contains("requires_capture"),
            "A card intent confirmed with manual capture settles as 'requires_capture', so that status " +
            "has to be accepted too — otherwise a legitimate wallet payment is rejected.");
    }

    [Fact]
    public void The_amount_paid_must_match_the_order()
    {
        var body = AuthorizeBody();

        Assert.True(
            body.Contains("confirmed.Amount != request.Amount"),
            "AuthorizePaymentAsync must compare the intent's amount with the order's own total. The " +
            "server computes the amount, so a mismatch means the client confirmed something else.");
    }
}
