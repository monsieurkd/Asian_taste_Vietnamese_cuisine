using System.Security.Cryptography;
using System.Text;

namespace AsianTaste.API.Services;

/// <summary>
/// Service for encrypting and decrypting sensitive data (OAuth tokens).
/// Uses AES-256-GCM for authenticated encryption.
/// </summary>
public interface IEncryptionService
{
    /// <summary>Encrypts plain text data.</summary>
    string Encrypt(string plainText);

    /// <summary>Decrypts encrypted data.</summary>
    string Decrypt(string cipherText);
}

/// <summary>
/// AES-256-GCM implementation for data encryption.
/// </summary>
public class EncryptionService : IEncryptionService
{
    private readonly byte[] _key;
    private const int KeySize = 256; // bits
    private const int TagSize = 128; // bits (authentication tag)
    private const int NonceSize = 96; // bits (IV/nonce)

    /// <summary>
    /// Initializes the encryption service with a key from configuration.
    /// </summary>
    /// <param name="encryptionKey">Base64-encoded 256-bit encryption key.</param>
    public EncryptionService(string encryptionKey)
    {
        if (string.IsNullOrWhiteSpace(encryptionKey))
        {
            throw new ArgumentException("Encryption key cannot be null or empty.", nameof(encryptionKey));
        }

        _key = Convert.FromBase64String(encryptionKey);

        if (_key.Length * 8 != KeySize)
        {
            throw new ArgumentException($"Encryption key must be {KeySize} bits.", nameof(encryptionKey));
        }
    }

    public string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            return string.Empty;

        var nonce = new byte[NonceSize / 8];
        RandomNumberGenerator.Fill(nonce);

        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = new byte[plainBytes.Length];

        var tag = new byte[TagSize / 8];

        using var aes = new AesGcm(_key, TagSize / 8);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        // Combine nonce, tag, and ciphertext for storage
        var result = new byte[nonce.Length + tag.Length + cipherBytes.Length];
        Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, result, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, nonce.Length + tag.Length, cipherBytes.Length);

        return Convert.ToBase64String(result);
    }

    public string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText))
            return string.Empty;

        var cipherBytes = Convert.FromBase64String(cipherText);

        var nonceSize = NonceSize / 8;
        var tagSize = TagSize / 8;

        if (cipherBytes.Length < nonceSize + tagSize)
            throw new CryptographicException("Invalid cipher text length.");

        var nonce = new byte[nonceSize];
        var tag = new byte[tagSize];
        var cipher = new byte[cipherBytes.Length - nonceSize - tagSize];

        Buffer.BlockCopy(cipherBytes, 0, nonce, 0, nonceSize);
        Buffer.BlockCopy(cipherBytes, nonceSize, tag, 0, tagSize);
        Buffer.BlockCopy(cipherBytes, nonceSize + tagSize, cipher, 0, cipher.Length);

        var plainBytes = new byte[cipher.Length];

        using var aes = new AesGcm(_key, TagSize / 8);
        aes.Decrypt(nonce, cipher, tag, plainBytes);

        return Encoding.UTF8.GetString(plainBytes);
    }

    /// <summary>
    /// Generates a new random encryption key.
    /// Use this to create a key for production environments.
    /// </summary>
    public static string GenerateNewKey()
    {
        var key = new byte[KeySize / 8];
        RandomNumberGenerator.Fill(key);
        return Convert.ToBase64String(key);
    }
}
