# Your todo

Everything I could do without you is done. This is what's left, ordered so that
each item unblocks the next. Every item says what I need from you, or which
decision I've made for now and how to change it.

**Where things stand:** the API, database and customer site are live. Fly billing
is sorted, the Neon password is rotated, and Stripe keys are in place — but see
item 1, because the gateway was running in **test mode** and the mock gateway was
enabled in production until this session fixed it.

**What needs you:** deploy the admin dashboard (item 4 — about two minutes of
clicking), then talk to the owner about Lightspeed (item 5). Everything else is
future work, listed at the bottom.

---

## 1. ~~Fly billing~~ · ~~Neon rotation~~ · ~~Stripe keys~~ — done ✅

All three are confirmed working:

| | Status |
|---|---|
| Fly billing | ✅ machine `started`, no trial stops, health check passing |
| Neon password | ✅ `/health/db` returns `{"status":"healthy","menuItems":82}` |
| Stripe keys | ✅ `Stripe__SecretKey` and `Stripe__WebhookSecret` present on Fly |

While checking them I found something serious, now fixed — see item 3.

---

## 2. Switch Stripe from test to live — and it costs nothing to do

**Your setup right now:** `sk_test_...` on the API and `pk_test_...` on Vercel.
Both correct for testing. The live site loads with **zero console errors**, and
a card order goes through real Stripe in test mode.

### You are not "wasting money" by testing

Stripe charges **per transaction, not per key**. Test mode moves no money and
costs nothing — there is no fee for having test keys, and no fee for switching.
You pay 2.2% + 30¢ only when a *real* card is charged. So the switch itself is
free; the first real order costs the same either way.

| Step | Cost | Risk |
|---|---|---|
| Keep testing on `sk_test_` | $0 | None |
| Activate the Stripe account (business details) | $0 | None |
| Create live keys + a live webhook endpoint | $0 | None |
| **Swap the secrets** | **$0** | ⚠️ **real cards now get charged** |

The only real consideration is the last row: once live keys are in, order #1
takes real money. Do it deliberately.

### The sequence

1. **Activate the Stripe account** (Dashboard → activate). Needs business details
   and a bank account. No charge.
2. **Create live keys** (Developers → API keys, toggle to Live).
3. **Create a live webhook endpoint** at
   `https://asian-taste-api.fly.dev/api/webhook/stripe` with the four events.
   It has a **different signing secret** to the test one.
4. **Set the secrets** — all three must change together, or payments break:

   ```bash
   fly secrets set \
     Stripe__SecretKey="sk_live_..." \
     Stripe__WebhookSecret="whsec_..."        # the LIVE endpoint's secret
   ```

   On Vercel, update `VITE_STRIPE_PUBLISHABLE_KEY` to `pk_live_...` and
   **redeploy** — Vite inlines it at build time, so changing the value alone
   does nothing.

5. **Confirm the mode switched.** The app now says which mode it is in at startup:

   ```bash
   fly logs -a asian-taste-api | grep STRIPE
   ```

   `STRIPE PAYMENT GATEWAY ENABLED (live keys)` is what you want. If it still
   says `IN TEST MODE`, the secret did not take.

### Proving it works, cheaply

Place one real order yourself with your own card, confirm it appears in the admin
dashboard, then refund it from the Stripe dashboard. That is one Stripe fee
(about 50¢ on an $8.50 order) rather than a guess.

**Why I would not do it yet:** everything except the live charge is already
verified. There is nothing to gain from switching before you are ready to take a
real order — test mode exercises the same code path.

---

## 3. ✅ Fixed: production was accepting card orders unpaid

**What was wrong.** While verifying your Stripe setup I placed a card order in
production with a token real Stripe would reject. It came back `"Paid online"`.

The cause: `appsettings.json` shipped `"UseMockGateway": true`. That file applies
to **every** environment including production, and Fly set no override — so the
live API was running the mock gateway, which approves every charge without
contacting Stripe. The logs confirm it:

```
Mock Payment Gateway initialized - NO REAL PAYMENTS WILL BE PROCESSED
Mock payment authorization: Order=6, Amount=850
```

Every card order placed would have been a free meal, and nothing errored.

**Why it happened** is worth keeping: the default was the unsafe value. A
deployment was only safe if someone *remembered* to override it.

**What I changed:**

- `appsettings.json` now defaults to the real gateway, so the mock must be
  opted into rather than inherited.
- `Program.cs` **refuses to start** a non-Development environment with the mock
  enabled, so a mistake in a secret can't produce a free-food deployment.
- Startup now prints the Stripe mode (live / test / missing key), so the next
  surprise of this kind is visible in the logs rather than in a customer's order.
- 4 tests read the committed config and assert the safe default, plus that
  `Program.cs` keeps the refusal. Mutation-checked: setting the default back to
  `true` fails the test with the explanation above.

**One thing you should decide:** order 6 (`AT-131236-C66C`) was marked paid by the
mock. It's test data, but if you want it cleared:

```bash
curl -X DELETE https://asian-taste-api.fly.dev/api/orders/AT-131236-C66C   # no such endpoint yet
```

There isn't a delete endpoint, so it has to be done in the database. Tell me if
you want me to remove the test orders.

---

## 4. Deploy the admin dashboard (needs you: ~2 minutes in Vercel)

**Status: not deployed anywhere.** I checked — only one Vercel project exists
(`asian-taste-customer`). So there is currently no admin dashboard to access, and
your tablet decision depends on it.

**Why I cannot do this one.** Your Vercel token is read-only and team-scoped:

| Endpoint | Result |
|---|---|
| read projects | ✅ 200 |
| `POST /v11/projects` (create) | ❌ 403 forbidden |
| `/v2/user` | ❌ 404 — the token has no user identity |

So I can inspect your setup but not create anything. This is the same token-scope
limitation that made the old CLI deploy job fail.

### What to click

1. **vercel.com/new** → import `Asian_taste_Vietnamese_cuisine` (same repo, second project)
2. **Root Directory** → `src/asian-taste-admin` ← the step that matters
3. Framework auto-detects **Vite**
4. Add environment variables:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://asian-taste-api.fly.dev/api` |
   | `VITE_WS_URL` | `wss://asian-taste-api.fly.dev` |

   **`VITE_API_URL`, not `VITE_API_BASE_URL`** — the admin app uses a different
   variable name to the customer app. The wrong name falls back to `/api` and
   every request 404s. I added a guard that warns about a missing `/api`, but the
   name itself has to be right.

   **`VITE_WS_URL` is needed** for live order updates. Without it the app derives
   `wss://` from its own page origin, which points at Vercel rather than the API,
   and the connection silently never establishes — orders would appear only on
   refresh.

5. Deploy, then **send me the URL** and I will:
   - add it to `Cors__AllowedOrigins__1` on Fly (without this the browser blocks
     every request)
   - verify login, the order list, and a status change end to end

### Once it is up

- **Log in** with the seeded admin account: `admin` / `Admin123!`
- **Change that password immediately.** It is documented in this repo, so anyone
  who reads it can reach your dashboard.
- **Decide on exposure.** It is a public URL with a login page. Options in
  `docs/DEPLOYMENT.md` → Admin app: Vercel password protection (paid feature), a
  non-public URL, or accept the login page as the only barrier.

---

## 5. Lightspeed POS — deferred until you talk to the owner

**Where this stands:** the integration is written, tested and deployed. Feeding it
a real order is the only step left, and it's blocked on a conversation rather than
on code.

**Your decision for now:** a **tablet running the admin dashboard**, alongside
Uber Eats, where the restaurant manages orders and sees which are prepaid. Cash
and pay-in-store happen in Lightspeed, and the Lightspeed API gets configured
later once you know what's available.

That's a sound choice and it means **nothing blocks the restaurant going live**.
The admin dashboard is the kitchen's view; the POS push simply stays queued.

**What that implies:**

- The POS push keeps failing and queueing, which is expected and harmless. Orders
  still reach the kitchen via the dashboard. `lightspeed_sync_status = Failed` on
  older orders is the retrier giving up, not a broken order.
- Nothing needs building for the tablet yet — the admin app just has to be
  *reachable* (item in "not yet done" below).
- When credentials do arrive, orders queued in the meantime can be requeued.

**What I need you to ask the owner:**

1. **Which Lightspeed product is it — Retail or Restaurant?** They have different
   order APIs and different account IDs. The code assumes Lightning/Retail-style
   `Order` endpoints.
2. **Does Lightspeed expose an API on their plan?** Some tiers don't, and that
   would settle it: POS sync stays off, the tablet stays the kitchen's view.
3. **Who owns the Lightspeed account credentials?** You'll need someone who can
   authorise an app against it.

**When you have them:**

```bash
fly secrets set \
  Lightspeed__ClientId="..." \
  Lightspeed__ClientSecret="..." \
  Lightspeed__RedirectUri="https://asian-taste-api.fly.dev/api/oauth/callback"
```

The redirect URI must match **exactly** in the Lightspeed app settings. Then
authorise once in a browser — I can't do this part, it needs a human to approve:

```
https://asian-taste-api.fly.dev/api/oauth/authorize
```

Check with `https://asian-taste-api.fly.dev/api/oauth/status`.

**One caveat to carry forward:** the payload shape has never been exercised
against a real Lightspeed account. The `product`, `description` and `note` fields
are my reading of their docs. The only way to be sure is one careful test order
once connected — expect to iterate on that first order rather than assuming it
works.

---

## 6. Decisions I made for you

Each is reversible. I picked the option that keeps things cheapest and safest;
say the word and I'll change any of them.

| Decision | What I chose | Why | How to change |
|---|---|---|---|
| **Where the API runs** | Fly.io, Sydney | Closest region to Adelaide (~15–20 ms), always-on cheaply | Replace with Railway/Render; the Dockerfile is host-agnostic |
| **Database** | Neon, Sydney, pooled | Free tier with no expiry; scales to zero | Any Postgres; it's one connection string |
| **Who deploys the frontend** | Vercel's Git integration | It already deployed every push; a CLI deploy would race it | Add a personal-scope `VERCEL_TOKEN` and turn off Vercel's auto-deploy |
| **Admin app** | Not deployed | Needs your conversation with the owner about exposure | `docs/DEPLOYMENT.md` → Admin app |
| **Payment display** | `paid_amount`/`paid_at` set only on real capture | So "Paid online" can't lie | — |
| **POS failure handling** | Queue and retry, never fail the order | The customer has paid; the kitchen can work from the dashboard | Make it blocking if you'd rather refuse orders when the POS is down |
| **Cash orders** | No gateway call, `Pay on pickup` | Nothing to charge at order time | — |
| **GST** | Prices include it; total = subtotal | Australian convention, matches the printed menu | — |
| **Pickup estimate** | From restaurant settings (15 min default) | Was hardcoded to 20 min | Change in the admin settings |
| **Kitchen's order view** | A tablet running the admin dashboard, alongside Uber Eats | Your call — works now, needs no POS API | Item 4 deploys it |
| **Cash / pay-in-store** | Handled in Lightspeed, not this app | Your call — POS is configured later | Wire it when Lightspeed credentials exist |
| **POS sync** | Deferred, not removed | Needs the owner conversation | Item 5 |
| **Custom domain** | Not now | Your call — customers here don't mind | Point DNS at Vercel when wanted |
| **Hosting the frontend** | Staying on Vercel for now | Your call — keeping it simple | Cloudflare Pages is the alternative (free, commercial use allowed) |
| **Editing the menu** | Future work | Your call | Not built; the menu lives in the seed today |

---

## 7. Future work, in the order I'd do it

You've said most of this is for later, so it's recorded rather than recommended.
The order below is by how much it would bite, not by effort.

1. ~~Deploy the admin app.~~ Moved to item 4, since your tablet decision makes it
   the blocking one. What remains after deploying: decide its exposure (Vercel
   password protection, a non-public URL, or accept the login page).
2. **Refunds via the UI.** `POST /api/payments/{paymentId}/refund` works but
   nothing calls it, so refunds happen in the Stripe dashboard. The endpoint also
   carries a `// TODO: Update order with refund status`, so a refunded order may
   not reflect it locally.
3. **Automated database backups.** Neon's free tier has none. Either upgrade or
   schedule a `pg_dump`. Worth doing before there are real orders to lose.
4. **Menu editing in the admin app.** You've deferred this. Today the menu lives
   in `02_seed_data.sql` and changes need a deploy. The admin API exists; the UI
   doesn't.
5. **Search orders by number.** The list supports status and date filters and
   pagination, but not lookup by order number. Fine at current volume.
6. **`SavePaymentMethod` is accepted and silently ignored.** It's in
   `CheckoutDto` and sent by the checkout, but nothing reads it. A customer who
   ticks "save my card" gets no saved card and no message. Either implement it or
   remove the checkbox — the current state is the worst of the three.
7. **A real domain, when it matters.** You've said people here don't mind, so
   it's parked. `asiantaste.com.au` would be the choice; point DNS at Vercel.
8. **Cloudflare Pages instead of Vercel**, if the commercial-use question ever
   becomes a problem. Vercel Hobby is non-commercial and a restaurant taking
   orders is commercial use. Parked for now.
9. **Order-creation rate limiting.** Only the global 100 req/min applies. Fine
   now.

---

## 8. Questions still open

Only the ones still unanswered. The rest moved into the decisions table.

- **Does Lightspeed expose an API on the restaurant's plan?** This is the one that
  decides whether item 5 is a week of work or a non-starter. Ask alongside which
  product it is.
- **Are there existing menu photos?** The menu renders without images by design —
  the only files in the repo are photos of a printed menu board, which would
  mislead customers. Real dish photography is the single biggest visual
  improvement available, and it's a photography job rather than a code one.
- **Is the printed menu the source of truth for prices?** The seed has 82 items at
  the prices in `Menu.md`. If the board differs, the board wins and the seed needs
  updating.
- **Who changes prices once it's live?** Today it needs a deploy. This decides how
  urgent item 4 (menu editing) becomes.

## Verifying anything

```bash
./scripts/check-deployment-health.sh    # is production working? (14 checks)
dotnet test                             # 97 tests
fly logs -a asian-taste-api             # what the API is doing
```

`docs/ARCHITECTURE.md` explains how all the pieces fit together.
