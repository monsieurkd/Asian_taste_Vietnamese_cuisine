using System.Text;
using System.Web;
using AsianTaste.API.Models.Entities;

namespace AsianTaste.API.Services.Email;

/// <summary>
/// SendGrid-based email service implementation.
/// </summary>
public class SendGridEmailService : IEmailService
{
    private readonly ILogger<SendGridEmailService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;
    private readonly string? _fromEmail;
    private readonly string? _fromName;
    private readonly bool _isEnabled;

    public SendGridEmailService(ILogger<SendGridEmailService> logger, IConfiguration configuration, HttpClient httpClient)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClient;
        _apiKey = configuration["SendGrid:ApiKey"];
        _fromEmail = configuration["SendGrid:FromEmail"] ?? "orders@asiantaste.com.au";
        _fromName = configuration["SendGrid:FromName"] ?? "Asian Taste Vietnamese Restaurant";
        _isEnabled = configuration.GetValue<bool>("SendGrid:Enabled", true);

        if (!_isEnabled || string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogWarning("SendGrid email service is disabled or API key is not configured. Emails will be logged only.");
        }
    }

    public async Task<bool> SendOrderConfirmationAsync(string toEmail, string toName, OrderConfirmationEmailModel model, CancellationToken cancellationToken = default)
    {
        var subject = $"Order Confirmation {model.OrderNumber} - Asian Taste";
        var htmlBody = GenerateOrderConfirmationHtml(model);
        var textBody = GenerateOrderConfirmationText(model);

        return await SendEmailAsync(toEmail, toName, subject, htmlBody, textBody, cancellationToken);
    }

    public async Task<bool> SendWelcomeEmailAsync(string toEmail, string toName, CancellationToken cancellationToken = default)
    {
        var subject = "Welcome to Asian Taste!";
        var htmlBody = GenerateWelcomeHtml(toName);
        var textBody = GenerateWelcomeText(toName);

        return await SendEmailAsync(toEmail, toName, subject, htmlBody, textBody, cancellationToken);
    }

    public async Task<bool> SendPasswordResetAsync(string toEmail, string toName, string resetToken, CancellationToken cancellationToken = default)
    {
        var resetLink = $"{_configuration["App:BaseUrl"]}/reset-password?token={HttpUtility.UrlEncode(resetToken)}";
        var subject = "Reset Your Password - Asian Taste";
        var htmlBody = GeneratePasswordResetHtml(toName, resetLink);
        var textBody = GeneratePasswordResetText(toName, resetLink);

        return await SendEmailAsync(toEmail, toName, subject, htmlBody, textBody, cancellationToken);
    }

    public async Task<bool> SendOrderStatusUpdateAsync(string toEmail, string toName, string orderNumber, string status, CancellationToken cancellationToken = default)
    {
        var subject = $"Order {orderNumber} Update - {status}";
        var htmlBody = GenerateOrderStatusUpdateHtml(toName, orderNumber, status);
        var textBody = GenerateOrderStatusUpdateText(toName, orderNumber, status);

        return await SendEmailAsync(toEmail, toName, subject, htmlBody, textBody, cancellationToken);
    }

    /// <summary>
    /// Sends an email via SendGrid API.
    /// </summary>
    private async Task<bool> SendEmailAsync(string toEmail, string toName, string subject, string htmlBody, string textBody, CancellationToken cancellationToken)
    {
        try
        {
            // Log email content for debugging
            _logger.LogInformation("Sending email to {Email}: {Subject}", toEmail, subject);

            if (!_isEnabled || string.IsNullOrEmpty(_apiKey))
            {
                _logger.LogInformation("Email service disabled. Would have sent: {Subject} to {Email}", subject, toEmail);
                _logger.LogInformation("HTML body: {HtmlBody}", htmlBody);
                return true; // Return true to not block flow in development
            }

            // Create SendGrid message
            var message = new
            {
                personalizations = new[]
                {
                    new
                    {
                        to = new[]
                        {
                            new { email = toEmail, name = toName }
                        },
                        subject = subject
                    }
                },
                from = new { email = _fromEmail, name = _fromName },
                content = new[]
                {
                    new
                    {
                        type = "text/html",
                        value = htmlBody
                    },
                    new
                    {
                        type = "text/plain",
                        value = textBody
                    }
                }
            };

            // Send to SendGrid API
            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var json = System.Text.Json.JsonSerializer.Serialize(message);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("https://api.sendgrid.com/v3/mail/send", content, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Email sent successfully to {Email}", toEmail);
                return true;
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Failed to send email to {Email}: {Error}", toEmail, error);
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending email to {Email}: {Message}", toEmail, ex.Message);
            return false;
        }
    }

    #region HTML Email Templates

    private string GenerateOrderConfirmationHtml(OrderConfirmationEmailModel model)
    {
        var isCashPayment = model.PaymentMethod.Equals("Cash", StringComparison.OrdinalIgnoreCase);
        var paymentMessage = isCashPayment
            ? $"Please pay ${model.Total:F2} when you pick up your order."
            : $"Your payment of ${model.Total:F2} was successful.";

        var itemsHtml = new StringBuilder();
        foreach (var item in model.Items)
        {
            var modifiersHtml = !string.IsNullOrEmpty(item.Modifiers)
                ? $"<p style='margin: 0; font-size: 14px; color: #666;'>{item.Modifiers}</p>"
                : "";
            var instructionsHtml = !string.IsNullOrEmpty(item.SpecialInstructions)
                ? $"<p style='margin: 0; font-size: 14px; color: #666; font-style: italic;'>Note: {item.SpecialInstructions}</p>"
                : "";

            itemsHtml.AppendLine($@"
            <tr>
                <td style='padding: 12px 0; border-bottom: 1px solid #eee;'>
                    <p style='margin: 0; font-size: 16px; font-weight: 500;'>{item.Quantity}x {item.Name}</p>
                    {modifiersHtml}
                    {instructionsHtml}
                </td>
                <td style='padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;'>
                    <p style='margin: 0; font-size: 16px;'>${item.TotalPrice:F2}</p>
                </td>
            </tr>");
        }

        var specialInstructionsHtml = !string.IsNullOrEmpty(model.SpecialInstructions)
            ? $"<tr><td colspan='2' style='padding: 12px 0;'><strong>Special Instructions:</strong> {model.SpecialInstructions}</td></tr>"
            : "";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Order Confirmation</title>
</head>
<body style='margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;'>
    <div style='max-width: 600px; margin: 0 auto; background-color: #fff;'>
        <!-- Header -->
        <div style='background-color: #4A3728; padding: 30px 20px; text-align: center;'>
            <h1 style='margin: 0; color: #fff; font-size: 28px;'>Asian Taste</h1>
            <p style='margin: 5px 0 0; color: #D4A574; font-size: 14px;'>Vietnamese Restaurant</p>
        </div>

        <!-- Content -->
        <div style='padding: 30px 20px;'>
            <h2 style='margin: 0 0 20px; color: #4A3728; font-size: 24px;'>Order Confirmed!</h2>
            <p style='margin: 0 0 20px; font-size: 16px; color: #333;'>
                Thank you for your order, {model.CustomerName}! Your order <strong>#{model.OrderNumber}</strong> has been received.
            </p>

            <!-- Order Info -->
            <div style='background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin-bottom: 25px;'>
                <p style='margin: 0 0 10px; font-size: 14px; color: #666;'><strong>Order Number:</strong> {model.OrderNumber}</p>
                <p style='margin: 0 0 10px; font-size: 14px; color: #666;'><strong>Order Type:</strong> {model.OrderType}</p>
                <p style='margin: 0 0 10px; font-size: 14px; color: #666;'><strong>Estimated Ready:</strong> {model.EstimatedReadyTime:dddd, MMMM d, h:mm tt}</p>
                <p style='margin: 0; font-size: 14px; color: #666;'><strong>Payment:</strong> {paymentMessage}</p>
            </div>

            <!-- Order Items -->
            <h3 style='margin: 0 0 15px; color: #4A3728; font-size: 18px;'>Order Items</h3>
            <table style='width: 100%; border-collapse: collapse;'>
                {itemsHtml}
            </table>

            <!-- Special Instructions -->
            {specialInstructionsHtml}

            <!-- Total -->
            <div style='margin-top: 25px; padding-top: 20px; border-top: 2px solid #4A3728;'>
                <div style='display: flex; justify-content: space-between; margin-bottom: 10px;'>
                    <span style='font-size: 16px; color: #666;'>Subtotal</span>
                    <span style='font-size: 16px; color: #666;'>${model.Subtotal:F2}</span>
                </div>
                <div style='display: flex; justify-content: space-between;'>
                    <span style='font-size: 20px; font-weight: bold; color: #4A3728;'>Total</span>
                    <span style='font-size: 20px; font-weight: bold; color: #4A3728;'>${model.Total:F2}</span>
                </div>
            </div>

            <!-- Restaurant Info -->
            <div style='margin-top: 30px; padding: 20px; background-color: #FFF8F0; border-radius: 8px; text-align: center;'>
                <p style='margin: 0 0 5px; font-size: 16px; font-weight: 500; color: #4A3728;'>{model.RestaurantName}</p>
                <p style='margin: 0; font-size: 14px; color: #666;'>{model.RestaurantAddress}</p>
                <p style='margin: 5px 0 0; font-size: 14px; color: #666;'>Phone: {model.RestaurantPhone}</p>
            </div>
        </div>

        <!-- Footer -->
        <div style='background-color: #4A3728; padding: 20px; text-align: center;'>
            <p style='margin: 0; font-size: 12px; color: #ccc;'>Thank you for ordering with Asian Taste!</p>
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateWelcomeHtml(string customerName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Welcome to Asian Taste</title>
</head>
<body style='margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;'>
    <div style='max-width: 600px; margin: 0 auto; background-color: #fff;'>
        <!-- Header -->
        <div style='background-color: #4A3728; padding: 30px 20px; text-align: center;'>
            <h1 style='margin: 0; color: #fff; font-size: 28px;'>Asian Taste</h1>
            <p style='margin: 5px 0 0; color: #D4A574; font-size: 14px;'>Vietnamese Restaurant</p>
        </div>

        <!-- Content -->
        <div style='padding: 30px 20px;'>
            <h2 style='margin: 0 0 20px; color: #4A3728; font-size: 24px;'>Welcome, {customerName}!</h2>
            <p style='margin: 0 0 15px; font-size: 16px; color: #333;'>
                Thank you for creating an account with Asian Taste. We're excited to have you as part of our family!
            </p>
            <p style='margin: 0 0 25px; font-size: 16px; color: #333;'>
                With your account, you can:
            </p>
            <ul style='margin: 0 0 25px 20px; font-size: 16px; color: #333;'>
                <li>Track your order history</li>
                <li>Save your favorite items</li>
                <li>Enjoy faster checkout next time</li>
                <li>Receive exclusive offers</li>
            </ul>
            <div style='text-align: center;'>
                <a href='{_configuration["App:BaseUrl"]}/menu' style='display: inline-block; background-color: #4A3728; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 500;'>Order Now</a>
            </div>
        </div>

        <!-- Footer -->
        <div style='background-color: #4A3728; padding: 20px; text-align: center;'>
            <p style='margin: 0; font-size: 12px; color: #ccc;'>See you soon at Asian Taste!</p>
        </div>
    </div>
</body>
</html>";
    }

    private string GeneratePasswordResetHtml(string customerName, string resetLink)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Reset Your Password</title>
</head>
<body style='margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;'>
    <div style='max-width: 600px; margin: 0 auto; background-color: #fff;'>
        <!-- Header -->
        <div style='background-color: #4A3728; padding: 30px 20px; text-align: center;'>
            <h1 style='margin: 0; color: #fff; font-size: 28px;'>Asian Taste</h1>
            <p style='margin: 5px 0 0; color: #D4A574; font-size: 14px;'>Vietnamese Restaurant</p>
        </div>

        <!-- Content -->
        <div style='padding: 30px 20px;'>
            <h2 style='margin: 0 0 20px; color: #4A3728; font-size: 24px;'>Reset Your Password</h2>
            <p style='margin: 0 0 25px; font-size: 16px; color: #333;'>
                Hi {customerName}, we received a request to reset your password. Click the button below to create a new password.
            </p>
            <div style='text-align: center; margin-bottom: 25px;'>
                <a href='{resetLink}' style='display: inline-block; background-color: #4A3728; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 500;'>Reset Password</a>
            </div>
            <p style='margin: 0 0 10px; font-size: 14px; color: #666;'>
                This link will expire in 24 hours.
            </p>
            <p style='margin: 0; font-size: 14px; color: #666;'>
                If you didn't request this password reset, please ignore this email.
            </p>
        </div>

        <!-- Footer -->
        <div style='background-color: #4A3728; padding: 20px; text-align: center;'>
            <p style='margin: 0; font-size: 12px; color: #ccc;'>Asian Taste Vietnamese Restaurant</p>
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateOrderStatusUpdateHtml(string customerName, string orderNumber, string status)
    {
        var statusMessage = status switch
        {
            "Confirmed" => "Your order has been confirmed and is being prepared.",
            "Preparing" => "Your order is currently being prepared in the kitchen.",
            "Ready" => "Great news! Your order is ready for pickup!",
            "Completed" => "Your order has been completed. Thank you for dining with us!",
            _ => $"Your order status has been updated to: {status}"
        };

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Order Status Update</title>
</head>
<body style='margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;'>
    <div style='max-width: 600px; margin: 0 auto; background-color: #fff;'>
        <!-- Header -->
        <div style='background-color: #4A3728; padding: 30px 20px; text-align: center;'>
            <h1 style='margin: 0; color: #fff; font-size: 28px;'>Asian Taste</h1>
            <p style='margin: 5px 0 0; color: #D4A574; font-size: 14px;'>Vietnamese Restaurant</p>
        </div>

        <!-- Content -->
        <div style='padding: 30px 20px;'>
            <h2 style='margin: 0 0 20px; color: #4A3728; font-size: 24px;'>Order Status Update</h2>
            <p style='margin: 0 0 15px; font-size: 16px; color: #333;'>
                Hi {customerName}, your order <strong>#{orderNumber}</strong> has been updated.
            </p>
            <div style='background-color: #f9f9f9; border-left: 4px solid #4A3728; padding: 15px; margin-bottom: 25px;'>
                <p style='margin: 0; font-size: 16px; color: #333;'>{statusMessage}</p>
            </div>
            <div style='text-align: center;'>
                <a href='{_configuration["App:BaseUrl"]}/confirmation/{orderNumber}' style='display: inline-block; background-color: #4A3728; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 500;'>View Order</a>
            </div>
        </div>

        <!-- Footer -->
        <div style='background-color: #4A3728; padding: 20px; text-align: center;'>
            <p style='margin: 0; font-size: 12px; color: #ccc;'>Thank you for ordering with Asian Taste!</p>
        </div>
    </div>
</body>
</html>";
    }

    #endregion

    #region Plain Text Email Templates

    private string GenerateOrderConfirmationText(OrderConfirmationEmailModel model)
    {
        var sb = new StringBuilder();
        var isCashPayment = model.PaymentMethod.Equals("Cash", StringComparison.OrdinalIgnoreCase);
        var paymentMessage = isCashPayment
            ? $"Please pay ${model.Total:F2} when you pick up your order."
            : $"Your payment of ${model.Total:F2} was successful.";

        sb.AppendLine("ASIAN TASTE - ORDER CONFIRMATION");
        sb.AppendLine(new string('=', 50));
        sb.AppendLine();
        sb.AppendLine($"Order Number: {model.OrderNumber}");
        sb.AppendLine($"Customer: {model.CustomerName}");
        sb.AppendLine($"Order Type: {model.OrderType}");
        sb.AppendLine($"Estimated Ready: {model.EstimatedReadyTime:dddd, MMMM d, h:mm tt}");
        sb.AppendLine($"Payment: {paymentMessage}");
        sb.AppendLine();
        sb.AppendLine("ORDER ITEMS:");
        sb.AppendLine(new string('-', 30));

        foreach (var item in model.Items)
        {
            sb.AppendLine($"{item.Quantity}x {item.Name} - ${item.TotalPrice:F2}");
            if (!string.IsNullOrEmpty(item.Modifiers))
                sb.AppendLine($"  + {item.Modifiers}");
            if (!string.IsNullOrEmpty(item.SpecialInstructions))
                sb.AppendLine($"  Note: {item.SpecialInstructions}");
        }

        sb.AppendLine(new string('-', 30));
        sb.AppendLine($"Subtotal: ${model.Subtotal:F2}");
        sb.AppendLine($"Total: ${model.Total:F2}");
        sb.AppendLine();

        if (!string.IsNullOrEmpty(model.SpecialInstructions))
        {
            sb.AppendLine($"Special Instructions: {model.SpecialInstructions}");
            sb.AppendLine();
        }

        sb.AppendLine(model.RestaurantName);
        sb.AppendLine(model.RestaurantAddress);
        sb.AppendLine($"Phone: {model.RestaurantPhone}");

        return sb.ToString();
    }

    private string GenerateWelcomeText(string customerName)
    {
        return $$"""
ASIAN TASTE - WELCOME!

Welcome, {{customerName}}!

Thank you for creating an account with Asian Taste. We're excited to have you as part of our family!

With your account, you can:
- Track your order history
- Save your favorite items
- Enjoy faster checkout next time
- Receive exclusive offers

Visit us at: {{_configuration["App:BaseUrl"]}}/menu

See you soon!

Asian Taste Vietnamese Restaurant
329 Henley Beach Rd, Brooklyn Park, Adelaide SA 5032
""";
    }

    private string GeneratePasswordResetText(string customerName, string resetLink)
    {
        return $$"""
ASIAN TASTE - PASSWORD RESET

Hi {{customerName}},

We received a request to reset your password. Click the link below to create a new password:

{{resetLink}}

This link will expire in 24 hours.

If you didn't request this password reset, please ignore this email.

Asian Taste Vietnamese Restaurant
""";
    }

    private string GenerateOrderStatusUpdateText(string customerName, string orderNumber, string status)
    {
        var statusMessage = status switch
        {
            "Confirmed" => "Your order has been confirmed and is being prepared.",
            "Preparing" => "Your order is currently being prepared in the kitchen.",
            "Ready" => "Great news! Your order is ready for pickup!",
            "Completed" => "Your order has been completed. Thank you for dining with us!",
            _ => $"Your order status has been updated to: {status}"
        };

        return $$"""
ASIAN TASTE - ORDER STATUS UPDATE

Hi {{customerName}},

Your order #{{orderNumber}} has been updated.

{{statusMessage}}

View your order: {{_configuration["App:BaseUrl"]}}/confirmation/{{orderNumber}}

Thank you for ordering with Asian Taste!
""";
    }

    #endregion
}
