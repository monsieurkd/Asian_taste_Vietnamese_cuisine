using System.Reflection;
using System.Data;
using System.Text;
using Dapper;
using Npgsql;
using Microsoft.Extensions.Logging;

namespace AsianTaste.API.Data;

/// <summary>
/// Service for database initialization and migration management.
/// </summary>
public interface IDatabaseInitializationService
{
    /// <summary>Initialize database schema if not exists.</summary>
    Task InitializeAsync(CancellationToken cancellationToken = default);

    /// <summary>Check if database schema exists.</summary>
    Task<bool> IsDatabaseInitializedAsync(CancellationToken cancellationToken = default);

    /// <summary>Reset database (drop and recreate all tables).</summary>
    Task ResetDatabaseAsync(CancellationToken cancellationToken = default);

    /// <summary>Seed database with initial menu data.</summary>
    Task SeedAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// PostgreSQL implementation of database initialization service.
/// </summary>
public class DatabaseInitializationService : IDatabaseInitializationService
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<DatabaseInitializationService> _logger;

    public DatabaseInitializationService(IDbConnectionFactory connectionFactory, ILogger<DatabaseInitializationService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<bool> IsDatabaseInitializedAsync(CancellationToken cancellationToken = default)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        // Check if categories table exists
        var result = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'categories'");

        return result > 0;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var wasAlreadyInitialized = await IsDatabaseInitializedAsync();

        // Whether the admin user needs seeding is decided by whether the ROW is
        // missing, not by whether the database looks new.
        //
        // Gating on `!wasAlreadyInitialized` alone has a trap: the flag is read
        // here, but step 1 creates `categories` in its own committed transaction.
        // If a first boot dies after step 1, every retry sees "already initialized",
        // skips 03_create_admin_user.sql, and the database never gets an admin —
        // permanently, and silently. Asking the table directly is both correct on a
        // retry and still honours the security intent: an operator who deliberately
        // deletes the default account does not get it back.
        var adminUserNeedsSeeding = await AdminUserIsMissingAsync(cancellationToken);

        // The order below is the whole fix, so it is worth stating plainly.
        //
        // The menu duplicated itself because 02_seed_data.sql ran on every start
        // with an unguarded menu_items INSERT. Three things had to be true at once
        // to stop it, and their order is forced:
        //
        //   schema -> de-duplicate -> seed (additive) -> remaining migrations
        //
        //   1. The schema must exist before anything writes to it.
        //   2. De-duplication must happen BEFORE the seed, and the unique index must
        //      exist before the seed too. The seed conflicts on (name, category_id),
        //      and ON CONFLICT is rejected outright until an index can arbitrate it
        //      (SQLSTATE 42P10). So the order is forced three ways:
        //
        //        remove duplicates (11) -> create the index -> seed (02)
        //
        //      Seeding before the index fails with 42P10; creating the index before
        //      removing duplicates fails with 23505. Both were hit while writing
        //      this, and both leave the API unable to start.
        //   3. The seed is then purely additive: it inserts only missing dishes.
        //      Repairing an already-duplicated database is migration 11's job, not
        //      the seed's — 11 deletes just the redundant rows. Nothing here
        //      deletes anything, because a delete on this path once took the order
        //      history with it (see ApplyMenuSeedAsync).
        //   4. Migrations 04-10 touch orders/payments/settings and must run once
        //      the tables they reference exist.

        // 1. Schema. The natural-key indexes are stripped: they cannot be created
        //    here, because a polluted database still holds the duplicates they
        //    forbid. Step 3 creates the seed's conflict index and step 6 the rest.
        var schemaSql = await GetMigrationScriptAsync("01_create_schema.sql");
        schemaSql = DropNaturalKeyIndexes(schemaSql);
        await ExecuteScriptAsync(schemaSql, cancellationToken);

        // 2. Remove duplicate menu_items and repoint every reference to them.
        //    Must precede the index creation, or CREATE UNIQUE INDEX fails on the
        //    duplicates that are still present.
        var dedupeMenuSql = await GetMigrationScriptAsync("11_dedupe_menu_items.sql");
        await ExecuteScriptAsync(dedupeMenuSql, cancellationToken);

        // 3. Create the index the seed conflicts on. Only ux_menu_items_name_category
        //    is needed this early; 12 adds ux_categories_name after everything has
        //    settled. This is the tightest point at which the index is both
        //    creatable (duplicates just removed) and required (the seed is next).
        var preSeedIndexSql = await GetMigrationScriptAsync("12_add_natural_key_indexes.sql");
        await ExecuteScriptAsync(
            KeepOnlyStatement(preSeedIndexSql, "ux_menu_items_name_category"),
            cancellationToken);

        // 4. Apply the curated seed. Purely additive and idempotent — it inserts
        //    only dishes that are missing, so it can never delete an order.
        //    (Only 02 runs here; 03 seeds the admin user last, once the migrations
        //    that touch admin_users have run.)
        if (!wasAlreadyInitialized)
        {
            _logger.LogInformation("Database was just created, seeding initial data...");
        }
        await ApplyMenuSeedAsync(cancellationToken);

        // 5. Migrations 04-10: orders, payments, webhooks, settings, dish images.
        var lightspeedSql = await GetMigrationScriptAsync("04_create_lightspeed_tables.sql");
        await ExecuteScriptAsync(lightspeedSql, cancellationToken);

        // Run payment and sync fields migration (Phase 2)
        var paymentSyncSql = await GetMigrationScriptAsync("05_add_payment_and_sync_fields.sql");
        await ExecuteScriptAsync(paymentSyncSql, cancellationToken);

        // Run Lightspeed product mapping migration (Phase 3)
        var productMappingSql = await GetMigrationScriptAsync("06_add_lightspeed_product_mapping.sql");
        await ExecuteScriptAsync(productMappingSql, cancellationToken);

        // Run webhook event log migration (Phase 4)
        var webhookLogSql = await GetMigrationScriptAsync("07_create_webhook_event_log.sql");
        await ExecuteScriptAsync(webhookLogSql, cancellationToken);

        // Run restaurant settings migration
        var settingsSql = await GetMigrationScriptAsync("08_create_restaurant_settings.sql");
        await ExecuteScriptAsync(settingsSql, cancellationToken);

        // Run Adelaide localisation + operating hours migration
        var adelaideSql = await GetMigrationScriptAsync("09_fix_adelaide_settings.sql");
        await ExecuteScriptAsync(adelaideSql, cancellationToken);

        // Clear unverified dish image references (see the migration header)
        var dishImagesSql = await GetMigrationScriptAsync("10_clear_unverified_dish_images.sql");
        await ExecuteScriptAsync(dishImagesSql, cancellationToken);

        // 6. Apply the full natural-key script. The menu_items index already exists
        //    from step 3; this is what adds ux_categories_name. Both use
        //    IF NOT EXISTS, so re-running the whole script is idempotent, and a
        //    failure here is a real inconsistency worth stopping the API for.
        var naturalKeysSql = await GetMigrationScriptAsync("12_add_natural_key_indexes.sql");
        await ExecuteScriptAsync(naturalKeysSql, cancellationToken);

        // 7. Seed the admin user, once every script that touches admin_users has
        //    run. Only when no admin row exists: this creates the documented default
        //    account, and recreating it unconditionally would undo an operator
        //    deleting it. (A database with NO admin at all is unusable, so that case
        //    does recreate the default — see SeedAdminUserAsync.)
        await SeedAdminUserAsync(adminUserNeedsSeeding, cancellationToken);
    }

    /// <summary>
    /// Returns only the statements that mention <paramref name="marker"/>.
    ///
    /// Used to stage migration 12: its menu_items index is needed before the seed
    /// while its categories index is not, and the two halves run at different
    /// points in InitializeAsync.
    /// </summary>
    private static string KeepOnlyStatement(string sql, string marker)
    {
        var kept = SplitSqlStatements(sql)
            .Where(statement => statement.Contains(marker))
            .ToArray();

        if (kept.Length == 0)
        {
            throw new InvalidOperationException(
                $"No statement in the script mentions '{marker}'. The migration was probably " +
                "renamed or restructured; update InitializeAsync to match.");
        }

        return string.Join(";\n\n", kept) + ";";
    }

    /// <summary>
    /// Removes the natural-key UNIQUE INDEX statements from the schema script.
    ///
    /// The schema cannot create them on every start: an existing database may
    /// still hold the duplicates the old unguarded seed produced, and CREATE
    /// UNIQUE INDEX would then abort the entire schema script. Step 2 removes those
    /// duplicates, step 3 creates the index the seed conflicts on, and step 6 adds
    /// the rest once the seed has run.
    ///
    /// Matched on the statement's own text rather than on a line number, so
    /// reformatting the migration does not silently drop the protection.
    /// </summary>
    private static string DropNaturalKeyIndexes(string sql)
    {
        var kept = new List<string>();
        foreach (var statement in SplitSqlStatements(sql))
        {
            if (statement.Contains("ux_menu_items_name_category") ||
                statement.Contains("ux_categories_name"))
            {
                continue;
            }
            kept.Add(statement);
        }

        return string.Join(";\n\n", kept) + ";";
    }

    /// <summary>
    /// Applies 02_seed_data.sql.
    ///
    /// This used to clear the menu tables first so a polluted database was
    /// rebuilt. That was a mistake and it is worth recording why, because
    /// "rebuild it from scratch" reads as the obviously-correct move:
    ///
    ///   `TRUNCATE menu_items CASCADE` also truncates order_items, because
    ///   order_items.menu_item_id references menu_items and TRUNCATE CASCADE
    ///   ignores the FK's delete action. Since InitializeAsync runs on every
    ///   start, every restart silently deleted the order history — it took
    ///   34 order_items to 0 before anyone noticed.
    ///
    /// The rebuild is also unnecessary. Duplicates are prevented at the source:
    /// the seed conflicts on (name, category_id) and 12_add_natural_key_indexes
    /// makes the database enforce it. A database that already holds duplicates is
    /// repaired by 11_dedupe_menu_items, which deletes only the redundant rows and
    /// repoints their references — it never touches a dish that should exist, and
    /// it never touches an order.
    ///
    /// So the seed is now purely additive and idempotent, and nothing here deletes
    /// a row.
    /// </summary>
    private async Task ApplyMenuSeedAsync(CancellationToken cancellationToken)
    {
        await ExecuteScriptAsync(await GetMigrationScriptAsync("02_seed_data.sql"), cancellationToken);
    }

    /// <summary>
    /// Seeds the admin user, but only when no admin exists at all.
    ///
    /// The gate matters for security, not tidiness. 03_create_admin_user.sql
    /// inserts the documented default account (admin / Admin123!). Recreating it on
    /// every start would mean deleting or deactivating that known account does not
    /// stick — the next restart would silently restore a working admin with a
    /// published password.
    ///
    /// Keying on "no admin rows exist" rather than on a first-run flag is
    /// deliberate: a flag is read before the schema exists, so a boot that dies
    /// partway leaves every later start believing the database is initialised and
    /// the admin forever uncreated.
    ///
    /// The guarantee this gives is narrow, and worth stating precisely: deleting
    /// EVERY admin row recreates the default account on the next start, because
    /// COUNT(*) is then 0. Deleting one admin while others remain is what sticks.
    /// That is the right trade for a first-install path — a database with no admin
    /// at all is unusable and unrecoverable without a manual insert — but it is not
    /// "the default account can never come back".
    ///
    /// It also runs late in the sequence, because it inserts into admin_users and
    /// must not race the scripts that create or alter that table.
    /// </summary>
    private async Task SeedAdminUserAsync(bool adminUserIsMissing, CancellationToken cancellationToken)
    {
        if (!adminUserIsMissing) return;

        await ExecuteScriptAsync(await GetMigrationScriptAsync("03_create_admin_user.sql"), cancellationToken);
    }

    /// <summary>
    /// True when the database has no admin user at all (or no admin_users table yet).
    /// </summary>
    private async Task<bool> AdminUserIsMissingAsync(CancellationToken cancellationToken)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var hasTable = await connection.ExecuteScalarAsync<bool>(
            "SELECT to_regclass('public.admin_users') IS NOT NULL");

        if (!hasTable) return true;

        return await connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM admin_users") == 0;
    }

    public async Task ResetDatabaseAsync(CancellationToken cancellationToken = default)
    {
        // Drop all tables
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var tables = new[] { "order_item_modifiers", "order_items", "order_attempts", "orders",
                             "customer_payment_methods", "customers", "admin_users",
                             "modifiers", "modifier_groups", "menu_items", "categories",
                             "lightspeed_tokens", "webhook_event_log",
                             "operating_hours", "restaurant_settings" };

        foreach (var table in tables)
        {
            await connection.ExecuteAsync($"DROP TABLE IF EXISTS {table} CASCADE");
        }

        // Drop enums
        await connection.ExecuteAsync("DROP TYPE IF EXISTS order_status CASCADE");
        await connection.ExecuteAsync("DROP TYPE IF EXISTS order_type CASCADE");
        await connection.ExecuteAsync("DROP TYPE IF EXISTS payment_method CASCADE");
        await connection.ExecuteAsync("DROP TYPE IF EXISTS payment_status CASCADE");
        await connection.ExecuteAsync("DROP TYPE IF EXISTS sync_status CASCADE");

        // Re-create schema
        await InitializeAsync(cancellationToken);
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedDataSql = await GetMigrationScriptAsync("02_seed_data.sql");
        await ExecuteScriptAsync(seedDataSql, cancellationToken);

        // The admin user is guarded the same way InitializeAsync guards it: this is
        // reachable from the dev endpoint POST /api/dev/db/seed, and recreating the
        // documented default account (admin / Admin123!) on demand would undo an
        // operator deleting it.
        if (await AdminUserIsMissingAsync(cancellationToken))
        {
            await ExecuteScriptAsync(await GetMigrationScriptAsync("03_create_admin_user.sql"), cancellationToken);
        }
    }

    private async Task<string> GetMigrationScriptAsync(string scriptName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourcePath = $"AsianTaste.API.Data.Migrations.{scriptName}";

        using var stream = assembly.GetManifestResourceStream(resourcePath);
        if (stream == null)
        {
            throw new FileNotFoundException($"Migration script not found: {scriptName}. Available resources: {string.Join(", ", assembly.GetManifestResourceNames())}");
        }

        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
    }

    private async Task ExecuteScriptAsync(string sql, CancellationToken cancellationToken)
    {
        using var connection = (NpgsqlConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var statements = SplitSqlStatements(sql)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .ToArray();

        if (statements.Length == 0) return;

        // All statements in one transaction.
        //
        // This is not tidiness — it is what makes a multi-statement migration
        // safe to reason about. Without it, ExecuteNonQueryAsync runs the batch
        // as PostgreSQL's implicit transaction covering the whole batch string,
        // so when a late statement fails, every earlier one rolls back too and
        // the API dies at startup reporting the FIRST statement's error. Reading
        // that error sends you off debugging a statement that was actually fine.
        // (Observed: migration 11's CREATE UNIQUE INDEX failed on leftover
        // duplicates, and the stack pointed at the CREATE INDEX in the schema.)
        //
        // Committing per statement instead would be worse: a migration that dies
        // halfway leaves the schema in a state no one designed, with no record of
        // where it stopped.
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        using var batch = new NpgsqlBatch(connection);
        foreach (var statement in statements)
        {
            batch.BatchCommands.Add(new NpgsqlBatchCommand { CommandText = statement });
        }

        try
        {
            await batch.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (PostgresException ex)
        {
            await transaction.RollbackAsync(cancellationToken);

            // Name the statement that actually broke.
            //
            // Npgsql cannot say which batch command failed, and its stack is
            // batch-wide. The error's own text is the only clue, so match on the
            // quoted identifiers it contains (an index or constraint name). That is
            // a heuristic and it can be wrong: a token can appear in a statement
            // that did not fail, and reporting the wrong statement sends the reader
            // off debugging working SQL. So the message says it is a best guess, and
            // the last statement is the fallback — in a migration that is usually
            // the one that just ran.
            var candidates = ex.MessageText is { Length: > 0 } text
                ? text.Split('"', StringSplitOptions.RemoveEmptyEntries)
                    .Where(token => token.Length > 3)
                    .ToArray()
                : [];

            var failed = statements.FirstOrDefault(s =>
                    candidates.Any(token => s.Contains(token, StringComparison.OrdinalIgnoreCase)))
                ?? statements[^1];

            _logger.LogError(
                ex,
                "Migration statement failed with SQLSTATE {SqlState}: {Message}. " +
                "Most likely failing statement ({Confidence}): {Statement}",
                ex.SqlState,
                ex.MessageText,
                candidates.Length > 0 ? "matched an identifier from the error" : "last statement, no identifier to match",
                failed);

            throw;
        }
    }

    /// <summary>
    /// Split SQL into individual statements, respecting:
    /// - Dollar-quoted strings ($$...$$)
    /// - Single-quoted strings ('...')
    /// - Comments (-- ... and /* ... */)
    /// </summary>
    private static string[] SplitSqlStatements(string sql)
    {
        var statements = new List<string>();
        var current = new StringBuilder();
        var i = 0;
        var inDollarQuote = false;

        while (i < sql.Length)
        {
            // Check for dollar-quoted string start/end ($$)
            if (i + 1 < sql.Length && sql[i] == '$' && sql[i + 1] == '$')
            {
                inDollarQuote = !inDollarQuote;
                current.Append("$$");
                i += 2;
                continue;
            }

            // If inside dollar quote, just accumulate until we find the closing $$
            if (inDollarQuote)
            {
                current.Append(sql[i]);
                i++;
                continue;
            }

            // Check for single-quoted string
            if (sql[i] == '\'')
            {
                current.Append(sql[i]);
                i++;
                while (i < sql.Length)
                {
                    if (sql[i] == '\'' && (i + 1 >= sql.Length || sql[i + 1] != '\''))
                    {
                        current.Append(sql[i]);
                        i++;
                        break;
                    }
                    // Escaped quote ('')
                    if (i + 1 < sql.Length && sql[i] == '\'' && sql[i + 1] == '\'')
                    {
                        current.Append("''");
                        i += 2;
                    }
                    else
                    {
                        current.Append(sql[i]);
                        i++;
                    }
                }
                continue;
            }

            // Check for line comment - skip to end of line
            if (i + 1 < sql.Length && sql[i] == '-' && sql[i + 1] == '-')
            {
                while (i < sql.Length && sql[i] != '\n')
                {
                    i++;
                }
                if (i < sql.Length)
                {
                    i++; // Skip newline
                }
                continue;
            }

            // Check for block comment - skip to */
            if (i + 1 < sql.Length && sql[i] == '/' && sql[i + 1] == '*')
            {
                var endIdx = sql.IndexOf("*/", i + 2);
                if (endIdx == -1)
                {
                    break;
                }
                i = endIdx + 2;
                continue;
            }

            // Regular character or semicolon
            if (sql[i] == ';')
            {
                var stmt = current.ToString().Trim();
                if (!string.IsNullOrWhiteSpace(stmt))
                {
                    statements.Add(stmt);
                }
                current.Clear();
                i++;
            }
            else
            {
                if (!char.IsWhiteSpace(sql[i]) || current.Length > 0)
                {
                    current.Append(sql[i]);
                }
                i++;
            }
        }

        // Add remaining content
        var remaining = current.ToString().Trim();
        if (!string.IsNullOrWhiteSpace(remaining))
        {
            statements.Add(remaining);
        }

        return [.. statements];
    }
}
