# AGENTS.md — Asian Taste Vietnamese Cuisine (online ordering)

Two React apps (customer + admin) → one ASP.NET Core API → PostgreSQL, with Stripe
payments and optional Lightspeed POS sync.

**`docs/TODO.md` is the live source of truth** for state, open items and taken
decisions (and how to reverse each). `docs/ARCHITECTURE.md` explains how the pieces
fit. Anything else describing the project — `docs/archive/`
— is history, not current state. `docs/DEPLOYMENT.md` has setup commands.

Review-shaped work (a visual/structure review, a proposed change, a bug report) is
tracked as a **GitHub issue**, not a markdown file; `docs/` holds reference material
only, and `docs/TODO.md` records what is outstanding and where each item came from.

## Project

| Piece | Where | Notes |
|---|---|---|
| API | `src/AsianTaste.API` (net10.0) | `Program.cs` is the composition root (DI, CORS, migrations at boot) |
| Customer app | `src/asian-taste-customer` | React 19 + Vite + Zustand, `:5173` |
| Admin app | `src/asian-taste-admin` | React 19 + Vite + React Query, `:5174` |
| Tests | `tests/AsianTaste.API.Tests` (xUnit) | solution `AsianTaste.sln` = API + tests only |

Production: customer app on Vercel, API on Fly (`asian-taste-api.fly.dev`, region
`syd`), DB on Neon (`ap-southeast-2`). Pushes to `main` → CI green → deploy.

## Commands

```bash
dotnet test                                     # API suite; floor is .test-baseline (117)
ASPNETCORE_ENVIRONMENT=Development dotnet run   # from src/AsianTaste.API, must be on :5070
                                                # both apps' Vite dev proxy points at :5070
                                                # the env var is required locally — without it
                                                # the API used to reach a different database
                                                # that had no admin tables and 500'd on login

cd src/asian-taste-customer && npm run dev      # :5173
cd src/asian-taste-admin    && npm run dev      # :5174
npm run build    # tsc -b && vite build   (both apps; strongest frontend check there is)
npm run lint     # eslint .               (blocking in CI)
npm test         # vitest run             (both apps)

./scripts/check-test-wiring.sh                  # can every tracked test file run?
./scripts/check-test-health.sh                  # did the suite really run, and mean something?
./scripts/check-ci-integrity.sh [--static-only] # are the guardrails still armed + diff reviewable?
./scripts/check-deployment-health.sh            # live production health, incl. POS backlog

git config core.hooksPath .githooks             # opt-in fast tier: pre-commit runs the 2 static guards

npm run ui:shots && npm run ui:judge            # repo-root UI quality loop (needs API + a dev server + .env.local)

node scripts/swarm/run.mjs --goal "..."         # autonomous swarm: brief → plan → build → test
                                                # → integrate → (with --merge) land it.
                                                # Start WITHOUT --merge. See scripts/swarm/README.md
node scripts/swarm/selftest.mjs                 # the swarm driver's own logic (38 checks)
```

Guardrails are tiered by cost and each check lives in exactly one tier (fast =
pre-commit, mid = CI, slow = nightly `ui-quality.yml`). See `docs/GUARDRAILS.md`.
Adding tests: raise `.test-baseline` in the same commit. Removing one: separate,
explained commit.

## Architecture — load-bearing pieces

- **`Program.cs`** — DI, CORS from `Cors__AllowedOrigins__N`, and the whole migration
  sequence at boot. Migrations are ordered and the order is forced (schema → de-dupe
  → conflict index → seed → 04-10 → indexes → admin user). A DB failure logs and
  **starts anyway** — it must not become a restart loop.
- **`Data/DatabaseInitializationService.cs`** + `Data/Migrations/*.sql` — numbered
  `.sql` files shipped as embedded resources, applied in that fixed order.
- **`Repositories/*.cs`** — Dapper, raw SQL, interfaces in the same folder
  (`IOrderRepository`, …). `OrderRepository` is ~1k lines and does its own
  snake_case → PascalCase mapping; that mapping breaking is a repeat offender.
- **`Services/`** — business logic. `Payment/` (Stripe + a mock gateway),
  `Lightspeed/`, `Webhooks/`, `Email/`, `JwtService`, `PasswordHasher`, `EncryptionService`.
- **`Controllers/`** — thin, `[ApiController]` + `[Route("api/[controller]")]`, XML-doc'd
  for Swagger, delegating to a service. `Admin*` controllers are JWT-protected.
- **`WebSockets/`** — pushes live orders to the admin dashboard (the kitchen's view).
- **`OrderSyncBackgroundService`** — POS sync queue/retry. **Never fails the order**:
  the customer has paid, so a POS failure queues and retries.
- **`HealthChecks`** — `/healthz` is liveness and is the only one wired to Fly;
  `/health/db` and `/health/pos` report without killing the process.

## Conventions

- C#: file-scoped namespaces, `...Async` suffixes, nullable enabled, DTOs in
  `Models/DTOs`, entities in `Models/Entities`, enums in `Models/Enums`, validation via
  DataAnnotations.
- Frontends: `@/` alias → `src`, API calls go through `src/api/client.ts` (never
  `fetch` directly), Zustand for customer state, React Query for admin.
- **Env vars use double underscores** for nesting: `Stripe__SecretKey`, `Cors__AllowedOrigins__0`.
  CORS must use the **indexed** form — a JSON array silently produces an empty list.
- **Secrets never go in committed files.** `dotnet user-secrets` locally, Fly/Vercel env
  vars in production; local copies in gitignored `.secrets.local`. Never paste a live
  credential into a chat. `VITE_*` values are public by design (they ship in the bundle).
- Customer app reads **`VITE_API_BASE_URL`** (admin app reads `VITE_API_URL`; the
  customer client accepts either but warns). The value must **include `/api`**, and it is
  baked in at build time — changing it in a dashboard does nothing until the next deploy.
- Restaurant timezone is `Australia/Adelaide`; prices are **GST-inclusive** (no GST added
  at checkout); pickup estimate comes from restaurant settings, not a literal.
- Comments explain *why*, often citing the outage that caused them — match that tone;
  don't add comments that restate the code.

## Known traps

- `Payment__UseMockGateway` **must** be false outside Development; `appsettings.json`
  defaults to the real gateway and `Program.cs` refuses to start a non-Development
  environment with the mock on. The mock approves every charge without contacting Stripe.
- Stripe uses `automatic_payment_methods`, **not** a `PaymentMethodTypes = ["card"]`
  allow-list — that list is what silently hides Apple/Google Pay.
- Anything enabled in the Stripe dashboard (Settings → Payment methods) appears at
  checkout with no code change and no review.
- Apple Pay needs a registered domain; test and live are separate registrations. It
  cannot be verified in Chrome/on localhost — a green headless UI run proves nothing.
- The `/api/dev/db/*` endpoints are Development-only and must 404 in production.
- Refunds, order-number search, menu editing in the UI, and automated DB backups are
  **not built** — see `docs/TODO.md` §9 before assuming they exist.
- **`scripts/swarm/` is an autonomous build loop** that can merge to `main` unattended
  (which releases to production). It is bounded and interlocked — it snapshots
  `.test-baseline` and refuses to merge if the floor dropped, treats
  `.github/workflows/**`, `scripts/check-*.sh`, `.githooks/**` and `.test-baseline` as
  never-auto-merge paths, and halts on danger chunks (migration order,
  `Payment__UseMockGateway`). Irreversible git actions are driver-only and need
  `--merge`; no model decides to land code. **Read `scripts/swarm/README.md` before
  running it with `--merge`**, and read the run's `report.md` afterwards — its "open
  defects" and "integration gaps" sections are where it admits what it did not do.

## Notes

<!-- Quick-adds: gotchas, owner decisions, links. Keep this file terse — it loads every session. -->
