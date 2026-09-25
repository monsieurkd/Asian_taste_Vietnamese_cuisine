using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Repositories;

/// <summary>
/// Repository interface for customer data access.
/// </summary>
public interface ICustomerRepository
{
    /// <summary>
    /// Gets a customer by their normalized email address.
    /// </summary>
    Task<Customer?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a customer by their customer number.
    /// </summary>
    Task<Customer?> GetByCustomerNumberAsync(string customerNumber, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a customer by their ID.
    /// </summary>
    Task<Customer?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a new customer record.
    /// </summary>
    Task<Customer> CreateAsync(Customer customer, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates an existing customer record.
    /// </summary>
    Task UpdateAsync(Customer customer, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if an email address is already registered.
    /// </summary>
    Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Generates a unique customer number.
    /// </summary>
    Task<string> GenerateCustomerNumberAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the last order timestamp for a customer.
    /// </summary>
    Task UpdateLastOrderAtAsync(int customerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Finds or creates a guest customer from order information.
    /// </summary>
    Task<Customer> FindOrCreateGuestAsync(string name, string email, string phone, CancellationToken cancellationToken = default);

}
