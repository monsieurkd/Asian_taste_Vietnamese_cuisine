using System.Security.Cryptography;
using AsianTaste.API.Services;

namespace AsianTaste.API.Tests.Services;

public class EncryptionServiceTests
{
    private static EncryptionService CreateService() =>
        new(EncryptionService.GenerateNewKey());

    [Fact]
    public void Encrypt_Then_Decrypt_Returns_Original_Value()
    {
        var service = CreateService();
        const string plainText = "lightspeed-oauth-token-abc123";

        var cipherText = service.Encrypt(plainText);

        Assert.Equal(plainText, service.Decrypt(cipherText));
    }

    [Fact]
    public void Encrypt_Produces_Different_CipherText_Each_Call()
    {
        var service = CreateService();

        var first = service.Encrypt("same-input");
        var second = service.Encrypt("same-input");

        // Random nonce per call means ciphertext must differ, yet both decrypt.
        Assert.NotEqual(first, second);
        Assert.Equal("same-input", service.Decrypt(first));
        Assert.Equal("same-input", service.Decrypt(second));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Encrypt_Returns_Empty_For_Empty_Input(string? input)
    {
        var service = CreateService();

        Assert.Equal(string.Empty, service.Encrypt(input!));
    }

    [Fact]
    public void Decrypt_Throws_When_CipherText_Tampered()
    {
        var service = CreateService();
        var cipherText = service.Encrypt("tamper-me");

        var bytes = Convert.FromBase64String(cipherText);
        bytes[^1] ^= 0xFF; // flip a bit in the ciphertext
        var tampered = Convert.ToBase64String(bytes);

        Assert.ThrowsAny<CryptographicException>(() => service.Decrypt(tampered));
    }

    [Fact]
    public void Constructor_Throws_For_Empty_Key()
    {
        Assert.Throws<ArgumentException>(() => new EncryptionService(""));
    }

    [Fact]
    public void Constructor_Throws_For_Wrong_Key_Size()
    {
        // 128-bit key is valid base64 but wrong size for AES-256.
        var shortKey = Convert.ToBase64String(new byte[16]);

        Assert.Throws<ArgumentException>(() => new EncryptionService(shortKey));
    }

    [Fact]
    public void GenerateNewKey_Returns_256_Bit_Key()
    {
        var key = EncryptionService.GenerateNewKey();

        Assert.Equal(32, Convert.FromBase64String(key).Length);
    }
}
