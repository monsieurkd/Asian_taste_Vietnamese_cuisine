using AsianTaste.API.Models.Enums;
using AsianTaste.API.Services.Payment.Interfaces;
using System.ComponentModel.DataAnnotations;

namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Request DTO to create a payment intent before order creation.
/// </summary>
public class CreatePaymentIntentRequestDto
{
    /// <summary>Amount in cents (minor units).</summary>
    [Required]
    [Range(1, int.MaxValue)]
    public int Amount { get; set; }

    /// <summary>Currency code (default: cad).</summary>
    public string? Currency { get; set; }

    /// <summary>Customer email for receipts.</summary>
    public string? CustomerEmail { get; set; }

    /// <summary>Additional metadata for tracking.</summary>
    public Dictionary<string, string>? Metadata { get; set; }
}

/// <summary>
/// Response DTO after creating payment intent.
/// </summary>
public class CreatePaymentIntentResponseDto
{
    /// <summary>Whether payment intent creation was successful.</summary>
    public bool Success { get; set; }

    /// <summary>Client secret for frontend Stripe Elements processing.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Payment Intent ID from Stripe.</summary>
    public string? PaymentIntentId { get; set; }

    /// <summary>Error message if creation failed.</summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Request DTO to initiate payment for an existing order.
/// </summary>
public class InitiatePaymentRequestDto
{
    /// <summary>Order ID to process payment for.</summary>
    [Required]
    public int OrderId { get; set; }

    /// <summary>Payment method to use.</summary>
    [Required]
    public Services.Payment.Interfaces.PaymentMethodType PaymentMethodType { get; set; }
}

/// <summary>
/// Response DTO after initiating payment.
/// </summary>
public class InitiatePaymentResponseDto
{
    /// <summary>Whether payment initiation was successful.</summary>
    public bool Success { get; set; }

    /// <summary>External payment ID from gateway.</summary>
    public string PaymentId { get; set; } = string.Empty;

    /// <summary>Client secret for frontend payment processing (if applicable).</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Redirect URL for hosted payment pages (if applicable).</summary>
    public string? RedirectUrl { get; set; }

    /// <summary>Error message if initiation failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Whether additional action is required (3D Secure, etc.).</summary>
    public bool RequiresAction { get; set; }

    /// <summary>Current payment status.</summary>
    public Services.Payment.Interfaces.PaymentStatus PaymentStatus { get; set; }
}

/// <summary>
/// Request DTO to capture a previously authorized payment.
/// </summary>
public class CapturePaymentRequestDto
{
    /// <summary>Amount to capture (in cents).</summary>
    [Required]
    [Range(1, int.MaxValue)]
    public int Amount { get; set; }
}

/// <summary>
/// Response DTO after capturing payment.
/// </summary>
public class CapturePaymentResponseDto
{
    /// <summary>Whether capture was successful.</summary>
    public bool Success { get; set; }

    /// <summary>Capture transaction ID.</summary>
    public string CaptureId { get; set; } = string.Empty;

    /// <summary>Error message if capture failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Amount actually captured.</summary>
    public decimal? Amount { get; set; }
}

/// <summary>
/// Request DTO to refund a payment.
/// </summary>
public class RefundPaymentRequestDto
{
    /// <summary>Amount to refund (in cents), or null for full refund.</summary>
    [Range(1, int.MaxValue)]
    public int? Amount { get; set; }

    /// <summary>Reason for the refund.</summary>
    [StringLength(500)]
    public string? Reason { get; set; }
}

/// <summary>
/// Response DTO after processing refund.
/// </summary>
public class RefundPaymentResponseDto
{
    /// <summary>Whether refund was successful.</summary>
    public bool Success { get; set; }

    /// <summary>Refund transaction ID.</summary>
    public string RefundId { get; set; } = string.Empty;

    /// <summary>Amount refunded (in dollars).</summary>
    public decimal Amount { get; set; }

    /// <summary>Error message if refund failed.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>Refund status.</summary>
    public Services.Payment.Interfaces.RefundStatus Status { get; set; }
}

/// <summary>
/// Response DTO for payment status query.
/// </summary>
public class PaymentStatusResponseDto
{
    /// <summary>Current payment status.</summary>
    public Services.Payment.Interfaces.PaymentStatus Status { get; set; }

    /// <summary>Amount paid (in dollars).</summary>
    public decimal? PaidAmount { get; set; }

    /// <summary>When payment was completed.</summary>
    public DateTime? PaidAt { get; set; }

    /// <summary>Currency of the payment.</summary>
    public string? Currency { get; set; }

    /// <summary>Error message if payment failed.</summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Response DTO with order payment details.
/// </summary>
public class OrderPaymentDetailsDto
{
    /// <summary>Order ID.</summary>
    public int OrderId { get; set; }

    /// <summary>Order number.</summary>
    public string OrderNumber { get; set; } = string.Empty;

    /// <summary>Order total.</summary>
    public decimal Total { get; set; }

    /// <summary>Payment method used.</summary>
    public PaymentMethod? PaymentMethod { get; set; }

    /// <summary>Current payment status.</summary>
    public Models.Enums.PaymentStatus PaymentStatus { get; set; }

    /// <summary>Amount paid.</summary>
    public decimal? PaidAmount { get; set; }

    /// <summary>When payment was completed.</summary>
    public DateTime? PaidAt { get; set; }

    /// <summary>External payment ID.</summary>
    public string? ExternalPaymentId { get; set; }

}
