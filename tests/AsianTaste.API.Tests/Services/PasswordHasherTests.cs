using System.Security.Cryptography;
using AsianTaste.API.Services;

namespace AsianTaste.API.Tests.Services;

/// <summary>
/// Tests for PBKDF2 password hashing.
///
/// The critical guarantee is BACKWARD COMPATIBILITY: replacing the obsolete
/// Rfc2898DeriveBytes constructor calls with the static Pbkdf2 API must not
/// invalidate any password hash already stored in the database, or every
/// existing customer would be locked out.
/// </summary>
public class PasswordHasherTests
{
    [Fact]
    public void Hash_Then_Verify_Roundtrips()
    {
        var hash = PasswordHasher.Hash("correct horse battery staple");

        Assert.True(PasswordHasher.Verify("correct horse battery staple", hash));
    }

    [Fact]
    public void Verify_Rejects_Wrong_Password()
    {
        var hash = PasswordHasher.Hash("the-right-password");

        Assert.False(PasswordHasher.Verify("the-wrong-password", hash));
    }

    [Fact]
    public void Hash_Produces_Different_Salt_Each_Time()
    {
        var a = PasswordHasher.Hash("same-password");
        var b = PasswordHasher.Hash("same-password");

        Assert.NotEqual(a, b); // random salt
        Assert.True(PasswordHasher.Verify("same-password", a));
        Assert.True(PasswordHasher.Verify("same-password", b));
    }

    [Fact]
    public void Hash_Uses_The_Documented_Stored_Format()
    {
        var hash = PasswordHasher.Hash("format-check");
        var parts = hash.Split(':');

        Assert.Equal(3, parts.Length);
        Assert.Equal(10000, int.Parse(parts[0]));
        Assert.Equal(16, Convert.FromBase64String(parts[1]).Length); // 128-bit salt
        Assert.Equal(32, Convert.FromBase64String(parts[2]).Length); // 256-bit hash
    }

    [Fact]
    public void Verify_Accepts_A_Hash_Produced_By_The_Original_Algorithm()
    {
        // An independently computed hash in the legacy stored format, using the
        // same parameters the pre-refactor code used. If the refactor changed the
        // algorithm, this stops verifying and existing users cannot log in.
        const string password = "legacy-user-password";
        var salt = Convert.FromBase64String("3q2+7wAAAAAAAAAAAAAAAA=="); // fixed 16 bytes
        const int iterations = 10000;

        var expected = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, iterations, HashAlgorithmName.SHA256, 32);
        var stored = $"{iterations}:{Convert.ToBase64String(salt)}:{Convert.ToBase64String(expected)}";

        Assert.True(PasswordHasher.Verify(password, stored));
        Assert.False(PasswordHasher.Verify("not-the-password", stored));
    }

    [Fact]
    public void Verify_Honours_The_Iterations_Stored_In_The_Hash()
    {
        // Older accounts may carry a different iteration count. Verification must
        // read it from the stored value rather than assuming the current default.
        const string password = "older-account";
        var salt = RandomNumberGenerator.GetBytes(16);
        const int olderIterations = 5000;

        var hash = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, olderIterations, HashAlgorithmName.SHA256, 32);
        var stored = $"{olderIterations}:{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";

        Assert.True(PasswordHasher.Verify(password, stored));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-valid-hash")]
    [InlineData("only:two:parts:too:many")]
    [InlineData("abc:notbase64:notbase64")]
    public void Verify_Returns_False_For_Unusable_Stored_Hashes(string? stored)
    {
        // Must never throw: a malformed row means "login fails", not a 500.
        Assert.False(PasswordHasher.Verify("any-password", stored));
    }

    [Fact]
    public void Verify_Is_Not_Fooled_By_A_Truncated_Hash()
    {
        var hash = PasswordHasher.Hash("truncation-test");
        var parts = hash.Split(':');

        // Truncate the hash portion — the comparison must still fail.
        var truncatedHash = Convert.FromBase64String(parts[2])[..16];
        var tampered = $"{parts[0]}:{parts[1]}:{Convert.ToBase64String(truncatedHash)}";

        Assert.False(PasswordHasher.Verify("truncation-test", tampered));
    }
}
