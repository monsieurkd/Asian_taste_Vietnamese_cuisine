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
| Tests | **68 passing** (57 API + 5 admin + 6 customer) |
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
| `8a08cec` | Last lint warning cleared — `useWatch` replaced `watch()` (React Compiler can't memoize it) |
| `a9cc59f` | **0 build warnings + 0 lint errors.** Npgsql data-source migration, PBKDF2 modernised, nullable fixes, frontend test runners added, lint made blocking |
| `b74a972` | Fixed a silent layout bug (`aspectvideo` typo making dish cards 648px tall) and documented the UI judge's false positives |
| `7daf108` | Fixed the UI defects the loop found; wired the loop into CI |
| `7bcb745` | UI quality loop ported from `voice-debrief`; found an app-wide API-prefix bug |
| `d0f3197` | Test-authoring agent + 3 guardrails that fail loudly |
| `04a4011` | Order confirmation email made reliable; Stripe webhook works |
| `cb88416` | Adelaide localisation (timezone/GST/address); settings API de-hardcoded |
| `67604c0` | Real README, CI workflow, hardcoded WebSocket URL fixed |

### Bugs found this session — all real, all fixed

1. **A security bug**, found by writing the password tests: `VerifyPassword` derived the hash at `expected.Length`, so a **truncated stored hash verified successfully** against its own prefix.
2. **Online orders never reached the POS** — `OrderService.cs:118` is still `// TODO: Send to Lightspeed K-Series`. See "Next" below.
3. **Every data-loading screen silently 404'd** — `VITE_API_BASE_URL` was a bare origin, dropping the `/api` segment. Found by the UI screenshot loop, not by any test.
4. **Every heading rendered in the wrong font** — `--font-family-serif` is not a Tailwind v4 token name, and the base layer forced `h1–h6` to sans.
5. **Dish cards were 648px tall** — `aspectvideo`, a typo for `aspect-video`, used in 3 places and defined nowhere.
6. **Order status updates were broken** — text assigned to a PostgreSQL enum column (`42804`).
7. **Fake coverage** — a tracked Playwright suite with no runner installed and 0/6 selectors present.

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
- **CI UI gate is OFF.** The 3 remaining `[high]` UI findings are verified false positives against the DOM.

---

## How the safety net works

Three guardrails run on every push and PR, and they were each proven to **fail loudly**:

```bash
./scripts/check-test-wiring.sh    # every tracked test file can actually run
./scripts/check-test-health.sh    # tests really ran; none skipped; count >= .test-baseline
./scripts/check-ci-integrity.sh   # guardrails intact; change is reviewable
```

`.test-baseline` is the test-count floor (currently **57**) — a shrinking suite fails the build.

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
