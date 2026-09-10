using System.Data;
using Npgsql;

namespace AsianTaste.API.Data;

/// <summary>
/// Factory for creating database connections.
/// Registered as scoped service in DI container.
/// </summary>
public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

/// <summary>
/// PostgreSQL implementation of database connection factory.
///
/// Uses a shared <see cref="NpgsqlDataSource"/> rather than constructing bare
/// <see cref="NpgsqlConnection"/>s. That is the supported replacement for the
/// obsolete <c>NpgsqlConnection.GlobalTypeMapper</c> (removed in Npgsql 7+):
/// enum mappings are declared once on the data source and every connection it
/// hands out inherits them, instead of relying on process-global mutable state.
/// </summary>
public class DbConnectionFactory : IDbConnectionFactory, IAsyncDisposable
{
    private readonly NpgsqlDataSource _dataSource;

    public DbConnectionFactory(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new ArgumentNullException("DefaultConnection", "Connection string 'DefaultConnection' is missing from configuration.");

        var builder = new NpgsqlDataSourceBuilder(connectionString);

        // PostgreSQL enum mappings, declared once for the whole application.
        // These match the types created by the SQL migrations.
        builder.MapEnum<Models.Enums.OrderType>("order_type");
        builder.MapEnum<Models.Enums.OrderStatus>("order_status");
        builder.MapEnum<Models.Enums.PaymentMethod>("payment_method");
        builder.MapEnum<Models.Enums.PaymentStatus>("payment_status");
        builder.MapEnum<Models.Enums.SyncStatus>("sync_status");

        _dataSource = builder.Build();
    }

    public IDbConnection CreateConnection()
    {
        return _dataSource.CreateConnection();
    }

    public ValueTask DisposeAsync()
    {
        return _dataSource.DisposeAsync();
    }
}
