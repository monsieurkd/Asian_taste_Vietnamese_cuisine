# Asian Taste Vietnamese Cuisine — Online Ordering

Online ordering platform for Asian Taste Vietnamese Restaurant
(329 Henley Beach Rd, Brooklyn Park, Adelaide SA 5032).

- **Customer web app** — browse menu, customise items, checkout (Stripe), order status
- **Admin dashboard** — live orders, order management, menu management, reports
- **API** — ASP.NET Core + PostgreSQL, Stripe payments, optional Lightspeed POS sync

**Start with [`docs/TODO.md`](docs/TODO.md)** — the live list: what's outstanding, the
decisions taken, and how to reverse each one. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
explains how the parts fit together.

Everything else that describes the project is history, not current state, and lives in
[`docs/archive/`](docs/archive/README.md) — the superseded PRD and update plan, an
out-of-date progress tracker, one generated CI report, a dated session log, and the
owner's answers from 2026-09-16. Review-shaped work is tracked as GitHub
[issues](https://github.com/monsieurkd/Asian_taste_Vietnamese_cuisine/issues); `docs/`
holds reference material only.

**Running it:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the
whole system fits together — what runs where, how a push reaches production, and
why the pieces are the way they are. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
has the setup commands.

**It is live:** [asian-taste-customer.vercel.app](https://asian-taste-customer.vercel.app)
(customer app) → [asian-taste-api.fly.dev](https://asian-taste-api.fly.dev/health/db) (API).
Check it with `./scripts/check-deployment-health.sh`.

**What's left:** [`docs/TODO.md`](docs/TODO.md) — the outstanding items, the
decisions taken (and how to reverse each), and what is known to be missing.

**Reviewing the look and structure of this project?** That review is tracked as
[issue #3](https://github.com/monsieurkd/Asian_taste_Vietnamese_cuisine/issues/3)
— scope, access and what is wanted back are in the issue, not in a file here.
GitHub is the tracker for review work; `docs/` holds reference material only.

---

## Run the demo

No setup and no local database: everything below runs against the deployed stack.
Nothing you do here takes real money — the API is on **Stripe test keys**, so no
card is ever charged (see [Payments](#payments-test-mode)).

| What | URL |
|---|---|
| Customer app | <https://asian-taste-customer.vercel.app> |
| Admin dashboard | <https://asian-taste-vietnamese-cuisine-wq44.vercel.app> |
| API | <https://asian-taste-api.fly.dev> ([`/health/db`](https://asian-taste-api.fly.dev/health/db) shows whether the database and menu are up) |

**Admin login**

```
username   admin
password   nhahangvietnam
```

> This is the **deployed** password, written down here so a reviewer can get in
> without asking — which means it now lives in git history: **rotate it after the
> review** by updating the `admin_users` row, or delete the row and let the next
> boot re-seed the documented default. (The seed only re-creates an admin when
> the table has **no** rows, so deleting one admin while others remain is what
> sticks.) `Admin123!` — the default in
> `Data/Migrations/03_create_admin_user.sql` — applies to a **fresh local
> database only**; the deployed one was rotated off it on 2026-09-13.

**A five-minute walkthrough**

Customer app:

1. Open the customer app → **Order Now** (or **Menu**) → pick a category.
2. Open **Pho – Beef noodle soup (1 choice)**. It has four option groups — Spice
   level, Allergy, Combo, Extras — which is the customisation path worth
   inspecting; most dishes have none.
3. **Add to cart** → **Cart** → **Checkout**. Leave the service on **Pickup**
   (delivery does not complete a checkout in v1 and the UI says so). Fill in
   name, mobile and email.
4. Pay with a test card below → the confirmation screen shows a real order
   number (`AT-…`) and a status tracker.

Admin dashboard (same order, the kitchen's view):

5. Log in and open **Orders**. The order you just placed is there; in a second
   tab it arrives by itself over WebSocket — the list is live.
6. Open the order → move it **Placed → Confirmed → Ready**. The customer's
   tracker reflects each step.

Tear-down: the order is test data in a live database. Cancel it in the admin, or
ask for it to be deleted — there is no delete endpoint yet
([`docs/TODO.md`](docs/TODO.md) §6).

### Payments (test mode)

The Stripe **publishable** key in the deployed customer bundle is a `pk_test_…`
key, so the whole checkout runs in test mode: real Stripe API, no money moved, a
test card is required. (Which mode the API is in is printed in its logs — `fly
logs -a asian-taste-api | grep STRIPE`.)

Test cards — use **any future expiry** and **any 3-digit CVC**:

| Card number | What it does | Why you'd use it |
|---|---|---|
| `4242 4242 4242 4242` | Succeeds | The normal demo path |
| `4000 0025 0000 3155` | Requires 3-D Secure authentication | Exercises the challenge step in the PaymentElement |
| `4000 0000 0000 0002` | Declined (generic) | Confirms a decline surfaces as a message, not a crash |
| `4000 0000 0000 9995` | Declined — insufficient funds | Same, with the specific decline reason |

The full list is Stripe's own: <https://docs.stripe.com/testing#cards>.

**Three things this demo cannot show.** Apple Pay is configured in code but not
active — it needs a domain registered with Stripe, and a `*.vercel.app` host
cannot be registered ([`docs/TODO.md`](docs/TODO.md) §3). It also cannot be
tested in Chrome, on Windows, or on localhost; it needs Safari on an Apple device
with a card in Wallet, so a green headless run proves nothing about it. Delivery
is offered in the UI but does not complete a checkout — v1 is pickup only. And it
is test mode, so orders placed here are not real.

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
#    ASPNETCORE_ENVIRONMENT=Development is REQUIRED locally. Without it ASP.NET
#    falls back to appsettings.json and, historically, a second database that
#    shadowed this one and could not serve the admin app. It is set on Fly for
#    production; locally it is yours to pass.
cd src/AsianTaste.API && ASPNETCORE_ENVIRONMENT=Development dotnet run

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

See [`docs/GUARDRAILS.md`](docs/GUARDRAILS.md) for what each one catches and why they
are tiered by cost.

Checks run at three speeds, and each check lives in exactly one tier:

| Tier | When | What |
|---|---|---|
| Fast | on commit, via `.githooks/pre-commit` | the two static guardrails (~0.7s) |
| Mid | every push and PR | the API suite once, `check-test-health.sh` judging that run, frontend lint + test + build |
| Slow | nightly + manual dispatch | `ui-quality.yml`: the screenshot-and-vision-judge loop |

Enable the fast tier once per clone (it is `core.hooksPath`, which a repository cannot
set for you):

```bash
git config core.hooksPath .githooks
```

`check-test-health.sh` reads the TRX that CI's test step wrote when `TEST_RESULTS_DIR`
is set, so the suite is not run twice. Unset, it runs the suite itself — that is the
command above.

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
