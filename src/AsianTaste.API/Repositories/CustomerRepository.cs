using System.Data;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Dapper-based repository for customer data access.
/// </summary>
public class CustomerRepository : ICustomerRepository
{
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly ILogger<CustomerRepository> _logger;

    public CustomerRepository(IDbConnectionFactory dbConnectionFactory, ILogger<CustomerRepository> logger)
    {
        _dbConnectionFactory = dbConnectionFactory;
        _logger = logger;
    }

    public async Task<Customer?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id,
                   customer_number as CustomerNumber,
                   email as Email,
                   email_normalized as EmailNormalized,
                   phone as Phone,
                   password_hash as PasswordHash,
                   first_name as FirstName,
                   last_name as LastName,
                   is_guest as IsGuest,
                   email_verified as EmailVerified,
                   marketing_consent as MarketingConsent,
                   created_at as CreatedAt,
                   last_order_at as LastOrderAt
            FROM customers
            WHERE email_normalized = @EmailNormalized";

        return await connection.QueryFirstOrDefaultAsync<Customer>(
            new CommandDefinition(sql, new { EmailNormalized = normalizedEmail.ToLowerInvariant() }, cancellationToken: cancellationToken));
    }

    public async Task<Customer?> GetByCustomerNumberAsync(string customerNumber, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id,
                   customer_number as CustomerNumber,
                   email as Email,
                   email_normalized as EmailNormalized,
                   phone as Phone,
                   password_hash as PasswordHash,
                   first_name as FirstName,
                   last_name as LastName,
                   is_guest as IsGuest,
                   email_verified as EmailVerified,
                   marketing_consent as MarketingConsent,
                   created_at as CreatedAt,
                   last_order_at as LastOrderAt
            FROM customers
            WHERE customer_number = @CustomerNumber";

        return await connection.QueryFirstOrDefaultAsync<Customer>(
            new CommandDefinition(sql, new { CustomerNumber = customerNumber }, cancellationToken: cancellationToken));
    }

    public async Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT id,
                   customer_number as CustomerNumber,
                   email as Email,
                   email_normalized as EmailNormalized,
                   phone as Phone,
                   password_hash as PasswordHash,
                   first_name as FirstName,
                   last_name as LastName,
                   is_guest as IsGuest,
                   email_verified as EmailVerified,
                   marketing_consent as MarketingConsent,
                   created_at as CreatedAt,
                   last_order_at as LastOrderAt
            FROM customers
            WHERE id = @Id";

        return await connection.QueryFirstOrDefaultAsync<Customer>(
            new CommandDefinition(sql, new { Id = id }, cancellationToken: cancellationToken));
    }

    public async Task<Customer> CreateAsync(Customer customer, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Generate customer number if not provided
        if (string.IsNullOrEmpty(customer.CustomerNumber))
        {
            customer.CustomerNumber = await GenerateCustomerNumberAsync(cancellationToken);
        }

        // Normalize email
        customer.EmailNormalized = customer.Email.ToLowerInvariant();

        const string sql = @"
            INSERT INTO customers (
                customer_number, email, email_normalized, phone,
                password_hash, first_name, last_name, is_guest,
                email_verified, marketing_consent, created_at
            ) VALUES (
                @CustomerNumber, @Email, @EmailNormalized, @Phone,
                @PasswordHash, @FirstName, @LastName, @IsGuest,
                @EmailVerified, @MarketingConsent, @CreatedAt
            ) RETURNING id";

        var id = await connection.QuerySingleAsync<int>(
            new CommandDefinition(
                sql,
                new
                {
                    CustomerNumber = customer.CustomerNumber,
                    Email = customer.Email,
                    EmailNormalized = customer.EmailNormalized,
                    Phone = customer.Phone,
                    PasswordHash = customer.PasswordHash,
                    FirstName = customer.FirstName,
                    LastName = customer.LastName,
                    IsGuest = customer.IsGuest,
                    EmailVerified = customer.EmailVerified,
                    MarketingConsent = customer.MarketingConsent,
                    CreatedAt = customer.CreatedAt
                },
                cancellationToken: cancellationToken));

        customer.Id = id;
        return customer;
    }

    public async Task UpdateAsync(Customer customer, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE customers
            SET phone = @Phone,
                password_hash = @PasswordHash,
                first_name = @FirstName,
                last_name = @LastName,
                is_guest = @IsGuest,
                email_verified = @EmailVerified,
                marketing_consent = @MarketingConsent,
                last_order_at = @LastOrderAt
            WHERE id = @Id";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    Id = customer.Id,
                    Phone = customer.Phone,
                    PasswordHash = customer.PasswordHash,
                    FirstName = customer.FirstName,
                    LastName = customer.LastName,
                    IsGuest = customer.IsGuest,
                    EmailVerified = customer.EmailVerified,
                    MarketingConsent = customer.MarketingConsent,
                    LastOrderAt = customer.LastOrderAt
                },
                cancellationToken: cancellationToken));
    }

    public async Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            SELECT COUNT(*)
            FROM customers
            WHERE email_normalized = @EmailNormalized";

        var count = await connection.QuerySingleAsync<int>(
            new CommandDefinition(sql, new { EmailNormalized = normalizedEmail.ToLowerInvariant() }, cancellationToken: cancellationToken));

        return count > 0;
    }

    public async Task<string> GenerateCustomerNumberAsync(CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        // Try up to 10 times to generate a unique customer number
        for (int i = 0; i < 10; i++)
        {
            // Generate format: C-XXXXXX (6 random digits)
            var random = new Random().Next(100000, 999999);
            var customerNumber = $"C-{random}";

            const string sql = @"
                SELECT COUNT(*)
                FROM customers
                WHERE customer_number = @CustomerNumber";

            var count = await connection.QuerySingleAsync<int>(
                new CommandDefinition(sql, new { CustomerNumber = customerNumber }, cancellationToken: cancellationToken));

            if (count == 0)
            {
                return customerNumber;
            }
        }

        // Fallback: use timestamp-based number
        return $"C-{DateTime.UtcNow.Ticks % 1000000:D6}";
    }

    public async Task UpdateLastOrderAtAsync(int customerId, CancellationToken cancellationToken = default)
    {
        using var connection = _dbConnectionFactory.CreateConnection();
        connection.Open();

        const string sql = @"
            UPDATE customers
            SET last_order_at = @LastOrderAt
            WHERE id = @CustomerId";

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    CustomerId = customerId,
                    LastOrderAt = DateTime.UtcNow
                },
                cancellationToken: cancellationToken));
    }

    public async Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = email.ToLowerInvariant();

        // First check if customer already exists
        var existing = await GetByEmailAsync(normalizedEmail, cancellationToken);
        if (existing != null)
        {
            return existing;
        }

        // Split name into first/last
        string? firstName = null;
        string? lastName = null;
        if (!string.IsNullOrWhiteSpace(name))
        {
            var parts = name.Trim().Split(' ', 2);
            firstName = parts[0];
            lastName = parts.Length > 1 ? parts[1] : null;
        }

        // Create new guest customer
        var customer = new Customer
        {
            CustomerNumber = await GenerateCustomerNumberAsync(cancellationToken),
            Email = email,
            EmailNormalized = normalizedEmail,
            Phone = phone,
            FirstName = firstName,
            LastName = lastName,
            IsGuest = true,
            EmailVerified = false,
            MarketingConsent = false,
            CreatedAt = DateTime.UtcNow
        };

        return await CreateAsync(customer, cancellationToken);
    }
}
