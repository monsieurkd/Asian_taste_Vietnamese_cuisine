using AsianTaste.API.Services.Payment;

namespace AsianTaste.API.Tests.Services.Payment;

public class StripeConfigurationTests
{
    [Fact]
    public void IsValid_Returns_False_When_Keys_Missing()
    {
        var config = new StripeConfiguration();

        Assert.False(config.IsValid());
    }

    [Fact]
    public void IsValid_Returns_True_When_Secret_And_Publishable_Set()
    {
        var config = new StripeConfiguration
        {
            SecretKey = "sk_test_example",
            PublishableKey = "pk_test_example",
        };

        Assert.True(config.IsValid());
    }

    [Theory]
    [InlineData("sk_test_abc", true)]
    [InlineData("sk_live_abc", false)]
    [InlineData("", false)]
    public void IsTestMode_Reflects_Key_Prefix(string secretKey, bool expected)
    {
        var config = new StripeConfiguration { SecretKey = secretKey };

        Assert.Equal(expected, config.IsTestMode());
    }

    [Fact]
    public void Currency_Defaults_To_Aud()
    {
        Assert.Equal("aud", new StripeConfiguration().Currency);
    }
}
