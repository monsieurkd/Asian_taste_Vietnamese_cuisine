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

// PostgreSQL enum mappings are declared on the shared NpgsqlDataSource inside
// DbConnectionFactory. (The obsolete NpgsqlConnection.GlobalTypeMapper approach
// used process-global mutable state and was removed in Npgsql 7+.)

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Singleton: the NpgsqlDataSource behind it is expensive to build and is
// designed to be shared for the lifetime of the application.
builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
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

// Payment gateway services. Stripe is the default; the mock must be asked for.
//
// This block used to be inverted in a way that cost real money: appsettings.json
// (which applies to EVERY environment, production included) shipped
// "UseMockGateway": true, so a deployment that did not explicitly set
// Payment__UseMockGateway=false would run the mock gateway — which approves every
// charge without contacting Stripe. Card orders came back "Paid online" and were
// recorded as paid while no money moved. Nothing errored; it looked like it worked.
//
// Two changes prevent that class of failure:
//   * appsettings.json now defaults to false, so the real gateway is what you get
//     by default and the mock must be opted into.
//   * The mock is REFUSED outside Development, below, so even an explicit
//     UseMockGateway=true cannot turn a production deployment free.
var useMockGateway = builder.Configuration.GetValue<bool>("Payment:UseMockGateway", false);

if (useMockGateway && !builder.Environment.IsDevelopment())
{
    throw new InvalidOperationException(
        "Payment:UseMockGateway is true but the environment is " +
        $"'{builder.Environment.EnvironmentName}'. The mock gateway approves payments " +
        "without contacting Stripe, so every order would be accepted unpaid. Set " +
        "Payment__UseMockGateway=false, or remove it to use the default.");
}

if (useMockGateway)
{
    builder.Services.AddScoped<IPaymentGatewayService, MockPaymentGateway>();
    Console.WriteLine("=== MOCK PAYMENT GATEWAY ENABLED - No real payments will be processed ===");
}
else
{
    // Configure and register StripeConfiguration as a scoped service
    builder.Services.Configure<StripeConfiguration>(
        builder.Configuration.GetSection("Stripe"));
    builder.Services.AddScoped<StripeConfiguration>(sp =>
        sp.GetRequiredService<IOptions<StripeConfiguration>>().Value);
    builder.Services.AddScoped<IPaymentGatewayService, StripePaymentGateway>();
    builder.Services.AddScoped<IWebhookService, StripeWebhookService>();

    // Say which mode the real gateway is in. A live deployment running on a
    // test key would take no money, and that is worth noticing immediately
    // rather than when the first customer cannot pay.
    var secretKey = builder.Configuration["Stripe:SecretKey"];
    if (string.IsNullOrWhiteSpace(secretKey))
    {
        Console.WriteLine(
            "=== STRIPE PAYMENT GATEWAY ENABLED, BUT Stripe:SecretKey IS NOT SET. " +
            "Card payments will fail. Set Stripe__SecretKey. ===");
    }
    else if (secretKey.StartsWith("sk_test_", StringComparison.Ordinal))
    {
        Console.WriteLine(
            "=== STRIPE PAYMENT GATEWAY ENABLED IN TEST MODE (sk_test_...). " +
            "Card payments will succeed without real money moving. ===");
    }
    else
    {
        Console.WriteLine("=== STRIPE PAYMENT GATEWAY ENABLED (live keys) ===");
    }
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
// Services announce events through the interface rather than the concrete
// handler, so they do not have to depend on JWT validation to send a push.
builder.Services.AddSingleton<IOrderNotifier>(sp => sp.GetRequiredService<OrderWebSocketHandler>());

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

// CORS - Allow frontend to communicate with API.
//
// The allowed origins are configuration, not source. They used to be hardcoded
// to localhost, which means a deployed frontend would have every request blocked
// by CORS with no code path to fix it short of editing and redeploying the API.
// Set Cors:AllowedOrigins in the environment (Fly secrets) to the deployed
// frontend origins; the localhost entries remain as the development default so
// nothing changes locally.
//
// AllowCredentials is required because the customer app sends the auth bearer
// token, and it is also why origins must be listed explicitly — the CORS spec
// forbids combining credentials with a wildcard origin.
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>();

if (allowedOrigins is null || allowedOrigins.Length == 0)
{
    // A misconfigured CORS list is invisible from the API side: it starts
    // normally, logs nothing, and every browser request is rejected before it
    // reaches the app. The usual cause is a JSON array in the environment
    // (Cors__AllowedOrigins='["https://..."]'), which does not bind to string[]
    // — the indexed form (Cors__AllowedOrigins__0) is what works. So fall back
    // to localhost AND say so, in production.
    if (!builder.Environment.IsDevelopment())
    {
        Console.WriteLine(
            "=== WARNING: Cors:AllowedOrigins is not configured. Falling back to localhost, " +
            "so every request from the deployed frontend will be blocked by CORS. " +
            "Set Cors__AllowedOrigins__0 (indexed form), not a JSON array. ===");
    }

    allowedOrigins =
    [
        "http://localhost:5173", // Customer app
        "http://localhost:5174", // Admin app
        "http://localhost:5175",
    ];
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
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

// Initialize the database on startup (creates the schema and seeds a new database).
//
// This runs at boot, but a failure must NOT kill the process. It used to be an
// unguarded `await`, so any database problem — a wrong or missing connection
// string, Neon restarting, a network blip — threw before the HTTP listener was
// up. The consequences were worse than an error message:
//
//   * On Fly the process aborted, so the machine restarted, threw again, and
//     looped until it hit the restart limit. The crash loop was the symptom;
//     the actual error ("Failed to connect to 127.0.0.1:5432") was buried in
//     the restart spam and the app looked broken when it was simply misconfigured.
//   * /healthz could never answer, because the process died before binding the
//     port — which is why the liveness check has to be paired with this.
//
// So the failure is now logged with its full detail and the app still starts.
// Requests that genuinely need the database return 500 with a clear message
// (see the health endpoint below), which is a diagnosable failure instead of a
// restart loop. A database that is merely slow to accept connections on a cold
// start also gets a bounded retry first, which is the common case on a
// serverless Postgres that has scaled to zero.
const int databaseInitAttempts = 3;
for (var attempt = 1; ; attempt++)
{
    try
    {
        using var scope = app.Services.CreateScope();
        var dbService = scope.ServiceProvider.GetRequiredService<IDatabaseInitializationService>();
        await dbService.InitializeAsync();
        break;
    }
    catch (Exception ex) when (attempt < databaseInitAttempts)
    {
        app.Logger.LogWarning(
            ex,
            "Database initialization failed (attempt {Attempt}/{Total}). Retrying in 5s. " +
            "Check ConnectionStrings__DefaultConnection.",
            attempt, databaseInitAttempts);
        await Task.Delay(TimeSpan.FromSeconds(5));
    }
    catch (Exception ex)
    {
        // Out of retries. Log loudly and start anyway — the API will report the
        // problem on /health/db rather than disappearing into a restart loop.
        app.Logger.LogError(
            ex,
            "Database initialization FAILED after {Total} attempts. The API is starting " +
            "WITHOUT a working database. Check ConnectionStrings__DefaultConnection and " +
            "that the database is reachable. GET /health/db for the current status.",
            databaseInitAttempts);
        break;
    }
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

// Liveness probe, used by the Fly health check (see fly.toml).
//
// Deliberately does NOT touch the database, and is paired with the guarded
// startup above. A liveness check answers "is the process serving HTTP?", and
// that is the only question whose "no" should get the machine killed and
// restarted. When the equivalent check touched the database, a missing
// connection-string secret made it fail, so Fly killed and restarted the machine
// until it hit its restart limit — turning a one-line configuration error into a
// crash loop that hid the actual error.
//
// Dependency health belongs in a readiness endpoint (below), where a failure is
// *reported*, not in a liveness probe, where a failure destroys the evidence.
app.MapGet("/healthz", () => Results.Ok(new { status = "healthy" }))
   .AllowAnonymous();

// Readiness: is the database actually reachable? Returns 503 when it is not, so
// a monitoring tool (or a human with curl) gets a clear answer instead of a
// restart loop. This is the endpoint to check when the menu is empty.
app.MapGet("/health/db", async (IDbConnectionFactory dbFactory) =>
{
    try
    {
        using var connection = dbFactory.CreateConnection();
        connection.Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM menu_items";
        var count = Convert.ToInt64(cmd.ExecuteScalar());

        return Results.Ok(new { status = "healthy", menuItems = count });
    }
    catch (Exception ex)
    {
        // The message is returned deliberately: this endpoint is diagnostic, and
        // "database unreachable" without a reason is what made the original
        // failure hard to find. It exposes no credentials — Npgsql's message
        // names the host and port, never the password.
        return Results.Json(
            new { status = "unhealthy", error = ex.Message },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).AllowAnonymous();

// Readiness for POS sync: are any orders stuck?
//
// This exists because a stuck order was previously visible ONLY as a recurring
// log line ("Retrying 1 failed order(s)" every 30 seconds) that was itself
// misleading — it was emitted for an order the retrier had already given up on.
// Nothing anywhere said "an order needs a human".
//
// Deliberately separate from /health/db and deliberately not an error status: a
// stuck POS order must NOT make the API look unhealthy, because the API is fine
// and the restaurant can keep taking orders. It reports; it does not gate.
app.MapGet("/health/pos", async (IDbConnectionFactory dbFactory) =>
{
    try
    {
        using var connection = dbFactory.CreateConnection();
        connection.Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT
                COUNT(*) FILTER (WHERE lightspeed_sync_status::text = 'Failed') AS failed,
                COUNT(*) FILTER (WHERE lightspeed_sync_status::text = 'NotSynced') AS pending
            FROM orders
            WHERE lightspeed_sync_status IS NULL
               OR lightspeed_sync_status::text <> 'Synced'";
        using var reader = cmd.ExecuteReader();
        reader.Read();
        var failed = reader.GetInt64(0);
        var pending = reader.GetInt64(1);

        return Results.Ok(new
        {
            status = failed > 0 ? "attention" : "ok",
            failedOrders = failed,
            pendingOrders = pending,
            note = failed > 0
                ? "Orders have exhausted their POS retries and will not be retried again. "
                  + "They are visible in the admin dashboard and can be completed there."
                : "No orders need attention."
        });
    }
    catch (Exception ex)
    {
        return Results.Json(
            new { status = "unknown", error = ex.Message },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).AllowAnonymous();

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
