# Asian Taste — Major Update Plan

> **Created**: 2026-09-10
> **Focus**: (1) Get the app running smoothly, (2) localise for Adelaide, South Australia, (3) compete with third-party delivery platforms.
> **Status**: Proposed — awaiting approval before implementation.

---

## 0. Executive summary

Two tracks, done in order:

- **Track 1 — Stabilise & localise (Phases A–B).** The app *runs* (API + Postgres + both frontends build green, menu and orders work end-to-end), but it is configured as a **US restaurant**: timezone `America/New_York`, 8% tax, `$`, US placeholder address and phone. Payments are wired to Stripe but the config surface is fragile (hardcoded ports, no `.env` for the admin app). This track makes it a **reliable Adelaide restaurant**.
- **Track 2 — Compete in Adelaide (Phases C–D).** Adelaide's third-party market has consolidated to a **duopoly (Uber Eats ~63% share, DoorDash ~12%)** after Menulog's Nov 2025 exit and Deliveroo's 2022 exit. Commission is **~30%** for full delivery. A direct ordering channel is the single highest-leverage move: it removes that commission and matches what Adelaide customers say they want (**58% prefer ordering direct**).

---

## 1. Market research — Adelaide, South Australia

### 1.1 Market size
| Fact | Figure | Source |
|---|---|---|
| Greater Adelaide population | **1,469,163** (30 Jun 2024, +1.5%) | plan.sa.gov.au; ABS Regional Population 2023–24 |
| Population density | **450.9 / km²** | plan.sa.gov.au |
| South Australia population | **~1.88M** | ABS 3218.0 |
| City of Adelaide LGA | **29,246 (2024) → 30,173 (Jun 2025)** | economy.id.com.au |
| SA restaurant/café openings | **SA led the nation**: 141 net new venues = **28% of national openings** in one 2024 quarter; **+5.1%** over FY2024 | premier.sa.gov.au; business.sa.gov.au (ABS business entries/exits) |
| Australia takeaway food services | **26.3k** businesses, **A$24.5bn** revenue (FY2024) | Statista "Food delivery in Australia" |

### 1.2 The competitive landscape (who we are competing with)
- **Effectively a duopoly.** National share (IBISWorld 2024, via ABC News 13 Nov 2025): **Uber Eats 53.8%**, Menulog 23.8%, **DoorDash 14.6%**.
- **Menulog is gone** — stopped taking orders **26 Nov 2025**; customers redirected to Uber Eats; restaurant partners offered **0% delivery fee for 180 days**.
- **Deliveroo left Australia in Nov 2022** — not an Adelaide option.
- **Adelaide app penetration** (Fonto 2024 / Statista): Uber Eats **>28% of population**, **>63% share**; DoorDash 12%; Menulog <10%. **~Half of app users order 2–4×/month.**
- **Asian-diaspora platforms** present: **HungryPanda**, **Easi** (named by TWU as remaining players).
- **Own-channel competitors**: HungryHungry, me&u, Bopple, Flipdish, Ordermate.

### 1.3 Commission — the money at stake
| Platform | Commission (full delivery) | Notes |
|---|---|---|
| Uber Eats | **~30%** (up to 33% cited) | Tiers: ~30% Uber delivers / ~16% self-deliver / **~6% pickup-only** |
| DoorDash | **~30%** | Negotiated per venue |
| Menulog | historical 14–30% | Exiting |

> ⚠️ These are **press-reported ranges, not official rate cards** — actual rates are negotiated per venue. The **6% pickup tier** is the key leverage insight: even staying on Uber Eats, offering pickup-only lowers commission ~5×.

**Unit economics** (directionally credible; treat vendor examples as marketing):
- Direct processing ≈ **3%** vs marketplace up to **30%** → a **$45 order keeps ~$11.25 more** direct (BeyondMenu worked example).
- Shifting 300 orders/mo off a 28% platform ≈ **~$40,500/yr** saved.
- **AU restaurant net margins are 5–7%** → a 30% commission can turn a profitable order into a loss.

### 1.4 Why customers will use our own site
- **58% prefer ordering delivery via the restaurant's own app/website** (NCR Voyix survey, Nov 2024): convenience 65%, easier customisation 50%, loyalty points 36%.
- **First-party guests order 35% more items per check**; mobile-app users have **45% higher CLV**; loyalty members visit **>40% more often** (Paytronix 2024 Online Ordering Report).
- **Guest checkout is table stakes** — forcing account creation is a top cart-abandonment cause (Flipdish 2025).

### 1.5 South Australia — compliance
| Rule | Detail | Source |
|---|---|---|
| **Single-use plastics** | Banned progressively: 2021 straws/cutlery → 2022 EPS cups/bowls → 2023 plastic bowls/plates → **1 Sep 2024 single-use takeaway containers, hot/cold cups+lids, EPS containers, barrier bags** → 1 Sep 2025 soy-sauce fish & attached cutlery → 1 Mar 2026 compostable markings → 1 Sep 2027 meat/dairy barrier bags. Penalties to **$20,000**. | replacethewaste.sa.gov.au |
| **Card surcharges** | Federal: capped at *cost of acceptance*; excessive surcharging is an **ACCC 2025–26 enforcement priority**. Network-enforced **debit/credit surcharge ban from 1 Oct 2026** (some sources say Jan 2026 — verify). | ACCC; RBA Standard No.3 (2016) |
| **Delivery workers** | Federal "Closing Loopholes" (2024) → FWC can set minimum standards for "employee-like" workers. | AAP |

**Action for us:** menu prices must be **GST-inclusive** (Australian convention), and the tax line should not add 8% on top.

### 1.6 Payment gateways (AU, 2024–25)
| Provider | Domestic online | Monthly | Notes |
|---|---|---|---|
| **Stripe** | **1.7% + A$0.30** | none | Already integrated. Intl 3.5%+30¢; Apple/Google Pay ✅ |
| Square | 1.9% + A$0.10 online; 1.6% in-person | none | Free reader |
| Tyro | ~1.4% entry, negotiable <1% at scale | $29 terminal rental | Same-day settlement, 450+ POS integrations |
| Adyen | interchange++ (~0.60% + A$0.11) | **minimum monthly invoice** | Needs ~AUD 2m+ volume — overkill |

**Verdict:** keep **Stripe** (already built, competitive rate, best DX). Revisit Tyro only if card volume grows.

> ⚠️ **Verify before relying on:** exact surcharge-ban date, gateway rates on primary vendor pages, and DoorDash/Uber Eats rate cards. Several gateway "2026" figures come from SEO/aggregator pages.

### 1.7 Research gaps (not resolved)
1. Brooklyn Park / Henley Beach Rd (City of West Torrens) local density.
2. FSANZ obligations for selling food online.
3. SA gig-economy/delivery-worker specifics.
4. **Adelaide Vietnamese restaurants' online-ordering presence** — needed for direct competitor benchmarking.
5. AU/Adelaide **average online order value** and frequency.
6. AU pricing for Flipdish, me&u, Bopple, HungryHungry, Ordermate, Deliverect, Lightspeed K-Series API.

---

## 2. Codebase audit — current true state

### 2.1 What works ✅
- **API builds** (`dotnet build AsianTaste.sln` ✅), **14 tests pass**.
- **Both frontends build green** (fixed in commit `9e51994`).
- **Postgres running** on :5432; **DB initialised** (`/api/dev/db/status` → `{"initialized":true}`).
- **Menu serves real data** (categories + items from seed).
- **Admin login works** (`POST /api/Auth/login`, seeded `admin` / `Admin123!`).
- **Admin endpoints work** with JWT: `/api/admin/orders`, `/api/admin/orders/summary`, `/api/admin/menu/categories`, `/api/admin/menu/items` → all HTTP 200.
- Frontend API paths **match** backend routes.

### 2.2 What's broken or fragile ❌
| # | Issue | Evidence | Impact |
|---|---|---|---|
| **B1** | **US restaurant settings** — timezone `America/New_York`, tax `0.08`, `$`, address "123 Main Street, City, State 12345", phone "(555) 123-4567" | `08_create_restaurant_settings.sql` seed | Wrong hours, wrong tax, wrong currency formatting for Adelaide |
| **B2** | **Hardcoded WebSocket host** `ws://localhost:5070/ws/orders` | `useOrderWebSocket.ts:40` | Real-time orders break in any non-local deployment |
| **B3** | **No `.env` for the admin app**; client falls back to `/api` and relies on the Vite proxy only | `src/asian-taste-admin/` has no `.env*` | Admin can't be pointed at a real API without code edits |
| **B4** | **API port inconsistency** — proxy targets `:5070`, frontend docs/settings reference `:5000` | `vite.config.ts` vs `README` vs `launchSettings.json` | Confusing setup; "it works on my machine" failures |
| **B5** | **No production env config** — CORS hardcodes only `localhost:5173/5174/5175` | `Program.cs` CORS block | Deployed site cannot call the API |
| **B6** | **JWT secret has a hardcoded fallback** default in `Program.cs` | `Program.cs` | Unsafe default; silent misconfig in prod |
| **B7** | **Email confirmation not implemented** (SendGrid scaffolded, `Enabled:false`) | `CurrentProgress.md`; `SendGridEmailService` | No order confirmation — expected by customers |
| **B8** | **Stripe webhook secret empty** | `appsettings.Development.json` | Payment confirmations rely on client, not webhook — fragile |
| **B9** | **No CI** — nothing runs build/tests on push | no `.github/workflows` | Regressions land silently (as the 34 TS errors did) |
| **B10** | **Solution-level dev friction** — `.slnx` was empty until recently; `dotnet build` needed the test project | commit `06cb839` | Onboarding friction |

### 2.3 Documentation issues
- `README` is a two-line scratch note (`lsof -ti:5000 | xargs kill -9`) — no setup instructions.
- `CurrentProgress.md` (1,069 lines) is out of date vs reality (e.g. says order confirmation ❌ though it exists).
- No runbook: how to start Postgres, API, both frontends.

---

## 3. The plan

### Phase A — Get it running smoothly (local, reproducible)
**Goal:** any dev (or you) can go from `git clone` to a working app in <10 min, repeatably.

| ID | Task | Detail |
|---|---|---|
| A1 | **Add `.env` to both frontends** | `VITE_API_URL` (admin) / `VITE_API_BASE_URL` (customer); commit `.env.example`, ignore real `.env` |
| A2 | **Unify the API port** | Standardise on **5070** everywhere: `launchSettings.json`, both `vite.config.ts` proxies, README, WS URL. Make the WS host read from config, not hardcoded |
| A3 | **Fix B2** | `useOrderWebSocket.ts` → derive `ws://`/`wss://` from an env var / `window.location` |
| A4 | **Write a real `README`** | Prereqs (Docker/Postgres, .NET 10, Node), setup steps, run commands, seeded credentials, dev endpoints |
| A5 | **Add a run script / Makefile** | `make db`, `make api`, `make admin`, `make customer`, `make test` |
| A6 | **Add `.github/workflows/ci.yml`** | On push/PR: `dotnet build` + `dotnet test`, `npm ci && npm run build && npm run lint` for both apps |
| A7 | **Reconcile `CurrentProgress.md`** | Correct the status table to match reality |

**Phase A — done so far:**
- ✅ `.gitignore` — ignore `.reasonix/` tooling dir
- ✅ `src/asian-taste-admin/.env.example` — `VITE_API_URL` / `VITE_WS_URL`; both frontends now read their env vars (were proxy-only / hardcoded)
- ✅ `useOrderWebSocket.ts` — derives `ws://`/`wss://` from `VITE_WS_URL` or the page origin (was hardcoded `ws://localhost:5070`)
- ✅ `README.md` — full setup/run/test docs; removed the 2-line stub `README`
- ✅ `.github/workflows/ci.yml` — API build + test; both frontends `npm ci` + build (lint non-blocking)
- ✅ Verified: Release build ✅, 14 tests pass ✅, both frontends build ✅, runtime smoke test (menu/orders/admin login) ✅

**Outstanding in Phase A:**
| ID | Task | Detail |
|---|---|---|
| A5 | **Add a run script / Makefile** | `make api`, `make admin`, `make customer`, `make test` |
| A7 | **Reconcile `CurrentProgress.md`** | Correct the status table to match reality |
| A8 | **Clear pre-existing lint debt** | Admin: 6 errors; customer: 11 problems (5 errors, 6 warnings) — unused vars, `no-explicit-any`, `react-refresh`. **CI lint is `continue-on-error` until this is done** (otherwise every build is red) |
| A9 | **Fix the API port inconsistency in docs** | Confirm `5000` references are gone (README fixed; check code comments) |

**Exit criteria:** fresh clone → documented commands → API + both apps running; CI green on a PR.

### Phase B — Localise for Adelaide (correctness)
**Goal:** the app behaves like an Adelaide restaurant, not a US one.

| ID | Task | Detail |
|---|---|---|
| B1 | **Fix restaurant settings seed** | `Australia/Adelaide` timezone, **GST-inclusive** pricing (10% GST, *not* added on top), `$` AUD; real address **329 Henley Beach Rd, Brooklyn Park SA 5032**; real phone/email. Add a `09_fix_adelaide_settings.sql` migration (don't edit 08 — it may have run) |
| B2 | **Tax handling** | Confirm menu prices are GST-inclusive (AU norm). If a tax line is shown, label "GST (included)" — never add 8% |
| B3 | **Hours & pickup time** | Seed the real trading hours (Sun 10:00–20:50; Mon–Tue 10:00–14:30; Wed–Sat 10:00–20:50) and a realistic pickup estimate |
| B4 | **Currency formatting** | Verify all money renders as **A$** with correct decimal handling |
| B5 | **Delivery zone & fees** | Decide pickup-only vs local delivery radius around Brooklyn Park; add a delivery-fee/distance rule if delivering |
| B6 | **Compliance check** | Pickup packaging consistent with SA single-use-plastics bans; surcharge (if any) capped at cost of acceptance |
| B7 | **Timezone correctness** | Verify order cutoffs, "open now" logic, and daily-stats boundaries use Australia/Adelaide |

**Exit criteria:** a test order shows AUD, GST-inclusive, correct Adelaide hours, correct pickup ETA.

### Phase C — Compete in Adelaide (product)
**Goal:** make the direct channel attractive enough to displace ~30%-commission orders.

| ID | Task | Why (evidence) |
|---|---|---|
| C1 | **Email order confirmation** | Expected by customers; SendGrid already scaffolded (B7). Wire `SendGrid:Enabled` + templates |
| C2 | **Stripe webhook** | Reliable payment state (B8). Set `Stripe:WebhookSecret`, verify signature (handler exists) |
| C3 | **Pickup-first flow polish** | Uber Eats' **~6% pickup tier** exists *because* pickup is cheap — make ours frictionless (clear ETA, "ready" status) |
| C4 | **Loyalty / repeat-order nudge** | First-party loyalty members visit **>40% more**; **58% cite loyalty** as a reason to order direct |
| C5 | **One-tap reorder** | Direct guests order **35% more items**; reorder drives frequency |
| C6 | **Menu SEO + Google presence** | Adelaide customers searching "Vietnamese near me" should find us, not just Uber Eats |
| C7 | **Lightspeed integration (defer?)** | Order routing to the K-Series POS they already run. High effort — see D2 |
| C8 | **Launch offer to migrate customers** | Counter Menulog's "0% for 180 days" tactic with our own direct-order incentive |

**Exit criteria:** a customer can order, receive confirmation email, pay, get "ready" notification, and reorder in one tap.

### Phase D — Deploy & operate
| ID | Task | Detail |
|---|---|---|
| D1 | **Hosting decision** | PRD says Azure App Service + Flexible Postgres; confirm or switch (verify cost) |
| D2 | **Lightspeed/POS decision** | Decide build-vs-buy: Lightspeed K-Series API vs Deliverect vs no integration for v1 |
| D3 | **Production config** | CORS for real domain (B5), real JWT secret via env, Stripe live keys via secret store |
| D4 | **Domain + SSL** | Custom domain, HTTPS |
| D5 | **Monitoring + backups** | App Insights/health checks; DB backup strategy + tested restore |
| D6 | **Go-live checklist** | Smoke-test menu, order, payment, email, admin on production |

---

## 4. Recommended sequencing

```
A (get running)  →  B (Adelaide correctness)  →  C1/C2 (email + payment)  →  B5/C3 pickup polish  →  D (deploy)
                                                  ↘ C4/C5 loyalty/reorder (post-launch)
                                                  ↘ C7 Lightspeed (decide separately)
```

**Rationale:** D2 doesn't matter until A/B are solid. C1/C2 are the minimum for a trustworthy paid order. Loyalty/SEO compound *after* launch.

---

## 5. Decisions (confirmed 2026-09-10)

| # | Decision | Consequence |
|---|---|---|
| 1 | **Pickup-first.** Cannot compete with Uber on delivery for now. | Delivery is **out of scope** for v1. Optimise the pickup flow; keep the Uber Eats channel as-is. Delivery becomes a later phase. |
| 2 | **Simpler hosting** (not the PRD's Azure App Service + Flexible Postgres). | Target a single small VPS or a simple managed platform (e.g. Docker Compose on one box, or a PaaS with managed Postgres). Revisit in Phase D. |
| 3 | **Lightspeed POS integration: now.** | D/C7 moves into active scope. Order routing to the K-Series POS is required, not deferred. |
| 4 | **Testing TODOs required**, now and later for business integration planning. | Every phase must ship tests; add a standing testing + business-integration planning backlog (see §7). |
| 5 | Start with **Phase B** (Adelaide localisation). | Correctness before features. |

---

## 6. Testing & business-integration backlog (standing)

**Now (automated, CI-blocking):**
- [x] API unit tests (`tests/AsianTaste.API.Tests`) — 14 tests, run in CI
- [ ] Settings/hours repository tests (Adelaide config correctness)
- [ ] Menu + order unit tests against a test database
- [ ] Order creation happy-path + validation tests
- [ ] Frontend typecheck in CI (currently via `npm run build`)
- [ ] Clear pre-existing lint debt, then make CI lint blocking

**Later (business integration planning):**
- [ ] **Lightspeed K-Series POS integration test plan** — sandbox account, order push, mapping of menu items to Lightspeed products, failure/retry behaviour
- [ ] End-to-end order flow test (browser) — Playwright
- [ ] Stripe test-mode end-to-end: payment intent → webhook → order paid
- [ ] Load/soak test for the realtime WebSocket channel
- [ ] Pre-launch acceptance checklist (menu accuracy, pricing, hours, GST)

---

## 7. Sources
ABS Regional Population 2023–24; plan.sa.gov.au; economy.id.com.au; premier.sa.gov.au / business.sa.gov.au; IBISWorld 2024 via ABC News (13 Nov 2025); Fonto 2024; Statista (AU food delivery); NCR Voyix (Nov 2024); Paytronix 2024 Online Ordering Report; Flipdish 2025; ACCC card surcharges; RBA Standard No.3 (2016); replacethewaste.sa.gov.au; BeyondMenu (vendor example).

> **Confidence note:** market figures are from press/vendor/gov pages, not primary rate cards. Commission ranges and gateway rates should be confirmed with the providers before financial modelling.
