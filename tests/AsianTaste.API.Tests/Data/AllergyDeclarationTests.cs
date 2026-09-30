using System.Reflection;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards that an allergy declaration has a route all the way to the kitchen.
///
/// Context: an "Allergy" option group was seeded into <c>modifier_groups</c> in
/// migration 13 for the dishes where it matters, and it has never been reachable — the
/// customer app builds a dish's options from a printed-menu table that contains no
/// allergy group, so the seeded one cannot be selected by anybody. The practical effect
/// was that an allergy could only reach the kitchen if a customer typed it into the
/// free-text order note, which they mostly do not, because nothing asks.
///
/// The fix is a field plus two renderings, and the failure mode of getting any one of
/// them wrong is silent: the column exists, the value is null, and the ticket shows
/// nothing. So these tests assert on the ROUTE rather than on any single piece:
///
///   request DTO → order INSERT → admin list query → admin detail query
///
/// A break anywhere in that chain is invisible from the outside, which is exactly why
/// it needs pinning rather than trusting.
/// </summary>
public class AllergyDeclarationTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln).");
        return dir!.FullName;
    }

    private static string Read(string relativePath)
    {
        var path = Path.Combine(RepoRoot(), relativePath);
        Assert.True(File.Exists(path), $"{relativePath} not found");
        return File.ReadAllText(path);
    }

    // ── The request can carry one ────────────────────────────────────────────

    [Fact]
    public void The_checkout_request_has_its_own_allergy_field()
    {
        // Not folded into SpecialInstructions: the API stores them in different columns,
        // and the kitchen renders them differently. One field on the wire would undo
        // that at the first hop.
        var dto = Read("src/AsianTaste.API/Models/DTOs/CheckoutDto.cs");

        Assert.Contains("AllergyDeclaration", dto);
        Assert.Contains("public string? SpecialInstructions", dto);
    }

    // ── It reaches the database ──────────────────────────────────────────────

    [Fact]
    public void The_order_insert_persists_the_allergy()
    {
        var repository = Read("src/AsianTaste.API/Repositories/OrderRepository.cs");

        Assert.Contains("allergy_declaration", repository);
        Assert.Contains("AllergyDeclaration = request.AllergyDeclaration", repository);
    }

    [Fact]
    public void Editing_an_order_cannot_wipe_the_allergy()
    {
        // UpdateOrderAsync writes a fixed SET list. If the column is not in it, every
        // edit saves `allergy_declaration = NULL` — an order edited for an unrelated
        // reason silently loses the one piece of information that is a safety matter.
        var repository = Read("src/AsianTaste.API/Repositories/OrderRepository.cs");

        Assert.Contains("allergy_declaration = @AllergyDeclaration", repository);
    }

    // ── The kitchen can see it ───────────────────────────────────────────────

    [Fact]
    public void The_admin_detail_query_selects_the_allergy()
    {
        var repository = Read("src/AsianTaste.API/Repositories/OrderRepository.cs");

        Assert.Contains("allergy_declaration as AllergyDeclaration", repository);
    }

    [Fact]
    public void The_kitchen_board_query_selects_the_allergy_too()
    {
        // The board is where a cook chooses what to start next. An allergy visible only
        // after opening the ticket is one they have already begun cooking without.
        var repository = Read("src/AsianTaste.API/Repositories/OrderRepository.cs");
        var body = MethodBody(repository, "GetAllOrdersAsync(");

        Assert.Contains("allergy_declaration as AllergyDeclaration", body);
    }

    [Fact]
    public void The_detail_dto_exposes_it()
    {
        var dto = Read("src/AsianTaste.API/Models/DTOs/AdminOrderDetailDto.cs");
        Assert.Contains("AllergyDeclaration", dto);
    }

    [Fact]
    public void The_list_dto_exposes_it()
    {
        var dto = Read("src/AsianTaste.API/Models/DTOs/AdminOrderListDto.cs");
        Assert.Contains("AllergyDeclaration", dto);
    }

    // ── The column is declared ───────────────────────────────────────────────

    [Fact]
    public void A_migration_adds_the_column()
    {
        var sql = Read("src/AsianTaste.API/Data/Migrations/15_add_allergy_declaration.sql");

        Assert.Contains("ADD COLUMN IF NOT EXISTS allergy_declaration", sql);
        // Text, not an enum: an allergy list that cannot express the customer's actual
        // allergy is worse than no list.
        Assert.Contains("allergy_declaration TEXT", sql);
    }

    [Fact]
    public void The_migration_runs_before_the_admin_seed()
    {
        // Ordering matters: this is a data-shaped migration and the initializer runs
        // scripts in a fixed sequence. A stray placement would either skip it or run it
        // against a table that does not exist yet.
        var initializer = Read("src/AsianTaste.API/Data/DatabaseInitializationService.cs");

        var allergyAt = initializer.IndexOf("15_add_allergy_declaration.sql", StringComparison.Ordinal);
        var seedAt = initializer.IndexOf("SeedAdminUserAsync(adminUserNeedsSeeding", StringComparison.Ordinal);

        Assert.True(allergyAt > 0, "Migration 15 is not wired into the initializer.");
        Assert.True(seedAt > 0, "The admin seed step was not found.");
        Assert.True(allergyAt < seedAt, "Migration 15 must run before the admin seed step.");
    }

    /// <summary>Extracts one method body, so an assertion cannot leak across queries.</summary>
    private static string MethodBody(string source, string signature)
    {
        var start = source.IndexOf(signature, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Method not found: {signature}");

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

        throw new InvalidOperationException($"Unbalanced braces in {signature}");
    }
}
