using System.Text;
using System.Text.Json.Serialization;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
using AsianTaste.API.Services.Lightspeed;
using AsianTaste.API.Services.Payment;
using AsianTaste.API.Services.Payment.Interfaces;
using AsianTaste.API.Services.Email;
using MockPaymentGateway = AsianTaste.API.Services.Payment.MockPaymentGateway;
using AsianTaste.API.Services.Webhooks;
using AsianTaste.API.WebSockets;
using AsianTaste.API.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;
using Npgsql;
using EnumOrderType = AsianTaste.API.Models.Enums.OrderType;

// Configure PostgreSQL enum mappings BEFORE any connections are created
// This must happen at app startup before any database operations
NpgsqlConnection.GlobalTypeMapper.MapEnum<EnumOrderType>("order_type");
NpgsqlConnection.GlobalTypeMapper.MapEnum<OrderStatus>("order_status");
NpgsqlConnection.GlobalTypeMapper.MapEnum<PaymentMethod>("payment_method");
NpgsqlConnection.GlobalTypeMapper.MapEnum<AsianTaste.API.Models.Enums.PaymentStatus>("payment_status");
NpgsqlConnection.GlobalTypeMapper.MapEnum<SyncStatus>("sync_status");

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddScoped<IDbConnectionFactory, DbConnectionFactory>();
builder.Services.AddScoped<IDatabaseInitializationService, DatabaseInitializationService>();
builder.Services.AddScoped<IMenuRepository, MenuRepository>();
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IAdminRepository, AdminRepository>();
builder.Services.AddScoped<IRestaurantSettingsRepository, RestaurantSettingsRepository>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddSingleton<JwtService>();

// Order confirmation email queue + background sender
builder.Services.AddSingleton<IOrderEmailQueue, OrderEmailQueue>();
builder.Services.AddHostedService<OrderEmailBackgroundService>();

// Email service
builder.Services.AddScoped<IEmailService, SendGridEmailService>();
builder.Services.AddHttpClient("SendGrid");

// Lightspeed integration services
builder.Services.AddSingleton<IEncryptionService>(sp =>
{
    var encryptionKey = sp.GetRequiredService<IConfiguration>()["Encryption:Key"]
        ?? throw new InvalidOperationException("Encryption:Key is not configured");
    return new EncryptionService(encryptionKey);
});
builder.Services.AddScoped<ILightspeedRepository, LightspeedRepository>();
builder.Services.AddScoped<ILightspeedAuthService, LightspeedAuthService>();

// Payment gateway services - Stripe is now the primary payment provider
if (builder.Configuration.GetValue<bool>("Payment:UseMockGateway", false))
{
    builder.Services.AddScoped<IPaymentGatewayService, MockPaymentGateway>();
    Console.WriteLine("=== MOCK PAYMENT GATEWAY ENABLED - No real payments will be processed ===");
}
else
{
    // Stripe is the default payment provider
    // Configure and register StripeConfiguration as a scoped service
    builder.Services.Configure<StripeConfiguration>(
        builder.Configuration.GetSection("Stripe"));
    builder.Services.AddScoped<StripeConfiguration>(sp =>
        sp.GetRequiredService<IOptions<StripeConfiguration>>().Value);
    builder.Services.AddScoped<IPaymentGatewayService, StripePaymentGateway>();
    builder.Services.AddScoped<IWebhookService, StripeWebhookService>();

    Console.WriteLine("=== STRIPE PAYMENT GATEWAY ENABLED ===");
}

// Order sync services (Phase 3)
builder.Services.AddScoped<ILightspeedOrderService, LightspeedOrderService>();

// Background services (Phase 3)
builder.Services.AddHostedService<OrderSyncBackgroundService>();

// Webhook event log repository (for webhook logging)
builder.Services.AddScoped<IWebhookEventLogRepository, WebhookEventLogRepository>();

// HttpClient for Lightspeed API calls
builder.Services.AddHttpClient("Lightspeed", client =>
{
    client.BaseAddress = new Uri("https://api.lightspeedapp.com/API/");
    client.Timeout = TimeSpan.FromSeconds(30);
});

// WebSocket handler for real-time updates (singleton to maintain connections)
builder.Services.AddSingleton<OrderWebSocketHandler>();

// JWT Authentication
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"] ?? "AsianTasteSecretKey2025ForJWTTokenGenerationMin32Chars";
var jwtKey = Encoding.UTF8.GetBytes(jwtSecretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "AsianTasteAPI",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "AsianTasteAdmin",
        IssuerSigningKey = new SymmetricSecurityKey(jwtKey),
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

// Configure JSON serialization options
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddControllers();

// CORS - Allow frontend to communicate with API
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173", // Customer app
                "http://localhost:5174", // Admin app
                "http://localhost:5175")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Add NSwag for Swagger/OpenAPI generation
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerDocument(options =>
{
    options.Title = "Asian Taste API";
    options.Version = "v1";
});

var app = builder.Build();

// Initialize database on startup (auto-seeds if database is new)
using (var scope = app.Services.CreateScope())
{
    var dbService = scope.ServiceProvider.GetRequiredService<IDatabaseInitializationService>();
    await dbService.InitializeAsync();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUi();

    // Development-only database management endpoints
    app.MapGet("/api/dev/db/status", async (IDatabaseInitializationService dbService) =>
    {
        var isInitialized = await dbService.IsDatabaseInitializedAsync();
        return Results.Ok(new { initialized = isInitialized });
    });

    app.MapPost("/api/dev/db/init", async (IDatabaseInitializationService dbService) =>
    {
        await dbService.InitializeAsync();
        return Results.Ok(new { message = "Database initialized successfully" });
    });

    app.MapPost("/api/dev/db/reset", async (IDatabaseInitializationService dbService) =>
    {
        await dbService.ResetDatabaseAsync();
        return Results.Ok(new { message = "Database reset successfully" });
    });

    app.MapPost("/api/dev/db/seed", async (IDatabaseInitializationService dbService) =>
    {
        await dbService.SeedAsync();
        return Results.Ok(new { message = "Database seeded successfully" });
    });

    app.MapGet("/api/dev/db/orders-columns", async (IDbConnectionFactory dbFactory) =>
    {
        using var connection = dbFactory.CreateConnection();
        connection.Open();
        var columns = await connection.QueryAsync<string>(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position");
        return Results.Ok(new { columns = columns.AsList() });
    });

    app.MapGet("/api/dev/db/recent-orders", async (IDbConnectionFactory dbFactory) =>
    {
        using var connection = dbFactory.CreateConnection();
        connection.Open();
        var orders = await connection.QueryAsync<dynamic>(
            "SELECT id, order_number, customer_name, total, status::text as status FROM orders ORDER BY id DESC LIMIT 5");
        return Results.Ok(orders);
    });

    // Lightspeed connection status
    app.MapGet("/api/dev/lightspeed/status", async (ILightspeedAuthService authService) =>
    {
        var token = await authService.GetTokenAsync();
        var isConnected = token != null && authService.IsTokenValid(token);
        return Results.Ok(new
        {
            connected = isConnected,
            accountId = token?.AccountId,
            tokenValidUntil = token?.ExpiresAt,
            hasConfig = !string.IsNullOrEmpty(builder.Configuration["Lightspeed:ClientId"])
        });
    });

    // Lightspeed configuration check
    app.MapGet("/api/dev/lightspeed/config", (IConfiguration config) =>
    {
        return Results.Ok(new
        {
            hasClientId = !string.IsNullOrEmpty(config["Lightspeed:ClientId"]),
            hasClientSecret = !string.IsNullOrEmpty(config["Lightspeed:ClientSecret"]),
            hasRedirectUri = !string.IsNullOrEmpty(config["Lightspeed:RedirectUri"]),
            hasEncryptionKey = !string.IsNullOrEmpty(config["Encryption:Key"]),
            redirectUri = config["Lightspeed:RedirectUri"]
        });
    });

    // Payment configuration check
    app.MapGet("/api/dev/payment/config", (IConfiguration config) =>
    {
        return Results.Ok(new
        {
            useMockGateway = config.GetValue<bool>("Payment:UseMockGateway", false),
            mockAutoApprove = config.GetValue<bool>("Payment:MockAutoApprove", false),
            stripe = new
            {
                hasSecretKey = !string.IsNullOrEmpty(config["Stripe:SecretKey"]),
                hasPublishableKey = !string.IsNullOrEmpty(config["Stripe:PublishableKey"]),
                hasWebhookSecret = !string.IsNullOrEmpty(config["Stripe:WebhookSecret"]),
                currency = config["Stripe:Currency"] ?? "aud",
                isTestMode = config["Stripe:SecretKey"]?.StartsWith("sk_test_") ?? false
            }
        });
    });
}

app.UseHttpsRedirection();

// Enable CORS
app.UseCors("AllowFrontend");

// Security middleware (Phase 6)
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<RateLimitMiddleware>(new RateLimitOptions
{
    MaxRequests = 100,
    Window = TimeSpan.FromMinutes(1),
    ExemptPaths = new[] { "/api/webhook/test", "/api/dev", "/api/docs", "/openapi", "/ws" }
});

// Webhook security middleware (Phase 4) - must be before authentication/authorization
app.UseMiddleware<WebhookSecurityMiddleware>();

// Enable WebSockets (required for .NET 10+)
app.UseWebSockets();

// Authentication & Authorization (global middleware)
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// WebSocket endpoint for real-time order updates
// Must use RequireAuthorization with AllowAnonymous to bypass auth middleware
// Authentication is handled via the token query parameter
app.Map("/ws/orders", async context =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();

    // Manual WebSocket check - IsWebSocketRequest can be unreliable when middleware is used
    bool isWebSocketRequest =
        context.Request.Headers.TryGetValue("Upgrade", out var upgrade) &&
        upgrade.ToString().Equals("websocket", StringComparison.OrdinalIgnoreCase) &&
        context.Request.Headers.TryGetValue("Connection", out var connection) &&
        connection.ToString().Contains("upgrade", StringComparison.OrdinalIgnoreCase) &&
        context.Request.Headers.TryGetValue("Sec-WebSocket-Version", out var wsVersion) &&
        context.Request.Headers.TryGetValue("Sec-WebSocket-Key", out var wsKey);

    if (!isWebSocketRequest)
    {
        logger.LogWarning("Not a valid WebSocket request");
        context.Response.StatusCode = 400;
        await context.Response.WriteAsync("This endpoint accepts WebSocket connections only.");
        return;
    }

    logger.LogInformation("Accepting WebSocket connection");

    var webSocketHandler = context.RequestServices.GetRequiredService<OrderWebSocketHandler>();
    var token = context.Request.Query["token"];

    using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
    await webSocketHandler.HandleWebSocketAsync(webSocket, token);
}).AllowAnonymous();

app.Run();
