using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Models.Entities;
using AsianTaste.API.Repositories;
using Microsoft.IdentityModel.Tokens;

namespace AsianTaste.API.Services;

/// <summary>
/// Service for handling customer-related business logic.
/// </summary>
public class CustomerService
{
    private readonly ICustomerRepository _customerRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly ILogger<CustomerService> _logger;
    private readonly IConfiguration _configuration;

    public CustomerService(
        ICustomerRepository customerRepository,
        IOrderRepository orderRepository,
        ILogger<CustomerService> logger,
        IConfiguration configuration)
    {
        _customerRepository = customerRepository;
        _orderRepository = orderRepository;
        _logger = logger;
        _configuration = configuration;
    }

    /// <summary>
    /// Registers a new customer account.
    /// </summary>
    public async Task<CustomerAuthResponseDto> RegisterAsync(RegisterCustomerDto request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = request.Email.ToLowerInvariant();

        // Check if email already exists
        if (await _customerRepository.EmailExistsAsync(normalizedEmail, cancellationToken))
        {
            _logger.LogInformation("Registration failed: Email already exists {Email}", request.Email);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "An account with this email already exists"
            };
        }

        // Hash password using PBKDF2
        var passwordHash = HashPassword(request.Password);

        // Split name into first/last
        string? firstName = null;
        string? lastName = null;
        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            var parts = request.Name.Trim().Split(' ', 2);
            firstName = parts[0];
            lastName = parts.Length > 1 ? parts[1] : null;
        }

        // Create customer
        var customer = new Customer
        {
            CustomerNumber = await _customerRepository.GenerateCustomerNumberAsync(cancellationToken),
            Email = request.Email,
            EmailNormalized = normalizedEmail,
            Phone = request.Phone,
            PasswordHash = passwordHash,
            FirstName = firstName,
            LastName = lastName,
            IsGuest = false,
            EmailVerified = false,
            MarketingConsent = request.MarketingConsent,
            CreatedAt = DateTime.UtcNow
        };

        customer = await _customerRepository.CreateAsync(customer, cancellationToken);

        // Link order if provided
        if (!string.IsNullOrEmpty(request.LinkOrderNumber))
        {
            await LinkOrderToCustomerAsync(request.LinkOrderNumber, customer.Id, cancellationToken);
        }

        // Generate JWT token
        var token = GenerateCustomerToken(customer);

        _logger.LogInformation("Customer registered successfully: {Email}, CustomerNumber: {CustomerNumber}",
            request.Email, customer.CustomerNumber);

        return new CustomerAuthResponseDto
        {
            Success = true,
            Token = token,
            Customer = MapToResponse(customer)
        };
    }

    /// <summary>
    /// Authenticates a customer with email and password.
    /// </summary>
    public async Task<CustomerAuthResponseDto> LoginAsync(LoginCustomerDto request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = request.Email.ToLowerInvariant();
        var customer = await _customerRepository.GetByEmailAsync(normalizedEmail, cancellationToken);

        if (customer == null)
        {
            _logger.LogInformation("Login failed: Customer not found {Email}", request.Email);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "Invalid email or password"
            };
        }

        if (customer.IsGuest)
        {
            _logger.LogInformation("Login failed: Guest customer attempting to login {Email}", request.Email);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "Please create an account to continue"
            };
        }

        // Verify password
        if (!VerifyPassword(request.Password, customer.PasswordHash!))
        {
            _logger.LogInformation("Login failed: Invalid password for {Email}", request.Email);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "Invalid email or password"
            };
        }

        // Generate JWT token
        var token = GenerateCustomerToken(customer);

        _logger.LogInformation("Customer logged in successfully: {Email}", request.Email);

        return new CustomerAuthResponseDto
        {
            Success = true,
            Token = token,
            Customer = MapToResponse(customer)
        };
    }

    /// <summary>
    /// Creates a customer account from an existing order (post-order account creation).
    /// </summary>
    public async Task<CustomerAuthResponseDto> CreateAccountFromOrderAsync(CreateCustomerAccountFromOrderDto request, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = request.Email.ToLowerInvariant();

        // Check if order exists
        var order = await _orderRepository.GetOrderByNumberAsync(request.OrderNumber, cancellationToken);
        if (order == null)
        {
            _logger.LogInformation("Account creation failed: Order not found {OrderNumber}", request.OrderNumber);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "Order not found"
            };
        }

        // Verify email matches the order email
        if (order.CustomerEmail.ToLowerInvariant() != normalizedEmail)
        {
            _logger.LogInformation("Account creation failed: Email mismatch for order {OrderNumber}", request.OrderNumber);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "Email does not match the order email"
            };
        }

        // Check if customer already exists
        var existingCustomer = await _customerRepository.GetByEmailAsync(normalizedEmail, cancellationToken);
        if (existingCustomer != null && !existingCustomer.IsGuest)
        {
            _logger.LogInformation("Account creation failed: Account already exists for {Email}", request.Email);
            return new CustomerAuthResponseDto
            {
                Success = false,
                Error = "An account with this email already exists. Please log in instead."
            };
        }

        // Hash password using PBKDF2
        var passwordHash = HashPassword(request.Password);

        // Split name into first/last
        string? firstName = null;
        string? lastName = null;
        if (!string.IsNullOrWhiteSpace(order.CustomerName))
        {
            var parts = order.CustomerName.Trim().Split(' ', 2);
            firstName = parts[0];
            lastName = parts.Length > 1 ? parts[1] : null;
        }

        Customer customer;

        if (existingCustomer != null && existingCustomer.IsGuest)
        {
            // Upgrade guest customer to full account
            existingCustomer.PasswordHash = passwordHash;
            existingCustomer.FirstName = firstName;
            existingCustomer.LastName = lastName;
            existingCustomer.IsGuest = false;
            existingCustomer.MarketingConsent = request.MarketingConsent;

            await _customerRepository.UpdateAsync(existingCustomer, cancellationToken);
            customer = existingCustomer;

            _logger.LogInformation("Guest customer upgraded to full account: {Email}", request.Email);
        }
        else
        {
            // Create new customer account
            customer = new Customer
            {
                CustomerNumber = await _customerRepository.GenerateCustomerNumberAsync(cancellationToken),
                Email = request.Email,
                EmailNormalized = normalizedEmail,
                Phone = order.CustomerPhone,
                PasswordHash = passwordHash,
                FirstName = firstName,
                LastName = lastName,
                IsGuest = false,
                EmailVerified = false,
                MarketingConsent = request.MarketingConsent,
                CreatedAt = DateTime.UtcNow,
                LastOrderAt = order.CreatedAt
            };

            customer = await _customerRepository.CreateAsync(customer, cancellationToken);
            _logger.LogInformation("New customer account created from order: {Email}, OrderNumber: {OrderNumber}",
                request.Email, request.OrderNumber);
        }

        // Link order to customer
        await LinkOrderToCustomerAsync(request.OrderNumber, customer.Id, cancellationToken);

        // Generate JWT token
        var token = GenerateCustomerToken(customer);

        return new CustomerAuthResponseDto
        {
            Success = true,
            Token = token,
            Customer = MapToResponse(customer)
        };
    }

    /// <summary>
    /// Gets customer profile by ID.
    /// </summary>
    public async Task<CustomerProfileResponseDto?> GetProfileAsync(int customerId, CancellationToken cancellationToken = default)
    {
        var customer = await _customerRepository.GetByIdAsync(customerId, cancellationToken);
        if (customer == null) return null;

        // Get order count
        var orders = await _orderRepository.GetOrdersByCustomerEmailAsync(customer.Email, cancellationToken);

        // Get payment methods
        var paymentMethods = await _customerRepository.GetPaymentMethodsAsync(customerId, cancellationToken);

        return new CustomerProfileResponseDto
        {
            Id = customer.Id,
            CustomerNumber = customer.CustomerNumber,
            Email = customer.Email,
            Phone = customer.Phone,
            FirstName = customer.FirstName,
            LastName = customer.LastName,
            EmailVerified = customer.EmailVerified,
            CreatedAt = customer.CreatedAt,
            LastOrderAt = customer.LastOrderAt,
            OrderCount = orders.Count,
            PaymentMethods = paymentMethods.Select(pm => new CustomerPaymentMethodDto
            {
                Id = pm.Id,
                CardLastFour = pm.CardLastFour,
                CardBrand = pm.CardBrand,
                ExpiryMonth = pm.ExpiryMonth,
                ExpiryYear = pm.ExpiryYear,
                IsDefault = pm.IsDefault
            }).ToList()
        };
    }

    /// <summary>
    /// Updates customer profile.
    /// </summary>
    public async Task<CustomerProfileResponseDto?> UpdateProfileAsync(int customerId, UpdateCustomerProfileDto request, CancellationToken cancellationToken = default)
    {
        var customer = await _customerRepository.GetByIdAsync(customerId, cancellationToken);
        if (customer == null) return null;

        // Update only provided fields
        if (request.FirstName != null)
            customer.FirstName = request.FirstName;
        if (request.LastName != null)
            customer.LastName = request.LastName;
        if (request.Phone != null)
            customer.Phone = request.Phone;
        if (request.MarketingConsent.HasValue)
            customer.MarketingConsent = request.MarketingConsent.Value;

        await _customerRepository.UpdateAsync(customer, cancellationToken);

        _logger.LogInformation("Customer profile updated: {CustomerId}", customerId);

        return await GetProfileAsync(customerId, cancellationToken);
    }

    /// <summary>
    /// Links an order to a customer account.
    /// </summary>
    private async Task LinkOrderToCustomerAsync(string orderNumber, int customerId, CancellationToken cancellationToken)
    {
        // Update the order's customer_id
        await _orderRepository.LinkOrderToCustomerAsync(orderNumber, customerId, cancellationToken);

        // Also update the customer's last_order_at
        await _customerRepository.UpdateLastOrderAtAsync(customerId, cancellationToken);

        _logger.LogInformation("Order {OrderNumber} linked to customer {CustomerId}", orderNumber, customerId);
    }

    /// <summary>
    /// Generates a JWT token for a customer.
    /// </summary>
    private string GenerateCustomerToken(Customer customer)
    {
        var jwtSecretKey = _configuration["Jwt:CustomerSecretKey"]
            ?? _configuration["Jwt:SecretKey"]
            ?? "AsianTasteSecretKey2025ForJWTTokenGenerationMin32Chars";
        var jwtKey = Encoding.UTF8.GetBytes(jwtSecretKey);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, customer.Id.ToString()),
            new Claim(ClaimTypes.Email, customer.Email),
            new Claim("customer_number", customer.CustomerNumber),
            new Claim(ClaimTypes.Role, "Customer")
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddDays(30), // Customer tokens last longer
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(jwtKey),
                SecurityAlgorithms.HmacSha256Signature)
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    /// <summary>
    /// Verifies a password against a hash.
    /// Handles both new PBKDF2 format ({iterations}:{salt}:{hash}) and legacy format.
    /// </summary>
    private bool VerifyPassword(string password, string storedHash)
    {
        var isValid = PasswordHasher.Verify(password, storedHash);
        if (!isValid && !string.IsNullOrEmpty(storedHash) && storedHash.Split(':').Length != 3)
        {
            // Legacy format: cannot be verified (the old implementation used a
            // random key per hash). Log it so admins know which accounts need a reset.
            _logger.LogWarning("Attempting to verify legacy password hash format. Password reset required.");
        }
        return isValid;
    }

    /// <summary>
    /// Hashes a password using PBKDF2.
    /// Format: {iterations}:{salt}:{hash}
    /// </summary>
    private string HashPassword(string password) => PasswordHasher.Hash(password);

    /// <summary>
    /// Maps a Customer entity to a CustomerResponseDto.
    /// </summary>
    private static CustomerResponseDto MapToResponse(Customer customer)
    {
        return new CustomerResponseDto
        {
            Id = customer.Id,
            CustomerNumber = customer.CustomerNumber,
            Email = customer.Email,
            Phone = customer.Phone,
            FirstName = customer.FirstName,
            LastName = customer.LastName
        };
    }
}
