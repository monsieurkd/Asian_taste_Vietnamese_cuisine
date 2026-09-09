using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Email;

namespace AsianTaste.API.Controllers;

/// <summary>
/// API controller for customer account management.
/// </summary>
[ApiController]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly CustomerService _customerService;
    private readonly IEmailService _emailService;
    private readonly ILogger<CustomersController> _logger;

    public CustomersController(
        CustomerService customerService,
        IEmailService emailService,
        ILogger<CustomersController> logger)
    {
        _customerService = customerService;
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Registers a new customer account.
    /// </summary>
    /// <param name="request">The registration request.</param>
    /// <returns>The authentication response with token.</returns>
    [HttpPost("register")]
    [ProducesResponseType(typeof(CustomerAuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CustomerAuthResponseDto>> Register([FromBody] RegisterCustomerDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            return BadRequest(new { error = "Password must be at least 8 characters long" });
        }

        var result = await _customerService.RegisterAsync(request);

        if (!result.Success)
        {
            return BadRequest(new { error = result.Error });
        }

        // Send welcome email
        if (result.Customer != null)
        {
            await _emailService.SendWelcomeEmailAsync(
                result.Customer.Email,
                result.Customer.FirstName ?? result.Customer.Email.Split('@')[0]);
        }

        return Ok(result);
    }

    /// <summary>
    /// Authenticates a customer with email and password.
    /// </summary>
    /// <param name="request">The login request.</param>
    /// <returns>The authentication response with token.</returns>
    [HttpPost("login")]
    [ProducesResponseType(typeof(CustomerAuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<CustomerAuthResponseDto>> Login([FromBody] LoginCustomerDto request)
    {
        var result = await _customerService.LoginAsync(request);

        if (!result.Success)
        {
            return Unauthorized(new { error = result.Error });
        }

        return Ok(result);
    }

    /// <summary>
    /// Creates a customer account from an existing order.
    /// </summary>
    /// <param name="request">The account creation request.</param>
    /// <returns>The authentication response with token.</returns>
    [HttpPost("create-from-order")]
    [ProducesResponseType(typeof(CustomerAuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CustomerAuthResponseDto>> CreateFromOrder([FromBody] CreateCustomerAccountFromOrderDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            return BadRequest(new { error = "Password must be at least 8 characters long" });
        }

        var result = await _customerService.CreateAccountFromOrderAsync(request);

        if (!result.Success)
        {
            return BadRequest(new { error = result.Error });
        }

        // Send welcome email
        if (result.Customer != null)
        {
            await _emailService.SendWelcomeEmailAsync(
                result.Customer.Email,
                result.Customer.FirstName ?? result.Customer.Email.Split('@')[0]);
        }

        return Ok(result);
    }

    /// <summary>
    /// Gets the current customer's profile.
    /// </summary>
    /// <returns>The customer profile.</returns>
    [HttpGet("profile")]
    [Authorize]
    [ProducesResponseType(typeof(CustomerProfileResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(object), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CustomerProfileResponseDto>> GetProfile()
    {
        var customerIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(customerIdClaim, out var customerId))
        {
            return Unauthorized(new { error = "Invalid token" });
        }

        var profile = await _customerService.GetProfileAsync(customerId);
        if (profile == null)
        {
            return NotFound(new { error = "Customer not found" });
        }

        return Ok(profile);
    }

    /// <summary>
    /// Updates the current customer's profile.
    /// </summary>
    /// <param name="request">The update request.</param>
    /// <returns>The updated customer profile.</returns>
    [HttpPut("profile")]
    [Authorize]
    [ProducesResponseType(typeof(CustomerProfileResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<CustomerProfileResponseDto>> UpdateProfile([FromBody] UpdateCustomerProfileDto request)
    {
        var customerIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(customerIdClaim, out var customerId))
        {
            return Unauthorized(new { error = "Invalid token" });
        }

        var profile = await _customerService.UpdateProfileAsync(customerId, request);
        if (profile == null)
        {
            return NotFound(new { error = "Customer not found" });
        }

        return Ok(profile);
    }

    /// <summary>
    /// Validates the current JWT token and returns customer info.
    /// </summary>
    /// <returns>The customer info if token is valid.</returns>
    [HttpPost("validate")]
    [Authorize]
    [ProducesResponseType(typeof(CustomerResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status401Unauthorized)]
    public IActionResult ValidateToken()
    {
        var customerIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var emailClaim = User.FindFirst(ClaimTypes.Email)?.Value;
        var customerNumberClaim = User.FindFirst("customer_number")?.Value;

        if (string.IsNullOrEmpty(customerIdClaim) || string.IsNullOrEmpty(emailClaim))
        {
            return Unauthorized(new { error = "Invalid token" });
        }

        return Ok(new
        {
            customerId = int.Parse(customerIdClaim),
            email = emailClaim,
            customerNumber = customerNumberClaim
        });
    }
}
