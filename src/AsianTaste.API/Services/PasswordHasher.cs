using System.Security.Cryptography;

namespace AsianTaste.API.Services;

/// <summary>
/// PBKDF2 password hashing for customer accounts.
///
/// Extracted from CustomerService so the hashing contract can be tested directly.
/// The stored format is <c>{iterations}:{base64 salt}:{base64 hash}</c> and must
/// stay byte-compatible with hashes already in the database — accounts created
/// before this code was refactored must still be able to log in.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 10000;
    private const int SaltSize = 16;  // 128 bits
    private const int HashSize = 32;  // 256 bits
    private const char Separator = ':';

    /// <summary>Hashes a password into the stored format.</summary>
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return $"{Iterations}{Separator}{Convert.ToBase64String(salt)}{Separator}{Convert.ToBase64String(hash)}";
    }

    /// <summary>
    /// Verifies a password against a stored hash.
    /// Returns false for malformed or unsupported (legacy) hashes rather than throwing.
    /// </summary>
    public static bool Verify(string password, string? storedHash)
    {
        if (string.IsNullOrEmpty(storedHash))
        {
            return false;
        }

        try
        {
            var parts = storedHash.Split(Separator);
            if (parts.Length != 3)
            {
                // Legacy format — cannot be verified (the old implementation used a
                // random key per hash). Callers surface this as a failed login.
                return false;
            }

            var iterations = int.Parse(parts[0]);
            var salt = Convert.FromBase64String(parts[1]);
            var expected = Convert.FromBase64String(parts[2]);

            // A valid stored hash is exactly HashSize bytes. Deriving at
            // `expected.Length` instead would let a truncated hash verify: the
            // shorter derivation compares equal to its own prefix. Reject
            // anything that is not the full length.
            if (expected.Length != HashSize)
            {
                return false;
            }

            var computed = Rfc2898DeriveBytes.Pbkdf2(
                password,
                salt,
                iterations,
                HashAlgorithmName.SHA256,
                HashSize);

            return CryptographicOperations.FixedTimeEquals(expected, computed);
        }
        catch (FormatException)
        {
            return false;
        }
        catch (OverflowException)
        {
            return false;
        }
    }
}
