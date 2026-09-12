using System.Text.RegularExpressions;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Guards the menu seed's idempotency.
///
/// Regression context: <c>02_seed_data.sql</c> ran on every application start
/// (<c>DatabaseInitializationService.InitializeAsync</c>). The categories INSERT
/// carried <c>ON CONFLICT (id) DO NOTHING</c>, but the menu_items INSERT did not
/// — and it supplies no <c>id</c>, so there was nothing to conflict on anyway.
/// Every restart appended all 82 dishes again under fresh ids: the customer menu
/// rendered each dish twice, and re-visiting a dish sent you to a different
/// row than the one you opened before.
///
/// These tests read the embedded migration as text and check the exact clauses
/// that make it re-runnable, so the bug cannot come back unnoticed. A text
/// assertion is the right tool here: the defect is a missing SQL clause, and
/// asserting on it needs no database.
/// </summary>
public class MenuSeedIdempotencyTests
{
    private const string Migrations = "AsianTaste.API.Data.Migrations.";

    private static string LoadMigration(string fileName)
    {
        var assembly = typeof(AsianTaste.API.Data.DatabaseInitializationService).Assembly;
        var resource = Migrations + fileName;

        using var stream = assembly.GetManifestResourceStream(resource)
            ?? throw new FileNotFoundException(
                $"Migration '{resource}' is not embedded. Available: " +
                string.Join(", ", assembly.GetManifestResourceNames()));

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static string LoadSeedSql() => LoadMigration("02_seed_data.sql");

    /// <summary>
    /// Splits a migration into its executable statements, dropping comments.
    ///
    /// A trimmed copy of <c>DatabaseInitializationService.SplitSqlStatements</c>,
    /// kept separate on purpose: that one is private implementation detail, and a
    /// test that read it via reflection would break every time it is refactored.
    /// What matters here is the statement text, not the exact splitter.
    /// </summary>
    private static IEnumerable<string> SplitStatements(string sql)
    {
        // Strip line comments, then split on semicolons.
        var withoutComments = string.Join(
            '\n',
            sql.Split('\n').Select(line =>
            {
                var at = line.IndexOf("--", StringComparison.Ordinal);
                return at >= 0 ? line[..at] : line;
            }));

        return withoutComments
            .Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 0);
    }

    /// <summary>
    /// The initializer's own source. Some defects here — the order the scripts
    /// run in, whether the seed is gated behind a first-run flag — are decisions
    /// the SQL cannot express, so they are asserted against the C# that makes them.
    /// </summary>
    private static string InitializeServiceSource => File.ReadAllText(
        Path.Combine(FindRepoRoot(), "src", "AsianTaste.API", "Data", "DatabaseInitializationService.cs"));

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AsianTaste.sln")))
        {
            dir = dir.Parent;
        }

        Assert.True(dir is not null, "Could not locate the repo root (AsianTaste.sln) from the test binary.");
        return dir!.FullName;
    }

    /// <summary>
    /// Extracts one statement by matching from a marker to the terminating
    /// semicolon, so assertions target a single statement rather than the file.
    /// </summary>
    private static string StatementStartingWith(string sql, string marker)
    {
        var start = sql.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Seed script no longer contains a statement starting with '{marker}'.");

        var end = sql.IndexOf(';', start);
        Assert.True(end > start, $"Statement starting with '{marker}' has no terminating semicolon.");

        return sql[start..end];
    }

    [Fact]
    public void MenuItems_Insert_Has_An_On_Conflict_Clause()
    {
        // Without ON CONFLICT the INSERT appends duplicate dishes every start.
        // This is the exact assertion that fails on the buggy seed.
        var insert = StatementStartingWith(LoadSeedSql(), "INSERT INTO menu_items");

        Assert.Matches(@"ON\s+CONFLICT\s*\([^)]*name[^)]*\)\s+DO\s+NOTHING", insert);
    }

    [Fact]
    public void Categories_Insert_Still_Has_An_On_Conflict_Clause()
    {
        // The categories INSERT was already guarded; keep it that way.
        var insert = StatementStartingWith(LoadSeedSql(), "INSERT INTO categories");

        Assert.Matches(@"ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING", insert);
    }

    [Fact]
    public void Every_Insert_Into_A_Seeded_Table_Is_Conflict_Guarded()
    {
        // A statement that inserts without a conflict target is a re-run hazard,
        // even if today's data happens to survive it. Fail on the class, not the
        // instance.
        var sql = LoadSeedSql();
        var inserts = Regex.Matches(sql, @"INSERT\s+INTO\s+(\w+)[\s\S]*?;");

        Assert.NotEmpty(inserts);
        foreach (Match insert in inserts)
        {
            var table = insert.Groups[1].Value;
            Assert.True(
                Regex.IsMatch(insert.Value, @"ON\s+CONFLICT"),
                $"Seed statement INSERT INTO {table} has no ON CONFLICT clause, " +
                "so re-running the seed will duplicate rows.");
        }
    }

    [Fact]
    public void Sequences_Are_Repaired_After_Explicit_Id_Inserts()
    {
        // The categories INSERT supplies explicit ids, which does not advance the
        // serial sequence. If the sequence is left behind, the next generated id
        // collides with an existing row (a 23505 on insert). setval fixes it.
        //
        // menu_items needs no setval: it supplies no id, so the sequence is the
        // only thing that ever assigns one. MenuSeedIdempotencyTests' sibling
        // MenuRepository guarantees the pool stays consistent via migration 11.
        var sql = LoadSeedSql();

        Assert.Contains("setval('categories_id_seq'", sql);
        Assert.DoesNotContain("menu_items_id_seq", sql);
    }

    [Fact]
    public void The_Repoint_And_Delete_Statements_Target_The_Same_Duplicate_Rows()
    {
        // The bug this guards, which is the same order-corruption class as the missing
        // `WHERE oi.menu_item_id = dup.id`:
        //
        // Migration 11 repoints order lines and modifier groups off the rows it is
        // about to delete. If the repoint's target set is WIDER than the delete's, an
        // order line can be moved onto a row that survives but is a different dish —
        // silently rewriting what the customer bought. If it is NARROWER, a reference
        // is left pointing at a deleted row and the DELETE aborts on the FK.
        //
        // Two conditions make the sets identical, and both regressions are easy to
        // introduce one clause at a time, so they are asserted explicitly:
        //   * the direction: the DELETE keeps the lowest id (`keep.id < dup.id`), so
        //     the repoint must only ever move rows ABOVE the survivor (`dup.id >
        //     d.keep_id`). `dup.id <> d.keep_id` is NOT equivalent — it also matches
        //     rows above, which the delete then removes too.
        //   * the twin comparison: a non-twin that shares a name must not be a repoint
        //     source, because it is not a row the delete will remove.
        // Comments explain the rule and therefore also contain the pattern, so the
        // assertions run against executable statements only. Comments are stripped
        // BEFORE whitespace is collapsed — collapsing first would leave no line
        // boundaries to strip by.
        var statements = Regex.Replace(
            string.Join(
                '\n',
                LoadMigration("11_dedupe_menu_items.sql")
                    .Split('\n')
                    .Where(line => !line.TrimStart().StartsWith("--", StringComparison.Ordinal))),
            @"\s+",
            " ");

        // Every statement that touches duplicate rows moves only rows above the
        // survivor: the order_items repoint, the modifier_groups repoint, and the
        // Lightspeed carry-over. A `<>` here is the regression — it also matches
        // rows ABOVE the survivor, which the delete then removes too.
        Assert.Equal(3, Regex.Matches(statements, @"dup\.id > d\.keep_id").Count);
        Assert.DoesNotContain("dup.id <> d.keep_id", statements);
        Assert.DoesNotContain("dup.id <> src.id", statements);

        // BOTH repoints must carry the full twin predicate, not just the first one.
        // Checking only order_items is how the modifier_groups gap survived an
        // earlier round: it had the direction but not the comparison, so a surviving
        // same-named-but-different dish had its option set re-parented onto the twin.
        var repointStart = statements.IndexOf("UPDATE order_items oi", StringComparison.Ordinal);
        var modifierStart = statements.IndexOf("UPDATE modifier_groups mg", StringComparison.Ordinal);
        var deleteStart = statements.IndexOf("DELETE FROM menu_items dup", StringComparison.Ordinal);
        Assert.True(
            repointStart >= 0 && modifierStart > repointStart && deleteStart > modifierStart,
            "Could not locate the order_items repoint, the modifier_groups repoint and the delete in that order.");

        var twinColumns = new[]
        {
            "base_price", "description", "is_available", "is_popular",
            "is_gluten_free", "is_vegetarian", "is_vegan", "spicy_level",
        };

        foreach (var (name, body) in new[]
                 {
                     ("order_items", statements[repointStart..modifierStart]),
                     ("modifier_groups", statements[modifierStart..deleteStart]),
                 })
        {
            Assert.Contains("IS NOT DISTINCT FROM", body);
            foreach (var column in twinColumns)
            {
                Assert.True(
                    body.Contains($"dup.{column}", StringComparison.Ordinal),
                    $"The {name} repoint is missing the '{column}' twin comparison, so it can move a " +
                    "reference onto a dish that is not the one it was ordered from.");
            }
        }

        // The DELETE must carry the same predicate, and this is the assertion that
        // used to be too weak: it only checked the bare literal `keep.id < dup.id`,
        // which the old "is there ANY lower row" version also contained. Dropping the
        // delete's twin comparison entirely would widen it past the repoint set, so
        // order_items would reference a row the delete removes and migration 11 would
        // abort with 23503 — and every assertion above would still pass. So the
        // delete's body is sliced and checked the same way as the repoints.
        var deleteBody = statements[deleteStart..];

        Assert.Contains("keep.id < dup.id", deleteBody);
        Assert.Contains("SELECT MIN(id) AS keep_id", deleteBody);
        Assert.Contains("keep.id = d.keep_id", deleteBody);

        foreach (var column in twinColumns)
        {
            Assert.True(
                deleteBody.Contains($"keep.{column} IS NOT DISTINCT FROM dup.{column}", StringComparison.Ordinal)
                || deleteBody.Contains($"keep.{column} = dup.{column}", StringComparison.Ordinal),
                $"The delete is missing the '{column}' twin comparison, so it can remove a row that " +
                "no repoint covered — leaving a reference to a deleted row.");
        }
    }

    [Fact]
    public void The_Sequence_Repair_Sets_The_Next_Value_Not_The_Last()
    {
        // setval(seq, n) makes the NEXT nextval() return n + 1, so calling it with
        // the row count is off by one. On a fresh database migration 11 runs before
        // the seed, against an empty table, so COALESCE(MAX(id), 1) yielded 1 and the
        // first dish landed on id 2 — every id in a fresh install shifted by one, and
        // a bookmarked /menu/item/1 pointed at a different dish than on a known-good
        // database.
        //
        // The third argument is the fix: is_called => false makes nextval() return n
        // itself, so an empty table hands out 1 and a populated one hands out
        // MAX(id) + 1 (the first unused id).
        var migration = LoadMigration("11_dedupe_menu_items.sql");

        // Match on the statement's semantics, not its formatting: the call spans
        // several lines, so compare a whitespace-collapsed copy.
        var collapsed = Regex.Replace(migration, @"\s+", " ");

        Assert.Contains("setval( 'menu_items_id_seq'", collapsed);
        Assert.Contains("COALESCE((SELECT MAX(id) FROM menu_items), 0) + 1", collapsed);

        // The third argument is the whole point: without it, nextval() returns n + 1.
        Assert.Contains("+ 1, false )", collapsed);
    }

    [Fact]
    public void Duplicate_Menu_Items_Cannot_Be_Inserted_By_The_Database()
    {
        // The seed's ON CONFLICT needs a unique index to arbitrate against.
        // Without one the clause is a no-op and the duplicates return.
        //
        // The index deliberately lives in migration 12, NOT in 01_create_schema.sql:
        // the schema script runs before the seed, so on a database that already
        // accumulated duplicates the CREATE UNIQUE INDEX would abort the entire
        // script and the API would not start. 11 de-duplicates, the seed rebuilds,
        // and 12 asserts the invariant — so this test checks migration 12.
        var migration = LoadMigration("12_add_natural_key_indexes.sql");

        Assert.Matches(
            @"UNIQUE\s+INDEX[\s\S]{0,80}ux_menu_items_name_category[\s\S]{0,80}\(\s*name\s*,\s*category_id\s*\)",
            migration);
    }

    [Fact]
    public void The_Schema_Script_Does_Not_Create_The_Natural_Key_Indexes()
    {
        // The guard for the failure above: if someone moves these back into the
        // schema to "tidy up", startup breaks again on any database that still
        // holds duplicates — and it breaks the whole script, not just one index.
        //
        // Asserted on the statements, not the raw text: the schema *explains* in a
        // comment why the indexes are absent, and a guard that trips over its own
        // documentation would be worse than no guard.
        var creatingStatements = SplitStatements(LoadMigration("01_create_schema.sql"))
            .Where(s => s.Contains("CREATE UNIQUE INDEX", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.DoesNotContain(creatingStatements, s => s.Contains("ux_menu_items_name_category"));
        Assert.DoesNotContain(creatingStatements, s => s.Contains("ux_categories_name"));
    }

    [Fact]
    public void The_Seed_Is_Additive_And_Nothing_On_The_Startup_Path_Truncates()
    {
        // This test used to assert the opposite — that the seed TRUNCATEd the menu
        // tables — because rebuilding looked like the way to repair already-duplicated
        // data. It is not, and the cost was real:
        //
        //   TRUNCATE menu_items CASCADE also truncates order_items
        //   (order_items.menu_item_id references menu_items, and TRUNCATE CASCADE
        //   ignores the FK's delete action). InitializeAsync runs on every start,
        //   so every restart deleted the order history — 34 order_items went to 0.
        //
        // Repairing duplicates is migration 11's job, and it deletes only the
        // redundant rows. So the assertion is now that no destructive statement
        // appears on the startup path at all.
        // Scoped to the STARTUP path, not the whole file. ResetDatabaseAsync drops
        // every table by design, and it is only reachable from the explicit
        // POST /api/dev/db/reset endpoint — never from InitializeAsync, which runs
        // on every boot. Conflating the two is what hid the bug: a destructive
        // statement is fine behind a dev endpoint and catastrophic on startup.
        var startup = InitializeBody();

        Assert.DoesNotContain("TRUNCATE", startup, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", startup, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM", startup, StringComparison.OrdinalIgnoreCase);

        // The repair that does delete is migration 11, and it is scoped to the
        // redundant rows only — verified by hand and by the checks below.
        Assert.Contains("11_dedupe_menu_items.sql", startup);
        Assert.Contains("ApplyMenuSeedAsync", startup);
    }

    [Fact]
    public void No_Seeded_Script_Deletes_Anything()
    {
        // The scan above only reads the C# startup body, but the destructive
        // statement that caused all of this lived in the SEED SQL, which
        // ApplyMenuSeedAsync runs on that same startup path. Putting a TRUNCATE or
        // DELETE back into 02 would therefore pass every other test in this file.
        //
        // 02_seed_data.sql is the one script that runs on every boot, so it is the
        // one that must stay additive. (11 and 12 delete by design, but 11's deletes
        // are scoped to exact duplicates and 12 only creates indexes.)
        var seed = Regex.Replace(
            string.Join(
                '\n',
                LoadSeedSql()
                    .Split('\n')
                    .Where(line => !line.TrimStart().StartsWith("--", StringComparison.Ordinal))),
            @"\s+",
            " ");

        Assert.DoesNotContain("TRUNCATE", seed, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM", seed, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP ", seed, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void The_Menu_Is_DeDuplicated_Before_It_Is_Seeded()
    {
        // The ordering that makes the fix possible, and the one that broke twice
        // while writing it:
        //
        //   schema -> 11 de-duplicate -> 02 seed -> 04-10 -> 12 natural keys
        //
        // The seed conflicts on (name, category_id), and ON CONFLICT cannot be
        // used at all until that unique index exists — but the index cannot be
        // created while duplicate dishes are still present. So the duplicates must
        // go first. Seeding before 11 fails outright with SQLSTATE 42P10, "there
        // is no unique or exclusion constraint matching the ON CONFLICT
        // specification", and the API refuses to start.
        var initialize = InitializeBody();

        var dedupeAt = initialize.IndexOf("11_dedupe_menu_items.sql", StringComparison.Ordinal);
        var seedAt = initialize.IndexOf("ApplyMenuSeedAsync", StringComparison.Ordinal);
        // The full script run, i.e. the one that assigns to naturalKeysSql — not the
        // staged pre-seed call in step 3, which happens before the seed by design.
        var keysAt = initialize.IndexOf("naturalKeysSql", StringComparison.Ordinal);

        Assert.True(dedupeAt >= 0, "InitializeAsync no longer runs the de-duplication migration.");
        Assert.True(seedAt >= 0, "InitializeAsync no longer calls ApplyMenuSeedAsync.");
        Assert.True(keysAt >= 0, "InitializeAsync no longer creates the natural-key indexes.");

        Assert.True(dedupeAt < seedAt, "The menu must be de-duplicated before the seed runs; the seed's ON CONFLICT needs the unique index, which cannot exist while duplicates are present.");
        Assert.True(seedAt < keysAt, "The full natural-key script must run after the seed, so it does not assert a constraint the seed has not yet satisfied.");
    }

    [Fact]
    public void The_Index_The_Seed_Conflicts_On_Exists_Before_The_Seed_Runs()
    {
        // The tightest ordering constraint in the whole sequence, and the one that
        // broke most often while writing it:
        //
        //   remove duplicates (11) -> create ux_menu_items_name_category -> seed (02)
        //
        // ON CONFLICT is rejected outright until an index can arbitrate it
        // (SQLSTATE 42P10, "there is no unique or exclusion constraint matching the
        // ON CONFLICT specification"), so the seed cannot simply run last. But the
        // index cannot be created before the duplicates are gone (SQLSTATE 23505).
        // The index therefore has to be staged out of migration 12 and created
        // between the two.
        var initialize = InitializeBody();

        var dedupeAt = initialize.IndexOf("11_dedupe_menu_items.sql", StringComparison.Ordinal);
        var indexAt = initialize.IndexOf("KeepOnlyStatement(preSeedIndexSql", StringComparison.Ordinal);
        var seedAt = initialize.IndexOf("ApplyMenuSeedAsync", StringComparison.Ordinal);

        Assert.True(indexAt >= 0, "InitializeAsync no longer stages the seed's conflict index from migration 12.");
        Assert.True(dedupeAt < indexAt, "The seed's conflict index must be created after the duplicates are removed, or CREATE UNIQUE INDEX fails.");
        Assert.True(indexAt < seedAt, "The seed's conflict index must exist before the seed runs, or ON CONFLICT is rejected with SQLSTATE 42P10.");
    }

    [Fact]
    public void The_Natural_Key_Indexes_Are_Stripped_From_The_Schema_Script()
    {
        // CREATE UNIQUE INDEX in 01 would abort the whole schema script on any
        // database that still holds duplicates — the API would not start at all.
        // The initializer must therefore run the schema without them and add them
        // back in step 5.
        var initialize = InitializeBody();

        Assert.Contains("DropNaturalKeyIndexes(schemaSql)", initialize);

        // Presence of the call is not enough: the helper must actually filter the
        // statements out. Asserting on its body stops it silently becoming a no-op
        // that returns the script unchanged.
        var helper = InitializeServiceSource[
            InitializeServiceSource.IndexOf("private static string DropNaturalKeyIndexes", StringComparison.Ordinal)..
            InitializeServiceSource.IndexOf("private async Task ApplyMenuSeedAsync", StringComparison.Ordinal)];

        Assert.Contains("ux_menu_items_name_category", helper);
        Assert.Contains("ux_categories_name", helper);
        Assert.Contains("continue", helper);
    }

    [Fact]
    public void The_Remaining_Migrations_Run_After_The_Seed()
    {
        // The original ordering ran the seed DEAD LAST and gated it on
        // `!wasAlreadyInitialized`, which is true only on a fresh database. On
        // every restart migrations 04-11 therefore ran against a menu the seed had
        // not populated that round, so the de-duplication had nothing to work with.
        var initialize = InitializeBody();
        var seedAt = initialize.IndexOf("ApplyMenuSeedAsync", StringComparison.Ordinal);

        foreach (var laterStep in new[] { "04_create_lightspeed_tables.sql", "09_fix_adelaide_settings.sql" })
        {
            var stepAt = initialize.IndexOf(laterStep, StringComparison.Ordinal);
            Assert.True(stepAt >= 0, $"InitializeAsync no longer runs {laterStep}.");
            Assert.True(stepAt > seedAt, $"{laterStep} runs before the menu is seeded, so it works against an empty table.");
        }
    }

    /// <summary>
    /// The executable body of InitializeAsync — from its opening brace to the next
    /// member, with comments removed.
    ///
    /// Comments are stripped deliberately. The method documents the ordering, and
    /// it also names the statements it used to run in the wrong order; matching on
    /// raw text would find those mentions and report an order that is not the one
    /// the code executes.
    /// </summary>
    private static string InitializeBody()
    {
        var source = InitializeServiceSource;
        var start = source.IndexOf("public async Task InitializeAsync", StringComparison.Ordinal);
        Assert.True(start >= 0, "InitializeAsync not found in DatabaseInitializationService.");

        var body = source[start..source.IndexOf("public async Task ResetDatabaseAsync", StringComparison.Ordinal)];

        return string.Join(
            '\n',
            body.Split('\n').Select(line => line.TrimStart())
                .Where(line => !line.StartsWith("//", StringComparison.Ordinal)));
    }
}
