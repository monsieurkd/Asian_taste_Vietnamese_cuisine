using System.Reflection;
using AsianTaste.API.Repositories;
using Xunit;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Tests for the admin order-number search added in docs/TODO.md §9 item 5.
/// </summary>
/// <remarks>
/// The search term arrives straight from a query string, so the properties worth pinning are
/// (a) that it stays parameterised, and (b) that a wildcard typed into the box means a literal
/// character rather than a pattern that matches the whole table.
///
/// These read the repository's source rather than exercising a live database, because
/// <c>Repositories/*</c> have no integration-test strategy in this repo (see
/// <c>docs/GUARDRAILS.md</c>). That is a real limitation: this proves the query is *shaped*
/// correctly, not that Postgres returns the right rows. It is stated here rather than glossed
/// over, and the SQL-level behaviour is listed as an open gap in the TODO.
/// </remarks>
public class OrderNumberSearchTests
{
    private static string RepositorySource()
    {
        // Walk up from the test binary to the repo root; the source file is what we inspect.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.NotNull(dir);
        var path = Path.Combine(dir!.FullName, "src", "AsianTaste.API", "Repositories", "OrderRepository.cs");
        Assert.True(File.Exists(path), $"expected the repository source at {path}");
        return File.ReadAllText(path);
    }

    private static string MethodBody(string source, string signatureFragment)
    {
        var start = source.IndexOf(signatureFragment, StringComparison.Ordinal);
        Assert.True(start >= 0, $"could not find '{signatureFragment}' in OrderRepository.cs");

        // Take a generous window after the signature: the body plus the SQL literal.
        var end = Math.Min(source.Length, start + 4000);
        return source.Substring(start, end - start);
    }

    [Fact]
    public void The_Order_Number_Filter_Is_Parameterised_Not_Interpolated()
    {
        var body = MethodBody(RepositorySource(), "GetAllOrdersAsync(");

        // The parameter must be bound, not concatenated into the SQL.
        Assert.Contains("@OrderNumberPattern", body);
        Assert.Contains("parameters.Add(\"OrderNumberPattern\"", body);

        // And it must appear in the WHERE clause as a parameter reference.
        Assert.Contains("order_number ILIKE @OrderNumberPattern", body);
    }

    [Fact]
    public void The_Order_Number_Filter_Declares_Its_Escape_Character()
    {
        // Without ESCAPE, an escaped backslash in the parameter is not honoured by Postgres,
        // so The_Escaping_Helper_Escapes_Wildcards below would be asserting something the
        // database does not actually do.
        var body = MethodBody(RepositorySource(), "GetAllOrdersAsync(");
        Assert.Contains("ESCAPE '\\'", body);
    }

    [Fact]
    public void The_Order_Number_Filter_Is_Optional()
    {
        // An absent or blank term must not add a condition — otherwise every unfiltered
        // request would run a pointless ILIKE over the whole table.
        var body = MethodBody(RepositorySource(), "GetAllOrdersAsync(");
        Assert.Contains("string.IsNullOrWhiteSpace(orderNumber)", body);
    }

    [Theory]
    [InlineData("50%", "50\\%")]
    [InlineData("a_b", "a\\_b")]
    [InlineData("100%_x", "100\\%\\_x")]
    public void The_Escaping_Helper_Escapes_Wildcards(string input, string expected)
    {
        var method = typeof(OrderRepository).GetMethod(
            "EscapeLikePattern",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        var actual = (string)method!.Invoke(null, new object[] { input })!;
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void The_Escaping_Helper_Escapes_The_Escape_Character_First()
    {
        // Order matters: escaping the backslash last would double-escape the wildcards added
        // before it, and the pattern would stop matching what the user typed.
        var method = typeof(OrderRepository).GetMethod(
            "EscapeLikePattern",
            BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        var actual = (string)method!.Invoke(null, new object[] { @"\" })!;
        Assert.Equal(@"\\", actual);
    }

    [Fact]
    public void A_Bare_Wildcard_Is_Neutralised_So_It_Cannot_Match_Everything()
    {
        var method = typeof(OrderRepository).GetMethod(
            "EscapeLikePattern",
            BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        // A lone '%' is the case that would otherwise return the entire orders table.
        var actual = (string)method!.Invoke(null, new object[] { "%" })!;
        Assert.Equal("\\%", actual);
        Assert.NotEqual("%", actual);
    }

    [Fact]
    public void An_Ordinary_Term_Is_Left_Alone()
    {
        var method = typeof(OrderRepository).GetMethod(
            "EscapeLikePattern",
            BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        var actual = (string)method!.Invoke(null, new object[] { "AT-20260312-0042" })!;
        Assert.Equal("AT-20260312-0042", actual);
    }
}
