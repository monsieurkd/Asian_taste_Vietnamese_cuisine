using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Services.Payment;

/// <summary>
/// Guards that wallet payments (Apple Pay, Google Pay) can actually appear.
///
/// Regression context: both PaymentIntent create calls passed
/// <c>PaymentMethodTypes = new List&lt;string&gt; { "card" }</c>. Apple Pay and
/// Google Pay are wallets that sit ON TOP of the card payment method, so
/// restricting an intent to the <c>card</c> method type means Stripe never offers
/// them. Registering the domain — the step most guides focus on — would have
/// changed nothing, and the failure is invisible: no error, no log, the button
/// simply never renders, and only on Apple hardware.
///
/// The fix is <c>AutomaticPaymentMethods</c>, which lets Stripe offer whatever is
/// enabled in the dashboard. The two options are mutually exclusive, so a stray
/// <c>PaymentMethodTypes</c> reappearing alongside it would be an API error at
/// runtime, not a silent no-op — which is why the test asserts absence too.
///
/// These assert on the source text rather than constructing the gateway, because
/// the real risk is not behaviour under a mock but someone editing the create
/// options back to a card-only list during an unrelated change. Same approach as
/// PaymentGatewayDefaultTests, for the same reason.
/// </summary>
public class StripeWalletPaymentTests
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

    [Fact]
    public void Neither_payment_intent_restricts_itself_to_the_card_method_type()
    {
        // Code only: strip // comments so the explanatory comment that quotes the
        // old line does not count as a violation.
        var code = string.Join(
            "\n",
            GatewaySource()
                .Split('\n')
                .Select(line => line.Contains("//") ? line[..line.IndexOf("//", StringComparison.Ordinal)] : line));

        Assert.DoesNotContain("PaymentMethodTypes", code);
    }

    [Fact]
    public void Both_flows_enable_automatic_payment_methods()
    {
        // Two create calls exist and they are different flows, not duplicates:
        // automatic capture for pickup/delivery, manual capture for dine-in. Both
        // need wallets, so both must opt in.
        var source = GatewaySource();
        var matches = Regex.Matches(source, @"AutomaticPaymentMethods\s*=\s*new\s+PaymentIntentAutomaticPaymentMethodsOptions");

        Assert.True(
            matches.Count >= 2,
            $"Expected both PaymentIntent create calls to enable AutomaticPaymentMethods, found {matches.Count}. " +
            "A card-only intent silently prevents Apple Pay and Google Pay from ever appearing.");
    }

    [Fact]
    public void Automatic_payment_methods_is_not_combined_with_a_method_type_list()
    {
        // Stripe rejects the two together. Assert they never co-occur in the file,
        // so this fails at build time rather than at the first real payment.
        var source = GatewaySource();

        if (Regex.IsMatch(source, @"AutomaticPaymentMethods\s*=\s*new"))
        {
            Assert.DoesNotMatch(new Regex(@"^\s*PaymentMethodTypes\s*=", RegexOptions.Multiline), source);
        }
    }

    [Fact]
    public void The_customer_email_is_set_before_the_intent_is_created()
    {
        // Wallets read the email for the wallet sheet and the receipt, and the
        // order confirmation email depends on it. The original code attached it
        // after CreateAsync, which would drop it for wallet payments.
        var source = GatewaySource();

        var firstEmailAssignment = source.IndexOf("options.ReceiptEmail", StringComparison.Ordinal);
        var firstCreate = source.IndexOf("await service.CreateAsync(options)", StringComparison.Ordinal);

        Assert.True(firstEmailAssignment >= 0, "ReceiptEmail is never set; wallet receipts and confirmation emails would lack an address.");
        Assert.True(firstCreate >= 0, "Could not find the PaymentIntent create call.");
        Assert.True(
            firstEmailAssignment < firstCreate,
            "ReceiptEmail is set after the PaymentIntent is created, so wallet payments would have no customer email attached.");
    }
}
