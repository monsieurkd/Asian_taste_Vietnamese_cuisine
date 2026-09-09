namespace AsianTaste.API.Models.Entities;

/// <summary>
/// Represents a customer (registered or guest).
/// </summary>
public class Customer
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Human-readable customer number (e.g., "C-001234").</summary>
    public string CustomerNumber { get; set; } = string.Empty;

    /// <summary>Customer's email address.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Normalized email for unique indexing (lowercase).</summary>
    public string EmailNormalized { get; set; } = string.Empty;

    /// <summary>Customer's phone number.</summary>
    public string? Phone { get; set; }

    /// <summary>Hashed password (null for guest customers).</summary>
    public string? PasswordHash { get; set; }

    /// <summary>Customer's first name.</summary>
    public string? FirstName { get; set; }

    /// <summary>Customer's last name.</summary>
    public string? LastName { get; set; }

    /// <summary>Whether this is a guest customer (unregistered).</summary>
    public bool IsGuest { get; set; } = true;

    /// <summary>Whether the email has been verified.</summary>
    public bool EmailVerified { get; set; } = false;

    /// <summary>When the customer record was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the customer last placed an order.</summary>
    public DateTime? LastOrderAt { get; set; }

    /// <summary>Whether customer consented to marketing emails.</summary>
    public bool MarketingConsent { get; set; } = false;

    /// <summary>Navigation property to payment methods.</summary>
    public List<CustomerPaymentMethod> PaymentMethods { get; set; } = new();
}

/// <summary>
/// Represents a saved payment method for a customer.
/// </summary>
public class CustomerPaymentMethod
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Customer ID.</summary>
    public int CustomerId { get; set; }

    /// <summary>Payment token from payment processor.</summary>
    public string PaymentMethodToken { get; set; } = string.Empty;

    /// <summary>Last 4 digits of card (for display).</summary>
    public string? CardLastFour { get; set; }

    /// <summary>Card brand (Visa, Mastercard, etc.).</summary>
    public string? CardBrand { get; set; }

    /// <summary>Card expiry month (1-12).</summary>
    public int? ExpiryMonth { get; set; }

    /// <summary>Card expiry year.</summary>
    public int? ExpiryYear { get; set; }

    /// <summary>Whether this is the default payment method.</summary>
    public bool IsDefault { get; set; } = false;

    /// <summary>When the payment method was added.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Whether the payment method is active.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Navigation property to customer.</summary>
    public Customer? Customer { get; set; }
}

/// <summary>
/// Represents a failed order attempt for recovery purposes.
/// </summary>
public class OrderAttempt
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }

    /// <summary>Customer ID (null for guests).</summary>
    public int? CustomerId { get; set; }

    /// <summary>Cart snapshot as JSONB.</summary>
    public string CartSnapshot { get; set; } = string.Empty;

    /// <summary>Status of the attempt (Failed, Pending, etc.).</summary>
    public string AttemptStatus { get; set; } = string.Empty;

    /// <summary>Reason for failure.</summary>
    public string? FailureReason { get; set; }

    /// <summary>When the attempt was made.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Navigation property to customer.</summary>
    public Customer? Customer { get; set; }
}
