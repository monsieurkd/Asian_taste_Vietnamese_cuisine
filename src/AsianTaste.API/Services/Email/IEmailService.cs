using AsianTaste.API.Models.DTOs;

namespace AsianTaste.API.Services.Email;

/// <summary>
/// Service interface for sending emails.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Sends an order confirmation email to the customer.
    /// </summary>
    Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends a welcome email to a newly registered customer.
    /// </summary>
    Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends a password reset email.
    /// </summary>
    Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends an order status update email.
    /// </summary>
    Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, CancellationToken cancellationToken = default);
}

/// <summary>
/// Model for order confirmation email data.
/// </summary>
public class OrderConfirmationEmailModel
{
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public DateTime OrderDate { get; set; }
    public DateTime EstimatedReadyTime { get; set; }
    public string OrderType { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public decimal Subtotal { get; set; }
    public decimal Total { get; set; }
    public List<OrderItemEmailModel> Items { get; set; } = new();
    public string? SpecialInstructions { get; set; }
    public string RestaurantName { get; set; } = "Asian Taste";
    public string RestaurantPhone { get; set; } = "(08) 8356 8888";
    public string RestaurantAddress { get; set; } = "329 Henley Beach Rd, Brooklyn Park, Adelaide SA 5032";
}

/// <summary>
/// Model for order item in emails.
/// </summary>
public class OrderItemEmailModel
{
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
    public string? Modifiers { get; set; }
    public string? SpecialInstructions { get; set; }
}
