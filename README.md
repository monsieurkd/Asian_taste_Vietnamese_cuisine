# Asian Taste Vietnamese Cuisine — Online Ordering

Online ordering platform for Asian Taste Vietnamese Restaurant
(329 Henley Beach Rd, Brooklyn Park, Adelaide SA 5032).

- **Customer web app** — browse menu, customise items, checkout (Stripe), order status
- **Admin dashboard** — live orders, order management, menu management, reports
- **API** — ASP.NET Core + PostgreSQL, Stripe payments, optional Lightspeed POS sync

See [`Asian_Taste_PRD.md`](Asian_Taste_PRD.md) for full product requirements,
[`MAJOR_UPDATE_PLAN.md`](MAJOR_UPDATE_PLAN.md) for the roadmap, and
[`docs/SESSION_NOTES.md`](docs/SESSION_NOTES.md) for the current state and what's next.

**Running it:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the
whole system fits together — what runs where, how a push reaches production, and
why the pieces are the way they are. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
has the setup commands.

**It is live:** [asian-taste-customer.vercel.app](https://asian-taste-customer.vercel.app)
(customer app) → [asian-taste-api.fly.dev](https://asian-taste-api.fly.dev/health/db) (API).
Check it with `./scripts/check-deployment-health.sh`.

**What's left:** [`docs/TODO.md`](docs/TODO.md) — the outstanding items, the
decisions taken (and how to reverse each), and what is known to be missing.

---

## Tech stack

| Layer | Technology |
|---|---|
| API | ASP.NET Core (net10.0), Dapper, Npgsql |
| Database | PostgreSQL |
| Customer app | React 19 + TypeScript + Vite + Zustand + Tailwind v4 |
| Admin app | React 19 + TypeScript + Vite + React Query + Tailwind v4 |
| Payments | Stripe |

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| .NET SDK | 10.0+ | `dotnet --version` |
| Node.js | 20+ | `node --version` |
| PostgreSQL | 14+ | `psql --version` |

---

## Repository layout

```
AsianTaste.sln              Solution (API + tests)
src/AsianTaste.API/         ASP.NET Core API
src/asian-taste-customer/   Customer ordering web app   (http://localhost:5173)
src/asian-taste-admin/      Admin dashboard             (http://localhost:5174)
tests/AsianTaste.API.Tests/ xUnit tests
tests/payloads/             Payment/webhook test fixtures
```

---

## Setup

### 1. Database

Create the development database (the API creates tables and seeds data on first run):

```bash
createdb AsianTaste_Dev
```

### 2. API configuration

Local secrets are **not** committed. Restore them with .NET user-secrets:

```bash
cd src/AsianTaste.API

dotnet user-secrets set "Stripe:SecretKey"       "sk_test_..."
dotnet user-secrets set "Stripe:PublishableKey"  "pk_test_..."
dotnet user-secrets set "Encryption:Key"         "<base64 32-byte key>"
```

The connection string lives in `appsettings.Development.json` (gitignored).
Start from the template: `cp appsettings.Development.json.example appsettings.Development.json`.

`Encryption:Key` must be a base64-encoded 256-bit key. Generate one:

```bash
openssl rand -base64 32
```

### 3. Frontends

```bash
# Customer app
cd src/asian-taste-customer
cp .env.development.example .env.development
npm install

# Admin app
cd ../asian-taste-admin
cp .env.example .env.development
npm install
```

---

## Running

Three terminals (the API must be on **port 5070** — both apps proxy to it):

```bash
# 1. API            -> http://localhost:5070
cd src/AsianTaste.API && dotnet run

# 2. Customer app   -> http://localhost:5173
cd src/asian-taste-customer && npm run dev

# 3. Admin app      -> http://localhost:5174
cd src/asian-taste-admin && npm run dev
```

**Admin login (seeded):** username `admin` / password `Admin123!` — **local development
only.** The deployed database's password has been changed away from this default. A new
environment must change it before being exposed; the value is not recorded in this repo.

> If a port is stuck: `lsof -ti:5070 | xargs kill -9`

---

## Development endpoints

Only available when `ASPNETCORE_ENVIRONMENT=Development`:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/dev/db/status` | Is the schema initialised? |
| POST | `/api/dev/db/init` | Create schema |
| POST | `/api/dev/db/seed` | Re-seed menu data |
| POST | `/api/dev/db/reset` | Drop and recreate all tables |
| GET | `/api/dev/db/recent-orders` | Last 5 orders |
| GET | `/api/dev/payment/config` | Which payment gateway is active |
| GET | `/api/dev/lightspeed/config` | Lightspeed configuration status |

API docs (Swagger UI) are served at `/swagger` in development.

---

## Testing

```bash
# API unit tests
dotnet test

# Frontend typecheck + production build
cd src/asian-taste-customer && npm run build
cd src/asian-taste-admin    && npm run build

# Lint
cd src/asian-taste-customer && npm run lint
cd src/asian-taste-admin    && npm run lint
```

Payment mock fixtures live in `tests/payloads/`; `tests/test-payment-mock.sh`
exercises the mock payment gateway.

### Guardrails (run before calling a change done)

```bash
./scripts/check-test-wiring.sh    # every tracked test file can actually run
./scripts/check-test-health.sh    # tests really ran; none skipped; count >= .test-baseline
./scripts/check-ci-integrity.sh   # guardrails intact; change is reviewable
```

See [`docs/GUARDRAILS.md`](docs/GUARDRAILS.md).

### UI quality loop (frontend equivalent of a test suite)

```bash
npm install                       # repo root: playwright-core + dotenv
# with the API (:5070) and a frontend dev server running:
npm run ui:shots                  # screenshots the key screens -> ui-shots/
npm run ui:judge                  # a vision LLM scores them against docs/ui-rubric.md
```

Needs a vision API key in `.env.local` — see [`.env.example`](.env.example) and
[`docs/ui-qa-loop.md`](docs/ui-qa-loop.md). Fix `[high]` findings against the tokens,
re-run, repeat.

---

## Configuration notes

- **Secrets** never go in committed files. Use `dotnet user-secrets` locally and
  environment variables in production (`Stripe__SecretKey`, `Encryption__Key`,
  `Jwt__SecretKey` — note the double underscore).
- **Time zone:** the restaurant runs on `Australia/Adelaide`.
- **Prices are GST-inclusive** (Australian convention); GST is not added at checkout.
- **CORS:** development allows the local frontend origins; production origins must
  be configured explicitly in `Program.cs`.
