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

        var schemaSql = await GetMigrationScriptAsync("01_create_schema.sql");
        await ExecuteScriptAsync(schemaSql, cancellationToken);

        // Run Lightspeed tables migration
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

        // Auto-seed on first initialization (only if database was just created)
        if (!wasAlreadyInitialized)
        {
            _logger.LogInformation("Database was just created, seeding initial data...");
            await SeedAsync(cancellationToken);
        }
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

        var adminUserSql = await GetMigrationScriptAsync("03_create_admin_user.sql");
        await ExecuteScriptAsync(adminUserSql, cancellationToken);
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

        // Execute all statements in one batch
        // Npgsql's ExecuteNonQuery can handle multiple statements when using NpgsqlBatch
        using var batch = new NpgsqlBatch(connection);
        foreach (var statement in SplitSqlStatements(sql))
        {
            if (!string.IsNullOrWhiteSpace(statement))
            {
                batch.BatchCommands.Add(new NpgsqlBatchCommand { CommandText = statement });
            }
        }

        await batch.ExecuteNonQueryAsync(cancellationToken);
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
