# Session notes — 2026-09-10

A running log of what changed, what's proven, and what's still open. Written to be
read cold by whoever picks this up next (including future me).

---

## Where the project stands

**All error-free and verified**, on `main`:

| Check | Result |
|---|---|
| API build warnings | **0** |
| Admin lint | **0 errors, 0 warnings** |
| Customer lint | **0 errors, 0 warnings** |
| Typechecks | both clean |
| Tests | **82 passing** (71 API + 5 admin + 6 customer) |
| Guardrails | **3/3 exit 0** |

Start the app locally:

```bash
cd src/AsianTaste.API       && ASPNETCORE_ENVIRONMENT=Development dotnet run   # :5070
cd src/asian-taste-admin    && npm run dev                                     # :5174
cd src/asian-taste-customer && npm run dev                                     # :5173
```

- Admin dashboard: http://localhost:5174 — `admin` / `Admin123!`
- API docs: http://localhost:5070/swagger
- DB health: http://localhost:5070/api/dev/db/status

> These are **dev servers** — they stop when the session/machine does. Making them
> permanently available is the Phase D deployment work.

---

## What was done this session (newest first)

| Commit | What |
|---|---|
| _(uncommitted)_ | **Every dish appeared twice on the menu.** The seed re-ran on every start with an unguarded `menu_items` INSERT, so each restart appended all 82 dishes again: 164 cards for 82 dishes, and a dish opened from the menu was a different row than the same dish in a search result. Fixed at the root (guarded seed + natural key), with migration 11 repairing databases already polluted. Details under "Bugs found this session". |
| `8a08cec` | Last lint warning cleared — `useWatch` replaced `watch()` (React Compiler can't memoize it) |
| `a9cc59f` | **0 build warnings + 0 lint errors.** Npgsql data-source migration, PBKDF2 modernised, nullable fixes, frontend test runners added, lint made blocking |
| `b74a972` | Fixed a silent layout bug (`aspectvideo` typo making dish cards 648px tall) and documented the UI judge's false positives |
| `7daf108` | Fixed the UI defects the loop found; wired the loop into CI |
| `7bcb745` | UI quality loop ported from `voice-debrief`; found an app-wide API-prefix bug |
| `d0f3197` | Test-authoring agent + 3 guardrails that fail loudly |
| `04a4011` | Order confirmation email made reliable; Stripe webhook works |
| `cb88416` | Adelaide localisation (timezone/GST/address); settings API de-hardcoded |
| `67604c0` | Real README, CI workflow, hardcoded WebSocket URL fixed |

## Deployment readiness — verified in Docker

The API now runs in a container. Verified end to end against a throwaway Postgres,
not just built:

| Check | Result |
|---|---|
| `docker build` | succeeds, 384 MB image |
| Binds the injected port (`ASPNETCORE_URLS=http://+:8080`) | `Now listening on: http://[::]:8080` |
| Runs every migration + seeds on a **from-scratch** database | 14 categories, 82 items, 0 duplicates, ids 1..82 |
| Order placed through the container | `AT-121525-DBF8`, $17.00, line item persisted and linked to the right dish |
| Order history survives a restart | `orders=1 order_items=1 menu_items=82` |
| The duplicate-dish bug stays fixed through a restart | `duplicate_groups=0` |
| `ASPNETCORE_ENVIRONMENT=production` | `/api/dev/db/{status,reset,seed}` all **404** |
| CORS from env (`Cors__AllowedOrigins__0`) | correct `Access-Control-Allow-Origin` |
| Secrets in the image | none (`sk_*`, `LLM_VISION_API_KEY`, DB creds all absent) |

### Two findings from building the image

1. **`Microsoft.OpenApi` 2.0.0 — High, CVE-2026-49451** (GHSA-v5pm-xwqc-g5wc), pulled in
   transitively by `Microsoft.AspNetCore.OpenApi` 10.0.2. A stack-overflow DoS when
   *parsing* an OpenAPI document with circular schema references. **Not reachable in this
   service** — it only generates Swagger, never parses a caller-supplied document — but
   every `Microsoft.AspNetCore.OpenApi` 10.0.x still drags in 2.0.0, so it is pinned to
   **2.7.5** (the first patched release). `dotnet list package --vulnerable` now reports
   no vulnerable packages, and the pin carries its exit condition in the csproj.
2. **`Cors__AllowedOrigins` as a JSON array silently does not bind.** ASP.NET Core maps
   *indexed* environment variables (`Cors__AllowedOrigins__0`) onto `string[]`; a JSON
   string yields an empty list. The API then starts normally and every browser request is
   blocked by CORS with nothing in the log. Found by running the real published build with
   each form. The indexed form is now documented, and the API logs a warning in production
   when the list is empty.

### Deployment files added

`src/AsianTaste.API/Dockerfile` · `.dockerignore` · `fly.toml` · `.github/workflows/deploy.yml` ·
`src/asian-taste-{customer,admin}/vercel.json` · `src/AsianTaste.API/appsettings.Production.example` ·
`src/asian-taste-customer/.env.production.example` · `docs/DEPLOYMENT.md`

---

### Bugs found this session — all real, all fixed

1. **Every dish was listed twice (164 cards for 82 dishes).** Fixed this session. The full
   story, because the *root cause* was not where the symptom appeared:

   - `02_seed_data.sql` runs on **every** application start. Its `categories` INSERT was
     guarded with `ON CONFLICT (id) DO NOTHING`; the `menu_items` INSERT was not — and it
     supplies no `id`, so there was nothing to conflict on anyway. Each restart appended all
     82 dishes under fresh ids. By the time anyone looked, the dev database held ids 1–82
     and their exact duplicates 83–164.
   - **The symptom hid the cause.** The menu still worked, every dish was reachable, and all
     82 looked present — they were just each there twice. A `SELECT count(*)` on a
     `category_id` filter looked plausible, because it counted 16 items where the printed
     menu has 8.
   - **The fix, in the order it has to run** (`DatabaseInitializationService.InitializeAsync`):
     `schema → 11 de-duplicate → create the seed's conflict index → 02 seed → 04-10 →
     12 remaining natural keys → 03 admin user`.
     That order is forced from both ends and contradicts itself naively: the seed conflicts on
     `(name, category_id)`, and `ON CONFLICT` is rejected outright until an index can
     arbitrate it (SQLSTATE `42P10`) — but that index cannot be built while duplicates are
     still present (SQLSTATE `23505`). So migration 12 is *staged*: its `menu_items` index is
     created in the narrow window after de-duplication and before the seed, and the rest runs
     afterwards. Seeding last or building the index first both leave the API unable to start.
   - **Migration 11** repairs a polluted database: it repoints `order_items`,
     `modifier_groups` and `lightspeed_product_id` at the surviving `MIN(id)` row (two real
     order lines referenced duplicates and blocked the delete with `23503`), then deletes
     the duplicates and repairs the sequence.
   - **Migration 12** owns the natural-key unique indexes, created **after** the rebuild.
     They cannot live in `01_create_schema.sql`: that script runs before the seed, and
     `CREATE UNIQUE INDEX` on duplicates aborts the entire script, so the API would not
     start at all.
   - **The seed is purely additive.** `ON CONFLICT` only prevents *new* duplicates; it
     cannot repair existing ones, because they already exist and conflict means "skip".
     Repairing them is migration 11's job — and it must be migration 11, not a rebuild: see
     the first bug below for the cost of the `TRUNCATE` approach.
   - **`ExecuteScriptAsync` runs one explicit transaction** and logs the failing statement.
     Before, Npgsql ran a batch as one implicit transaction, so a late failure rolled back
     the earlier statements *and* reported the first statement's error — it sent me
     debugging a `CREATE INDEX` that was fine.
   - **Four further bugs were introduced while writing this fix, all caught before shipping.**
     They are recorded because each one is a trap worth recognising:

     1. **`TRUNCATE ... CASCADE` wiped the order history on every restart.** The first version
        of the rebuild cleared the menu tables so a polluted database would be rebuilt.
        `TRUNCATE menu_items CASCADE` *also* truncates `order_items` — it references
        `menu_items`, and CASCADE ignores the FK's delete action. `InitializeAsync` runs on
        every boot, so it silently took `order_items` from 34 to 0. The rebuild was never
        needed: the guarded seed prevents new duplicates, and migration 11 repairs existing
        ones. Removed; the seed is now purely additive and deletes nothing.
     2. **Migration 11's repoint corrupted orders.** `UPDATE order_items ... FROM (...) d JOIN
        menu_items dup ON ...` had no predicate tying the join to `oi`. Postgres allows
        `UPDATE ... FROM` to combine the target with everything in `FROM` without constraining
        how, so every line item matched every duplicate — it repointed an order for "Cold
        rolls" (id 1) to "Snack Super Deal" (id 84), a dish the customer never ordered.
        `WHERE oi.menu_item_id = dup.id` is the fix, and it is load-bearing, not decorative.
     3. **The Lightspeed mapping carry-over ran backwards.** `UPDATE menu_items dup SET ... =
        COALESCE(dup.lightspeed_product_id, src.lightspeed_product_id)` with `d.keep_id = src.id`
        wrote the *survivor's* value onto the row it was about to delete, so a
        `lightspeed_product_id` held only on a duplicate was still lost — the exact outcome that
        step exists to prevent. Verified fixed by placing 7777 on a duplicate only: it now ends up
        on the survivor.
     4. **The repoint and delete touched different row sets.** The repoints compared twins against
        `MIN(id)`, but the delete asked "is there *any* lower twin" (`keep.id < dup.id`). In a mixed
        group — `{1: old price, 84: new, 165: new}` — the delete removed 165 while no repoint
        covered it, so `order_items` would reference a deleted row and the migration would abort
        with 23503. Pinning the delete's comparison to `MIN(id)` makes the two sets equal; a
        scratch-table check confirms they are identical for both the mixed group and the real
        all-twins pollution shape.
     5. **A SQL scoping error I introduced while fixing 3.** Referring to the UPDATE target's alias
        inside the `FROM` clause's own joins is invalid ("invalid reference to FROM-clause entry for
        table"), which aborted migration 11. The survivor is now joined explicitly as another table
        alias. Caught by running each migration standalone under `psql -v ON_ERROR_STOP=1`, which is
        worth doing every time — the API's batch runner reports a batch-wide error and this one
        would have been easy to mis-attribute.

   - **The delete is narrowly scoped on purpose.** A row is only collapsed if it is an exact
     twin of the survivor (price, description and every dietary flag match). Two genuinely
     different dishes sharing a name in one category are not duplicates, and merging them
     would destroy a dish and rewrite its orders with no undo. If such a pair exists, the
     unique index fails loudly at startup naming the exact statement — verified by planting
     a $14.00 "Pho - Beef noodle soup (1 choice)" alongside the real $15.50 one: the dish
     survived and the API reported `could not create unique index "ux_menu_items_name_category"`.
   - **The admin user is only seeded when no admin exists.** 03_create_admin_user.sql
     creates the documented `admin / Admin123!` account. Running it on every start would
     mean deleting that known account did not stick — the next restart recreated it. The
     guard asks the table (`COUNT(*) FROM admin_users = 0`) rather than a first-run flag:
     a flag is read before the schema exists, so a boot that died after step 1 would leave
     every later start believing the database was initialised, and the admin forever
     uncreated. Verified that deleting the admin now survives a restart.
   - **A fresh install seeds ids 1..82.** `setval(seq, n)` makes the next `nextval()`
     return `n + 1`, so migration 11's original `setval('menu_items_id_seq', COALESCE(MAX(id),
     1))` ran against an *empty* table on a fresh database and started the menu at id 2 —
     every id shifted by one, so a bookmarked `/menu/item/1` was a different dish than on a
     known-good install. Fixed with the three-argument form,
     `setval(seq, COALESCE(MAX(id), 0) + 1, false)`.
   - Verified: a DB polluted with **four copies** of every dish (328 items, 246 order lines all
     pointing at duplicate rows) converges to 82 items / 0 duplicates with **0 name mismatches
     and 0 dangling references**; order history survives restarts; fresh DB and plain restarts
     are stable. The customer menu renders 82 distinct cards (was 164/82), all 82 dish detail
     pages open, and there are no console errors. 14 new tests in
     `tests/AsianTaste.API.Tests/Data/MenuSeedIdempotencyTests.cs` pin the seed's
     re-runnability, the migration ordering, and that nothing on the startup path truncates.

2. **A security bug**, found by writing the password tests: `VerifyPassword` derived the hash at `expected.Length`, so a **truncated stored hash verified successfully** against its own prefix.
3. **Online orders never reached the POS** — `OrderService.cs:118` is still `// TODO: Send to Lightspeed K-Series`. See "Next" below.
4. **Every data-loading screen silently 404'd** — `VITE_API_BASE_URL` was a bare origin, dropping the `/api` segment. Found by the UI screenshot loop, not by any test.
5. **Every heading rendered in the wrong font** — `--font-family-serif` is not a Tailwind v4 token name, and the base layer forced `h1–h6` to sans.
6. **Dish cards were 648px tall** — `aspectvideo`, a typo for `aspect-video`, used in 3 places and defined nowhere.
7. **Order status updates were broken** — text assigned to a PostgreSQL enum column (`42804`).
8. **Fake coverage** — a tracked Playwright suite with no runner installed and 0/6 selectors present.

---

## It is deployed

| Piece | Where | Status |
|---|---|---|
| API | https://asian-taste-api.fly.dev (Fly, `syd`) | live, 82 items, connected to Neon |
| Database | Neon `ap-southeast-2` (Sydney), pooled | live |
| Customer app | https://asian-taste-customer.vercel.app | live, reaches the API |
| Admin app | not deployed | by decision — see `docs/DEPLOYMENT.md` |

**Proven end to end:** `git push` → CI (5 jobs green) → deploy gate → Fly deploy →
smoke test against production → PASS. The Deploy workflow is **fully green**:
CI gate, API deploy and frontend verification all pass.

**No, wait — one caveat on Fly.** The app is correct and the port is fine, but the
Fly account is on the free **trial**, which stops machines after 5 minutes:

```
warn: Trial machine stopping. To run for longer than 5m0s, add a credit card
      by visiting https://fly.io/trial.
```

Fly Doctor reports this as "App is not listening to the expected port" and blames
the code — a **false positive**. `fly logs` shows `Now listening on:
http://[::]:8080` and the health check passing while the machine is up. Adding a
credit card to the Fly account is required; no code change will fix it. Until
then the app auto-starts on request, so it works but with a cold start each time.

Read [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for how all the pieces fit
together. A real order was placed through the live API
(`AT-130006-0008`, $17.00) and retrieved back from Neon. The live site renders
82 cards, 82 distinct, 0 duplicates, and a dish modal opens with a working
Add-to-Cart.

`./scripts/check-deployment-health.sh` is the single command that answers "is
production working?": liveness, readiness, menu content, **duplicate dishes**,
CORS, the dev endpoints being 404, and the customer site's routes. It runs in CI
after every API deploy, so CI and a human agree.

### What went wrong on the way, and why

1. **The API crash-looped on Fly.** `ConnectionStrings__DefaultConnection` was
   never set, so it fell back to `appsettings.json`'s `Host=localhost` — inside a
   container, itself. Startup then **aborted** on the failure, so Fly restarted
   it, it aborted again, and it looped to the restart limit. The real error was
   buried in restart spam.
   Two fixes, and the second is the important one: the connection string had to
   be converted from Neon's `postgresql://` URI form (which Npgsql rejects) into
   key=value form; and startup no longer dies on a database problem — it retries
   briefly, logs the cause, and starts anyway, with `/healthz` (liveness) and
   `/health/db` (readiness, naming the cause) as separate endpoints.

2. **The deploy gate never ran.** It used `gh run list --commit`, which works
   interactively but returned nothing on the runner, and the stderr was
   suppressed — so it hung for its full 10-minute timeout instead of failing. A
   gate that hangs is worse than one that fails, because it looks like a slow
   deploy. It now polls the Actions REST API and fails loudly, and the job needs
   an explicit `actions: read`.

3. **The replacement gate rejected valid responses.** Its error check grepped the
   response body for `"message"`, which also matches the commit message inside a
   perfectly good `workflow_run`. It now checks for the `workflow_runs` key.

4. **The Vercel job is red and cannot be fixed from here.** The token is
   team-scoped with no user identity, so the CLI rejects it
   (`vercel whoami` → "User not found"; `vercel pull` → "Could not retrieve
   Project Settings"). Reproduced locally, so it is token scope, not CI config.
   It needs a token minted from **personal** Account Settings. The frontend is
   not broken — Vercel's Git integration deploys it fine.

### The POS push had a worse bug than the modifier gap

Chasing "modifiers don't reach the POS" from the TODO found that the order being
pushed had **no line items at all**:

- `GetOrderByIdAsync` (and `GetOrderByNumberAsync`) never loaded `Items`. They run
  one query against `orders` and return. `OrderService` pushes what
  `CreateOrderAsync` returns, which calls `GetOrderByIdAsync` — so every POS order
  went out as `lines: []`. Proven before fixing: `Items.Count = 0` for an order
  with a row in `order_items`.
- `GetOrderItemsAsync` used `SELECT *` against snake_case columns while `OrderItem`
  is PascalCase, and Dapper's underscore mapping is not enabled on this connection.
  So `menu_item_name` and `unit_price` mapped to nothing — empty names, price 0. The
  **row count was correct**, which is precisely why it looked like it worked.
- The payload then dropped modifiers, so "no coriander" never reached the kitchen.

Fixed with explicit aliases (matching the rest of that file), `Items` loading in
both getters, and a line description like
`Pad Thai x1 (Extra chilli +$1.50, No coriander)` plus per-item notes on the line.

Verified rather than assumed: against a real order with three modifiers,
`Items.Count` went 0 → 1 and the line read `Cold rolls (serve of 4) x1 @ 10.00`
with all three modifiers and the unit price including the +$1.50 adjustment; the
live order detail returns its items; 8 unit tests pin the description contract
(mutation-checked: 5 of 8 fail if modifier rendering is removed). Reverting the
`Items` loading puts `Items.Count` back to 0.

---

### Still outstanding

- **Rotate the Neon password.** It was pasted into a chat, so treat it as
  compromised; re-running one `fly secrets set` from `docs/DEPLOYMENT.md` is the
  whole fix.
- **`VITE_STRIPE_PUBLISHABLE_KEY` is unset on Vercel**, so checkout fails with
  "Please call Stripe() with your publishable key". Browsing and the API are fine.
- The admin app is not deployed (deliberate), and `Payment__UseMockGateway` is
  still `true`, so **orders are accepted without real payment**. Both must change
  before real customers, along with the pre-launch checklist in
  `docs/DEPLOYMENT.md`.

---

## What's next (evidence, not memory)

### 1. Wire the Lightspeed order push — highest priority

Your recorded decision was **"Lightspeed POS integration: now"**, but it is **not wired**:

```
src/AsianTaste.API/Services/OrderService.cs:118    // TODO: Send to Lightspeed K-Series
src/AsianTaste.API/Services/OrderService.cs:119    // TODO: Process payment if Card
```

The service is fully built (`LightspeedOrderService`, `LightspeedAuthService`, a 440-line
`OrderSyncBackgroundService`) but **never called from order creation**. A customer can pay and
the kitchen would never see the order.

It also has no credentials:
```json
{"connected":false,"hasConfig":false}   // hasClientId: false, hasClientSecret: false
```

**Blocked on:** Lightspeed client ID + secret. The wiring, retry logic, and tests can be written
without them — only the live verification needs credentials.

### 2. Small housekeeping (Phase A leftovers)

- **A5** — no `Makefile` / run script.
- **A7** — `CurrentProgress.md` is stale (still says order confirmation is "Not Started"; it's built and tested).
- ~~A8 lint debt~~ — **done**
- ~~A9 port inconsistency~~ — **done**

### 3. Known limitations (documented, deliberate)

- **No dish photography.** The only images in the repo are photos of a *printed menu-board*; putting those in a dish image slot would mislead customers. Reverted, with a migration clearing the references. Needs licensed food photography.
- **Authenticated UI screens aren't captured** by `ui:shots` (they redirect without a session).
- **CI has never run on GitHub.** All verification so far is local reproduction.
- **Nothing is deployed yet.** Fly, Neon and Vercel are configured in the repo but no
  account-side setup has happened: no `fly launch`, no Neon project, no `FLY_API_TOKEN` /
  `VERCEL_TOKEN` secrets. `docs/DEPLOYMENT.md` lists the one-time steps in order.
- **CI UI gate is OFF.** The 3 remaining `[high]` UI findings are verified false positives against the DOM.

---

## How the safety net works

Three guardrails run on every push and PR, and they were each proven to **fail loudly**:

```bash
./scripts/check-test-wiring.sh    # every tracked test file can actually run
./scripts/check-test-health.sh    # tests really ran; none skipped; count >= .test-baseline
./scripts/check-ci-integrity.sh   # guardrails intact; change is reviewable
```

`.test-baseline` is the test-count floor (currently **71**) — a shrinking suite fails the build.

Two agents live in `.reasonix/skills/`:
- **`test-author`** — writes tests and must prove each can fail (mandatory mutation check).
- **`ci-test-guardian`** — reproduces the CI sequence locally.

See `docs/GUARDRAILS.md` and `docs/ui-qa-loop.md`.

---

## Things worth remembering

- **The UI judge is noisy (±2 points)** and produces verified false positives. `docs/ui-rubric.md`
  lists six specific ones with the DOM evidence that disproved them. Check the DOM before acting.
- **Prices are GST-inclusive** (Australian convention). A checkout that *adds* GST is a defect.
- **Secrets never go in committed files** — `dotnet user-secrets` locally, env vars in production.
- Local `.env.local` holds the vision API key used by `npm run ui:judge` (gitignored).
