using AsianTaste.API.Services.Email;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace AsianTaste.API.Tests.Services.Email;

/// <summary>
/// Tests the order confirmation email payload sent to SendGrid. Uses a stub
/// HttpMessageHandler so no network call is made.
/// </summary>
public class SendGridEmailServiceTests
{
    private static OrderConfirmationEmailModel SampleModel() => new()
    {
        OrderNumber = "AT-010100-ABCD",
        CustomerName = "Duc",
        OrderDate = new DateTime(2026, 9, 10, 12, 0, 0, DateTimeKind.Utc),
        EstimatedReadyTime = new DateTime(2026, 9, 10, 12, 20, 0, DateTimeKind.Utc),
        OrderType = "Pickup",
        PaymentMethod = "Card",
        Subtotal = 20.00m,
        Total = 20.00m,
        Items = new List<OrderItemEmailModel>
        {
            new() { Name = "Crispy Pork Roll", Quantity = 2, UnitPrice = 10.00m, TotalPrice = 20.00m },
        },
        RestaurantAddress = "329 Henley Beach Rd, Brooklyn Park SA 5032",
    };

    private static SendGridEmailService CreateService(CaptureHandler handler, bool enabled, string? apiKey)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SendGrid:Enabled"] = enabled.ToString(),
                ["SendGrid:ApiKey"] = apiKey,
                ["SendGrid:FromEmail"] = "orders@asiantaste.com.au",
                ["SendGrid:FromName"] = "Asian Taste Vietnamese Restaurant",
                ["App:BaseUrl"] = "http://localhost:5173",
            })
            .Build();

        var httpClient = new HttpClient(handler);
        return new SendGridEmailService(NullLogger<SendGridEmailService>.Instance, configuration, httpClient);
    }

    [Fact]
    public async Task Disabled_Service_Does_Not_Call_SendGrid_But_Reports_Success()
    {
        // With no API key (fresh clone), the service must not throw and must not
        // hit the network — emails are logged instead. Order flow must continue.
        var handler = new CaptureHandler();
        var service = CreateService(handler, enabled: false, apiKey: null);

        var result = await service.SendOrderConfirmationAsync(
            "customer@example.com", "Duc", SampleModel());

        Assert.True(result);
        Assert.Null(handler.LastRequestUri);
    }

    [Fact]
    public async Task Enabled_Service_Posts_To_SendGrid_With_Correct_Payload()
    {
        var handler = new CaptureHandler();
        var service = CreateService(handler, enabled: true, apiKey: "SG.test_key");

        var result = await service.SendOrderConfirmationAsync(
            "customer@example.com", "Duc", SampleModel());

        Assert.True(result);
        Assert.Equal("https://api.sendgrid.com/v3/mail/send", handler.LastRequestUri);
        Assert.Equal("Bearer SG.test_key", handler.LastAuthorization);

        var body = handler.LastRequestBody ?? string.Empty;
        Assert.Contains("customer@example.com", body);
        Assert.Contains("AT-010100-ABCD", body);
        Assert.Contains("Crispy Pork Roll", body);
        // Australian details must appear in the email
        Assert.Contains("329 Henley Beach Rd", body);
    }

    [Fact]
    public async Task SendGrid_Failure_Returns_False_Without_Throwing()
    {
        var handler = new CaptureHandler { StatusCode = System.Net.HttpStatusCode.InternalServerError };
        var service = CreateService(handler, enabled: true, apiKey: "SG.test_key");

        var result = await service.SendOrderConfirmationAsync(
            "customer@example.com", "Duc", SampleModel());

        Assert.False(result);
    }

    private sealed class CaptureHandler : HttpMessageHandler
    {
        public string? LastRequestUri { get; private set; }
        public string? LastRequestBody { get; private set; }
        public string? LastAuthorization { get; private set; }
        public System.Net.HttpStatusCode StatusCode { get; set; } = System.Net.HttpStatusCode.Accepted;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequestUri = request.RequestUri?.ToString();
            LastAuthorization = request.Headers.Authorization?.ToString();
            LastRequestBody = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(StatusCode);
        }
    }
}
