using System.Text.Json;

namespace AsianTaste.API.Tests.Services.Payment;

/// <summary>
/// Guards the payment gateway default, which is the difference between taking
/// money and giving food away.
///
/// Regression context: <c>appsettings.json</c> shipped
/// <c>"UseMockGateway": true</c>. That file applies to EVERY environment,
/// production included, and Fly set no override — so production ran the mock
/// gateway, which approves every charge without contacting Stripe. Card orders
/// came back "Paid online" and were recorded as paid while no money moved.
///
/// Nothing errored. The logs said
/// "Mock Payment Gateway initialized - NO REAL PAYMENTS WILL BE PROCESSED" and
/// an order was created for $8.50 marked paid. It was found only by placing a
/// card order against production with a token that real Stripe would reject, and
/// noticing it was accepted.
///
/// The default is now the safe one, and <c>Program.cs</c> refuses to start a
/// non-Development environment with the mock enabled. These tests read the
/// committed configuration, because the defect WAS the configuration.
/// </summary>
public class PaymentGatewayDefaultTests
{
    /// <summary>
    /// Reads the repository's appsettings.json, found by walking up from the test
    /// binary. Locating the repo rather than copying the file keeps these tests
    /// honest: they assert on what actually ships.
    /// </summary>
    private static JsonElement LoadAppSettings()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln) from the test binary.");

        var path = Path.Combine(dir!.FullName, "src", "AsianTaste.API", "appsettings.json");
        Assert.True(File.Exists(path), $"appsettings.json not found at {path}");

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.GetProperty("Payment").Clone();
    }

    [Fact]
    public void The_committed_default_is_the_real_gateway_not_the_mock()
    {
        // This is the assertion that would have caught the original bug. The mock
        // must never be the default, because the default is what production gets
        // when nobody sets an override.
        var payment = LoadAppSettings();

        Assert.False(
            payment.GetProperty("UseMockGateway").GetBoolean(),
            "appsettings.json enables the mock payment gateway by default. It applies to " +
            "production too, so a deployment without an explicit override would accept " +
            "every order unpaid. The mock must be opted into, never defaulted to.");
    }

    [Fact]
    public void Auto_approve_is_not_enabled_by_default_either()
    {
        // MockAutoApprove only matters when the mock is in use, but a true value
        // sitting in the shipped defaults is a trap for whoever turns the mock on
        // to test something.
        var payment = LoadAppSettings();

        Assert.False(payment.GetProperty("MockAutoApprove").GetBoolean());
    }

    [Fact]
    public void The_production_template_also_disables_the_mock()
    {
        // The template is what someone copies when setting up a new environment, so
        // it must not suggest the unsafe value.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        var template = Path.Combine(
            dir!.FullName, "src", "AsianTaste.API", "appsettings.Production.example");

        Assert.True(File.Exists(template), $"appsettings.Production.example not found at {template}");

        var text = File.ReadAllText(template);
        Assert.Contains("Payment__UseMockGateway=false", text);
        Assert.DoesNotContain("Payment__UseMockGateway=true", text);
    }

    [Fact]
    public void Program_refuses_to_start_the_mock_outside_development()
    {
        // The default is fixed, but a mistake in a secret could still enable the
        // mock in production. Program.cs must therefore refuse outright, which is
        // what makes this a guard rather than a convention.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        var program = File.ReadAllText(
            Path.Combine(dir!.FullName, "src", "AsianTaste.API", "Program.cs"));

        Assert.Contains("useMockGateway && !builder.Environment.IsDevelopment()", program);
        Assert.Contains("throw new InvalidOperationException", program);
    }
}
