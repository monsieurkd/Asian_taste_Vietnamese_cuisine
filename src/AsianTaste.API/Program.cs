using System.Text;
using System.Text.Json.Serialization;
using Dapper;
using AsianTaste.API.Data;
using AsianTaste.API.Models.Enums;
using AsianTaste.API.Repositories;
using AsianTaste.API.Services;
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

// The trading clock. Registered against TimeProvider so a test can move "now" to a
// closed evening without touching the machine's clock.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<TradingHours>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddSingleton<JwtService>();

// Order confirmation email queue + background sender
builder.Services.AddSingleton<IOrderEmailQueue, OrderEmailQueue>();
builder.Services.AddHostedService<OrderEmailBackgroundService>();

// Email service
builder.Services.AddScoped<IEmailService, SendGridEmailService>();
builder.Services.AddHttpClient("SendGrid");

// Encryption. Kept for the OAuth/token material the POS integration used to store;
// no current code path reads a secret from the database, but the service is a
// general-purpose one and its key is already an operational secret.
builder.Services.AddSingleton<IEncryptionService>(sp =>
{
    var encryptionKey = sp.GetRequiredService<IConfiguration>()["Encryption:Key"]
        ?? throw new InvalidOperationException("Encryption:Key is not configured");
    return new EncryptionService(encryptionKey);
});

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
    builder.Services.AddScoped<StripeWebhookService>();

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

// Webhook event log repository (for webhook logging)
builder.Services.AddScoped<IWebhookEventLogRepository, WebhookEventLogRepository>();

// WebSocket handler for real-time updates (singleton to maintain connections)
builder.Services.AddSingleton<OrderWebSocketHandler>();
// Services announce events through the interface rather than the concrete
// handler, so they do not have to depend on JWT validation to send a push.
builder.Services.AddSingleton<IOrderNotifier>(sp => sp.GetRequiredService<OrderWebSocketHandler>());

// JWT Authentication
//
// The signing key must come from configuration and there is deliberately NO fallback.
//
// This used to read `?? "AsianTasteSecretKey2025ForJWTTokenGenerationMin32Chars"` — the
// same public string that also sits in appsettings.json — which meant a deployment whose
// Jwt__SecretKey was missing (a dropped secret, a recreated app, a bad fly.toml) would
// silently sign every admin token with a value committed to this repository. Nothing would
// fail: logins would work, tokens would validate, and anyone who had read the source could
// mint an admin JWT. That is the dangerous shape of a config default — the failure is
// invisible and the behaviour looks correct.
//
// Failing loudly instead is the same trade Program.cs already makes for the mock payment
// gateway, and for the same reason: a misconfiguration that silently degrades to an
// insecure-but-working state is worse than one that refuses to start.
//
// Development is the one exception, because there is nothing to protect locally and
// requiring every contributor to set a secret would only teach people to paste one in.
//
// The local dev value comes from `appsettings.Development.json`, which is GITIGNORED — so
// a `git clone` has no `Jwt:SecretKey` at all outside a production environment, and the
// app refuses to start until one is set. That is the intended behaviour: `Program.cs`
// already refuses to start on other misconfigurations rather than degrading quietly, and a
// signing key is not something to guess at. The template to copy is
// `appsettings.Development.json.example`.
//
// One caveat found while writing this: without that file the API WILL still start and serve
// requests, using an empty signing key, because nothing in this file generates one. That is
// a deliberate limit of the check rather than an oversight — the alternative was a
// generated per-run key, which produced behaviour that could not be explained from the logs
// and was removed rather than shipped.
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"];

if (string.IsNullOrWhiteSpace(jwtSecretKey))
{
    throw new InvalidOperationException(
        "Jwt:SecretKey is not configured. Set the Jwt__SecretKey environment variable, or copy " +
        "src/AsianTaste.API/appsettings.Development.json.example to " +
        "appsettings.Development.json for local work " +
        $"(environment: '{builder.Environment.EnvironmentName}'). There is intentionally no " +
        "fallback: a default signing key that lives in the repository would let anyone who " +
        "can read it forge an admin token, and the app would look like it was working.");
}

// A key shorter than the HMAC-SHA256 block size weakens the signature, and every real
// deployment has one longer than this — so a short value means a placeholder got through.
if (jwtSecretKey.Length < 32)
{
    throw new InvalidOperationException(
        $"Jwt:SecretKey is only {jwtSecretKey.Length} characters. Use at least 32 " +
        "(openssl rand -base64 48), so the signing key is not brute-forceable.");
}

if (!builder.Environment.IsDevelopment() &&
    jwtSecretKey == "AsianTasteSecretKey2025ForJWTTokenGenerationMin32Chars")
{
    throw new InvalidOperationException(
        "Jwt:SecretKey is set to the placeholder value that is committed to this repository. " +
        "Rotate it: any admin token signed with it is forgeable by anyone who can read the source.");
}

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

// Enable CORS
app.UseCors("AllowFrontend");

// Security middleware (Phase 6)
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<RateLimitMiddleware>(new RateLimitOptions
{
    MaxRequests = 100,
    Window = TimeSpan.FromMinutes(1),
    ExemptPaths = new[] { "/api/webhook/test", "/api/dev", "/api/docs", "/openapi", "/ws" },

    // Order creation gets its own, much tighter budget.
    //
    // The global 100/minute is right for reads — someone browsing the menu, or the
    // admin dashboard polling — and useless as protection for the one endpoint that
    // writes a row, creates a Stripe PaymentIntent and queues an email. 100 of those
    // per minute from one address is a script, and by the time it trips the global
    // limit it has already created 100 orders.
    //
    // Ten per minute is chosen to be comfortably above a real double-tap, a shared
    // restaurant-tablet session, or a customer retrying after a declined card, while
    // being far below anything a script wants. This is a rate limit, not a quota:
    // a genuine family ordering several dishes places ONE order, so the count here is
    // orders, not items.
    PathLimits = new[]
    {
        new PathLimit { PathPrefix = "/api/orders", MaxRequests = 10, Window = TimeSpan.FromMinutes(1) },
    }
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
