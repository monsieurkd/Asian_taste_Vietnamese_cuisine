using System.Data;
using Dapper;
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
/// </summary>
public class DbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new ArgumentNullException("DefaultConnection", "Connection string 'DefaultConnection' is missing from configuration.");
    }

    public IDbConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}
