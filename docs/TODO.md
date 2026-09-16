
# Your todo

Everything I could do without you is done. This is what's left, ordered so that
each item unblocks the next. Every item says what I need from you, or which
decision I've made for now and how to change it.

**Where things stand:** the API, database, customer site and admin dashboard are
live. **v1 is card + Apple Pay, pickup only** — Lightspeed is deferred and does
not interfere. The design set has been rebuilt into both front-ends (§11).

**What needs you, in this order:**

| # | Item | Effort | Why it matters |
|---|---|---|---|
| **2** | Turn off Klarna, Zip and Link; turn on Google Pay | ~2 min in Stripe | **They would be offered to customers today.** Anything switched on in the dashboard appears at checkout with no review |
| **3** | Buy a domain (cheap path in §3) | ~$15/yr | The only thing between you and Apple Pay. A `*.vercel.app` host cannot be registered |
| **4** | Switch Stripe to live, using the checklist | ~15 min + ~50¢ | Prove it works with one real order, then refund it |
| **6** | Decide admin-dashboard exposure | a decision | It is a public URL with a login page |
| **7** | Nudge the owner about Lightspeed | one message | A week of silence. Draft message in item 7 — nothing is blocked either way |
| **12** | Try Paseo from your phone | ~5 min | Free; your laptop is the sandbox |

**Settled on 2026-09-16** (was four open questions): phone, hours, delivery and the
cash option are all answered and applied — §10.

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

## 2. Turn off the payment methods you don't want (do this first — ~2 min)

**This one is urgent and it is my doing.** Enabling wallets for Apple Pay required
removing a card-only restriction on the PaymentIntent, and that restriction was
hiding your Stripe dashboard's payment-method settings. I queried the account and
found **six methods enabled that the restaurant cannot reconcile**:

| Method | State | Shows to an Adelaide customer? |
|---|---|---|
| `apple_pay` | **ON** ✅ | Yes — this is what we wanted |
| `card` | **ON** ✅ | Yes |
| `google_pay` | **off** | No — switch it on |
| `klarna` | ON ⚠️ | **Yes** — buy-now-pay-later |
| `zip` | ON ⚠️ | **Yes** — buy-now-pay-later |
| `link` | ON ⚠️ | **Yes** — Stripe's own wallet |
| `bancontact` | ON | No (Belgium) |
| `blik` | ON | No (Poland) |
| `eps` | ON | No (Austria) |

The last three are harmless here — they only appear to customers in those
countries. **Klarna, Zip and Link are not**: they are all active in Australia, so
they would appear as payment options at checkout.

**Nothing has gone wrong in production yet**, because production is still on test
keys. But once live keys go in, a customer could pay with Klarna and the till
would have no record of it.

### What to do

Stripe Dashboard → **Settings → Payments → Payment methods**:

1. **Turn OFF:** Klarna, Zip, Link, Bancontact, BLIK, EPS
2. **Turn ON:** Google Pay
3. **Leave ON:** Card, Apple Pay

Then tell me and I'll re-query the account to confirm the final list matches.

**Why this wasn't caught earlier:** with the old card-only setting, none of these
ever rendered, so nobody had reason to look. Removing that restriction is correct
for Apple Pay, but it means the Stripe dashboard is now part of the payment surface
— anything switched on there appears at checkout with no code change and no review.

---

## 3. Apple Pay: ready except for a domain

**Code is done. The blocker is a domain, not code.**

### What I changed

Both Stripe PaymentIntent calls passed `PaymentMethodTypes = ["card"]` — a hard
allow-list. Apple Pay and Google Pay are wallets that sit **on top of** card, so
Stripe would never have offered them, no matter what else was configured. Both now
use `automatic_payment_methods`. That is the whole code change; there is no
frontend work, because the checkout already uses Stripe's `PaymentElement`, which
renders the Apple Pay button itself.

Also fixed while in there: the customer email was being attached *after* the
PaymentIntent was created, so wallet payments would have arrived with no email and
no order confirmation. It is now set before the create call.

**108 tests** (4 new, mutation-checked: reverting either call to the card-only list
fails 3 of them). Verified against Stripe's live API that the new shape is
accepted — `automatic_payment_methods: {"enabled": true}` came back on a real
test-mode intent.

### What is left — and it needs a domain

**Apple Pay requires a registered domain.** Apple insists on proof that the site
taking the payment owns its domain. `asian-taste-customer.vercel.app` is a
Vercel-owned host we do not control, so **it cannot be registered**.

That makes the custom domain a *prerequisite* rather than a nice-to-have. This is
the honest answer to "what does Apple Pay cost": about **$15/year for a domain**,
plus a Stripe dashboard toggle. Not a subscription, not a sandbox fee.

**When you have a domain:**

1. Point it at the customer app in Vercel
2. Register it with Stripe (one API call — I can run this for you):
   `POST https://api.stripe.com/v1/payment_method_domains -d domain_name=yourdomain.com`
3. Tell me and I will confirm `apple_pay.status == "active"` — a domain can exist
   while the wallet is still inactive, and that is the state behind most
   "registered it and it still doesn't work" reports.
4. Register in **test and live mode separately** — they are different registrations
5. Add the new origin to `Cors__AllowedOrigins__N` on Fly, or the browser blocks
   every request. The variable is indexed; the JSON-array form fails silently.

### How it will be tested (and why the current checks can't)

**Apple Pay cannot be tested in Chrome, on Windows, or on localhost.** It needs
Safari on an Apple device with a card in Wallet, over HTTPS. So the headless
checks and the nightly UI loop **cannot detect an Apple Pay regression** — a
passing UI loop is not evidence it works. Verification has to be a manual pass on
a real iPhone or Mac.

Full detail: `docs/research/apple-pay/PLAN.md`. **Cheap-domain options and the
step-by-step migration are in `docs/research/domain/PLAN.md`.**

---

## 4. Switch Stripe from test to live — and it costs nothing to do

**Your setup right now:** `sk_test_...` on the API and `pk_test_...` on Vercel.
Both correct for testing. The live site loads with **zero console errors**, and
a card order goes through real Stripe in test mode.

**Do item 2 first.** Switching to live while Klarna, Zip and Link are enabled
means real customers can pay in ways the till cannot reconcile.

**The checklist to actually follow is `docs/research/stripe/GO-LIVE-CHECKLIST.md`**
— it proves the webhook before charging anyone, then spends about 50¢ on one real
order and refunds it. That order of operations matters: a webhook signing-secret
mismatch charges the customer while the order stays `Pending` and nothing errors.

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

### How we verify the live switch actually worked

You asked whether to change the live Stripe API to verify. **Not necessary — and
there is nothing to "toggle to live" on my side.** Here is what actually happens
and how to check it:

**The switch is just three secret values.** Fly and Vercel hold them; nothing in
the code branches on live versus test. So "verifying" means confirming the values
took effect, not flipping a mode.

**What I can verify for you, on request:**

| Check | How | What it proves |
|---|---|---|
| Which mode the API is running | `fly logs \| grep STRIPE` | `ENABLED (live keys)` vs `IN TEST MODE` |
| A real PaymentIntent is charged | Place a $1 test order with your own card | Money actually moves |
| The webhook is live and signing correctly | Stripe dashboard → Webhooks → recent deliveries | Events arrive and are not rejected |
| The publishable key matches the secret | Compare `pk_live_` in the deployed bundle with `sk_live_` on Fly | A mismatch breaks checkout silently |

The third row is the one people skip and it is the one that bites: **test-mode and
live-mode webhook endpoints have different signing secrets.** If `whsec_` on Fly
belongs to the test endpoint, live payments will succeed while orders stay
`Pending` — the customer is charged, the kitchen never sees the order, and nothing
raises an error.

**So the honest order of operations is:**

1. Do item 2 first (turn off Klarna, Zip, Link).
2. Create the live webhook endpoint and note its `whsec_`.
3. Set all three secrets, update Vercel, redeploy.
4. **Tell me, and I will run the four checks above** and report what I find.
5. You place one real order, then refund it (~50¢).

**What I cannot do for you:** create the live keys or the live webhook endpoint.
Those need your Stripe dashboard login. I can do every verification step the moment
they exist.

### Proving it works, cheaply

Place one real order yourself with your own card, confirm it appears in the admin
dashboard, then refund it from the Stripe dashboard. That is one Stripe fee
(about 50¢ on an $8.50 order) rather than a guess.

**Why I would not do it yet:** everything except the live charge is already
verified. There is nothing to gain from switching before you are ready to take a
real order — test mode exercises the same code path.

---

## 5. ✅ Fixed: production was accepting card orders unpaid

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

## 6. Admin dashboard is live — decide its exposure

**Done and verified.** The URL is:

```
https://asian-taste-vietnamese-cuisine-wq44.vercel.app
```

Log in as `admin` with the password you chose. It is deliberately not recorded
here; keep it somewhere safe.

**What I verified end to end, in a real browser:** login → dashboard → order list →
live order push. Two bugs were found and fixed in the process:

- **New orders never reached the kitchen.** `BroadcastNewOrderAsync` was fully
  implemented but nothing called it, so an order appeared only on refresh. Since
  the tablet is the kitchen's whole view, that defeated the point. Now pushes, and
  verified against production.
- **The order list showed blank Order # and Customer columns** for every row —
  the same snake_case/PascalCase mapping bug as the POS payload. The table
  rendered, with correct totals and row counts, so it looked like missing data.
  A kitchen cannot work from a list with no order numbers.

Also fixed the CORS block that produced your `net::ERR_FAILED` — the admin origin
is now `Cors__AllowedOrigins__1` on Fly. Worth knowing: my earlier guess that you
needed `VITE_WS_URL` was wrong. Your env vars were correct; the WebSocket derives
`wss://` from `VITE_API_URL` and connects fine.

### The decision that is still yours

**It is a public URL with a login page.** Anyone who knows the address reaches a
login form, and the app can see every order and change its status. Options:

| Option | Cost | Trade-off |
|---|---|---|
| Accept the login page as the only barrier | $0 | Fine if the password stays private; the URL is guessable-ish but not listed anywhere |
| Vercel password protection | paid feature | A second prompt before the app loads |
| Keep it unlisted and unlinked | $0 | Security by obscurity — weakest, but the URL is not published anywhere |

**My suggestion:** accept the login page for now and revisit if the URL ever gets
shared more widely. The password is strong and not in the repo.

### For the tablet

Point the tablet's browser at the URL and log in once. Nothing else is needed —
no app install, no POS API. Set the browser to remember the session.

---

## 7. Lightspeed POS — deferred until you talk to the owner

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

**What to ask the owner — full detail in `docs/research/lightspeed/PLAN.md`.**
Short version, and note the product names were corrected after checking:

1. **Which Lightspeed product is on the invoice — Retail or Restaurant?** (Vend =
   X-Series, ShopKeep = S-Series, **Kounta = O-Series**, iKentoo-lineage =
   K-Series, Retail = R-Series. An earlier note in this file said Kounta was
   K-Series; that was wrong.)
2. **Is API access included on their plan, or does it need an upgrade — and is
   partner approval required?** Ask Lightspeed sales. There is **no published API
   pricing**, and Restaurant K-Series is partner-approval-gated.
3. **Who can authorise an app against the account?** It must be the account owner,
   in a browser.

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

## 8. Decisions I made for you

Each is reversible. I picked the option that keeps things cheapest and safest;
say the word and I'll change any of them.

| Decision | What I chose | Why | How to change |
|---|---|---|---|
| **Where the API runs** | Fly.io, Sydney | Closest region to Adelaide (~15–20 ms), always-on cheaply | Replace with Railway/Render; the Dockerfile is host-agnostic |
| **Database** | Neon, Sydney, pooled | Free tier with no expiry; scales to zero | Any Postgres; it's one connection string |
| **Who deploys the frontend** | Vercel's Git integration | It already deployed every push; a CLI deploy would race it | Add a personal-scope `VERCEL_TOKEN` and turn off Vercel's auto-deploy |
| **Admin app** | Deployed at `asian-taste-vietnamese-cuisine-wq44.vercel.app` | Your Vercel project; it was correctly set up, only CORS was missing | Decide exposure — see item 6 |
| **Payment display** | `paid_amount`/`paid_at` set only on real capture | So "Paid online" can't lie | — |
| **POS failure handling** | Queue and retry, never fail the order | The customer has paid; the kitchen can work from the dashboard | Make it blocking if you'd rather refuse orders when the POS is down |
| **Cash orders** | No gateway call, `Pay on pickup` | Nothing to charge at order time | — |
| **GST** | Prices include it; total = subtotal | Australian convention, matches the printed menu | — |
| **Pickup estimate** | From restaurant settings (15 min default) | Was hardcoded to 20 min | Change in the admin settings |
| **Kitchen's order view** | A tablet running the admin dashboard, alongside Uber Eats | Your call — it is deployed and working | Point the tablet's browser at the admin URL |
| **Cash / pay-in-store** | Handled in Lightspeed, not this app | Your call — POS is configured later | Wire it when Lightspeed credentials exist |
| **POS sync** | Deferred, not removed | Needs the owner conversation | Item 7 |
| **Custom domain** | Not now | Your call — customers here don't mind | Point DNS at Vercel when wanted |
| **Hosting the frontend** | Staying on Vercel for now | Your call — keeping it simple | Cloudflare Pages is the alternative (free, commercial use allowed) |
| **Editing the menu** | Future work | Your call | Not built; the menu lives in the seed today |
| **Payment integration style** | Staying on Payment Intents | Your decision. Stripe's own guidance recommends Checkout Sessions, but that advice targets new integrations — you already have a working, tested Payment Intent flow, and a rewrite buys nothing except Stripe-calculated tax and easier wallet buttons | Revisit only for a specific feature, not for its own sake |

---

## 9. Future work, in the order I'd do it

You've said most of this is for later, so it's recorded rather than recommended.
The order below is by how much it would bite, not by effort.

1. ~~Deploy the admin app.~~ Done — it is live and verified. What remains is the
   exposure decision, in item 6.
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
10. **Reports and analysis** — the owner wants this later, for looking at trends
    rather than day-to-day. The old admin Reports page was removed with the UI
    rebuild because it showed mock numbers; a real one needs a reporting endpoint
    behind it. Far down the line, deliberately.
11. **Menu editing in the admin app** — the owner's next real ask after v1: the
    printed menu stays the source of truth, but he wants to change a price without
    waiting for a deploy. The admin API exists; the UI does not.
12. **The delivery pipeline** — the UI offers restaurant delivery marked "subject
    to availability". How it is actually fulfilled (own driver, or Uber Eats only)
    is undecided, so nothing completes a delivery order yet.

---

## 10. Decisions made on 2026-09-16 — v1 scope

The owner answered the open questions. What follows is the current scope, not a
proposal. The questions as they were asked are archived in
`docs/archive/answered-questions/2026-09-16-owner-answers.md`.

### v1 is: card + Apple Pay, **pickup only**

**Lightspeed is deferred and must not interfere with the product.** The integration
stays written and deployed but does nothing; orders reach the kitchen through the
admin dashboard. What to ask the owner, and what each answer would cost, is in
`docs/research/lightspeed/PLAN.md`.

### The four services, as they now appear

1. **Pickup — first option and the default.** The only service that completes
   online in v1.
2. **Restaurant delivery** — shown, marked **subject to availability**, and it
   carries an additional charge. The UI is built; the order pipeline is not, so
   it does not complete a checkout yet.
3. **Uber Eats** — a link out to the restaurant's listing, not an order path here.
   `https://www.ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA`

**The delivery fee question is settled by the same answer:** no fee is charged
online, because the API still has no field to record one. See §11.

### The status lifecycle, simplified

`Placed → Confirmed → Preparing → Ready`, then `Cancelled`.

- **Confirmed and Preparing are one state.** Once the restaurant confirms, the
  food is being made — so there is no separate "Preparing" button to press. The
  admin console shows it as one stage.
- **"Out for delivery" is removed** (no delivery in v1) **and so is "Completed"**
  — for pickup, `Ready` is the end of the story.

### Add-ons, and where they live

Every dish gets the same base groups: **spice level**, **allergy**, **combo**, and
a **multi-select extras** group — extra protein +$4, extra soup +$3, extra
rice/noodle +$2, extra sauce +$2. Extras can be picked together.

**The surcharge applies only where the printed menu already charges for it**, so a
dish that gets rice included does not silently become $2 dearer. The group is still
*shown* so the choice reaches the kitchen.

The schema is built so the owner can add per-dish options later without a schema
change — see the migration in `src/AsianTaste.API/Data/Migrations/`.

### Real store details, now in the app

| | |
|---|---|
| Phone | **08 8234 8232** |
| Hours | Wednesday–Sunday 10am–4pm, 4:30–9pm · Monday 10am–2:30pm · **Tuesday 10am–4pm, 4:30–9pm** |
| Rating | **4.6 from 435 reviews** (Google) |

Note the shape: the kitchen closes and reopens for the dinner service, so the
"open now" logic has **two windows per day**, not one. Monday is lunch only.
Tuesday is a full day. One source: `src/asian-taste-customer/src/lib/site.ts`.

### Still genuinely open

- **Menu editing in the admin app.** The printed menu is the source of truth and
  the seed matches it, but the owner wants to change prices himself rather than
  wait for a deploy. Not built. Ranked in §9.
- **The delivery pipeline.** The UI says "subject to availability"; nothing
  enforces or fulfils it. Needs a decision on how delivery is actually offered —
  own driver, or via Uber Eats only.
- ~~Dish photos~~ — the owner is supplying them. The 7 published photos stay;
  the rest keep the woven placeholder, which is correct until real files arrive.
- **Reports** — moved to §9 as later work.

## 11. The UI rebuild — what changed, and how to check it

Both front-ends were rebuilt against the ratified design set in
`docs/DESIGN/mockups/`. The old UI was deleted, not patched: **23 customer
components and 12 admin components removed**, replaced by a modular layer.

### What the new UI is made of

| Layer | Customer | Admin |
|---|---|---|
| Tokens + type | `src/index.css` `@theme` | `src/index.css` `@theme` |
| Primitives | `components/ui/{Button,Panel,Badge,State,Modal,Toast}` | `components/ui/{Primitives,StatusPill,AdminToast}` |
| Shell | `components/layout/{Header,Footer,MobileBar,ServiceBar,Brand}` | `components/AdminLayout` |
| Screens | `pages/*` | `pages/*` |
| Model | `lib/{menuModel,site,dishPhotos}`, `hooks/useMenuIndex` | `lib/orderStatus` |

The palette is the locked one from `brand-spec.md` — cream paper `#F5F0E6`,
white surfaces, deep-brown `#3C2A21`, hairlines `#E8DCC8`, one maroon accent
`#8B3A3A`. **`--tan` and `--brown-light` are gone**, with no aliases left behind:
Tailwind drops an unknown utility silently, so any survivor would render nothing
rather than erroring. Headings are Plus Jakarta Sans, body is Manrope — Playfair
is retired.

### Verified (commands that actually ran)

```bash
cd src/asian-taste-customer && npm run build && npm run lint && npm test   # all pass
cd src/asian-taste-admin    && npm run build && npm run lint && npm test   # all pass
./scripts/check-test-wiring.sh && ./scripts/check-test-health.sh           # 117 tests, unchanged
./scripts/check-ci-integrity.sh --static-only                              # PASS
```

Screens were rendered headlessly at **390 / 768 / 1280** and checked for
horizontal scroll and console errors: **18/18 clean**. The menu renders 82 dishes
across 14 sections with 7 photos and 75 woven placeholders.

### The questions this section used to list

They were answered on 2026-09-16 and are now settled in §10: the phone number and
hours, the delivery and cash questions, and the option groups. The version of this
section as it was written is archived in
`docs/archive/answered-questions/2026-09-16-owner-answers.md`.

### One thing to know about the option groups

`modifier_groups` is an empty stub on the API, so every dish answered "0 option
groups" and the whole customisation flow the mockups are built around had nothing
to render. The printed choices are now modelled in `src/lib/menuModel.ts` and
seeded in the database so the owner can add per-dish options later. **A paid
option's surcharge is displayed and charged only where the printed menu charges
for it** — see §10.

---

## 12. Using Paseo from your phone — free, and here is why

**Short answer: you do not need to pay anything, and leaving your laptop open is
exactly the right setup.**

I checked your machine rather than guessing:

```
Local Daemon      running
Listen            127.0.0.1:6767
Relay             disabled
```

That tells the whole story. The daemon only listens on **loopback** (127.0.0.1),
which by definition only your own machine can reach. Your phone cannot see it
directly. The piece that bridges that gap is the **relay**, and it is currently
off.

**Turning it on is a setting, not a purchase:**

```bash
paseo daemon pair --relay     # prints the pairing QR code for your phone
```

So: laptop open, daemon running, relay enabled, scan the QR once. After that you
write a prompt on your phone and review the diff on your phone — which is exactly
what you described wanting. No sandbox subscription is involved, and you are right
that your laptop can serve as its own sandbox.

**Why "leave the laptop open" is the correct model here, not a compromise:** the
work happens on your machine, in this repo, with your toolchain and your git
history. A cloud sandbox would be a *different* machine that would need the repo
cloned, dependencies installed, and the production credentials absent by default.
Your laptop already has all of it. The trade is only that the laptop must stay
awake — set it not to sleep on power, or the phone session dies.

**What I would check before relying on it**, in order:

1. **Confirm the relay is free.** If `paseo daemon pair --relay` asks for an
   account or a plan, stop and tell me rather than entering card details —
   everything up to that point is free, and there may be a self-hosted alternative.
2. **Decide whether it works on `main` or on branches.** Two sessions pushing to
   `main` is how changes get silently lost. Branches cost one extra tap.
3. **Read `docs/research/paseo/PLAN.md`** — it lists what is safe to do from a
   phone versus what needs you at the keyboard. The important one: the agent
   environment can read `~/.fly` and the Vercel CLI config, so a remote session can
   **deploy production and change its secrets with no second prompt**. Deploying and
   rotating secrets should stay keyboard-only.

**One thing I did not do:** I did not enable the relay. It changes what can reach
your machine, and that felt like your call rather than mine. Say the word and I
will turn it on and print the pairing code.

---

## Fixed: the customer site showing "No items found"

**This was not Fly, and it was not Neon.** Both were healthy the whole time —
`fly status` showed `started` with the health check passing, and `/health/db`
returned `{"status":"healthy","menuItems":82}` on every attempt.

**The actual cause: a variable name.** The Vercel project had `VITE_API_URL`,
which is the **admin** app's variable. The customer app reads
`VITE_API_BASE_URL`. With no value, the app fell back to a relative path, so the
browser requested:

```
https://asian-taste-customer.vercel.app/api/menu   -> 404
```

...against the frontend's **own** domain. The API was never contacted.

**Why it was so hard to spot, and why it kept happening:** no request to the API
host appears in the network tab at all, because the request never leaves the
frontend's origin. It looks like an empty database. And the app's own
`.env.example` documented `VITE_API_URL`, contradicting the code — so anyone
setting up the project would reasonably set the wrong name.

**What I changed:**

- Set `VITE_API_BASE_URL` on the Vercel project (all three environments).
- The client now accepts **either** name, preferring the correct one, and warns
  when it falls back. A wrong name now degrades to "works, with a warning" instead
  of a silent 404 loop.
- Corrected `.env.example`, which was the trap.
- Corrected the symptom table in `docs/DEPLOYMENT.md` — its entry for this symptom
  named the wrong cause, which is why the fix never stuck.
- 6 tests, mutation-checked: removing the fallback fails 4 of them.

**Verified live:** 82 dish cards on `/menu`, 7 on the homepage, and the full
add-to-cart path works at $8.50 — zero console errors.

**If it ever happens again, check this first:**

```bash
# Is the API host actually in the deployed bundle?
curl -s https://asian-taste-customer.vercel.app/ \
  | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 \
  | xargs -I{} curl -s https://asian-taste-customer.vercel.app{} \
  | grep -c 'asian-taste-api.fly.dev'
```

Zero means the variable was missing at build time. That is this bug.

---

## What that recurring Fly log line was (and how it's fixed)

You pasted this repeating every 30 seconds:

```
info: AsianTaste.API.Services.OrderSyncBackgroundService[0]
      Retrying 1 failed order(s)
```

**It was misleading, and that was the bug.** The retry loop counted every order
marked `Failed`, logged that count, and only *then* checked each order against the
retry limit — skipping exhausted ones with a `Debug`-level message. Production logs
at `Information`, so the skip was invisible: the line was emitted every 30 seconds
for an order that was **never retried**.

So POS sync looked busy and working when it had actually given up. One of your real
orders had been sitting in that state for hours.

**Three fixes:**

1. **The log is now honest.** Only genuinely retryable orders are counted; given-up
   ones produce a warning that names the number and where to look.
2. **It no longer repeats.** A stuck order is permanent, so warning every 30 seconds
   would emit ~2,880 identical lines a day and bury real messages. It now fires
   only when the count **changes** — a newly stuck order still announces itself,
   and clearing the backlog is confirmed instead of silent.
3. **`/health/pos` reports it** without failing anything, since a stuck POS order
   means the kitchen should use the dashboard, not that the site is down.

**Verified in production:** the last warning was at `10:25:47`; it's now `10:32:41`
with the count steady at 2 and nothing further emitted. That window previously
produced ~14 duplicate lines.

### The two orders it was complaining about

Both are **real orders**, both fully paid, both complete. They only failed to *sync
to Lightspeed*, which was never configured:

| Order | Amount | Status |
|---|---|---|
| `AT-131302-0C8B` | $24.00 | Pending |
| `AT-131949-0C4F` | $48.00 | Completed, card payment succeeded |

**Nothing is broken and no action is needed.** They are visible in the admin
dashboard and the kitchen can work from there. They will sync automatically once
Lightspeed credentials exist (item 7).

If you'd rather not see them flagged, `lightspeed_sync_status` can be set to
`Synced` directly — but it's better to leave them, since they're an accurate record
that POS sync never happened.

---

## Known trap: a local dev database can be half-migrated

**Symptom.** `dotnet run` logs, repeating three times, then starts anyway:

```
Migration statement failed with SQLSTATE 42703: column "customer_id" does not exist
Database initialization FAILED after 3 attempts. The API is starting WITHOUT a working database.
```

The menu still loads (82 items) — that table is fine — but **every admin table is
missing**: `/api/auth/login` returns `500 relation "admin_users" does not exist`,
so the admin dashboard cannot be used locally, and any migration added after the
failure never runs. That is why migration 13 could not be verified locally and had
to be proved on a clean database instead.

**Cause.** The local database is in a half-migrated state, not a code fault. It is
pre-existing. `01_create_schema.sql` creates `customer_payment_methods` with a
`customer_id` referencing `customers(id)`; a run that died between those two
statements leaves the table present-but-wrong, and every later boot retries
`CREATE TABLE IF NOT EXISTS` (which succeeds, so it changes nothing) and then
fails on the index. The API deliberately starts anyway rather than becoming a
restart loop, which is correct for production and confusing locally.

**Not the same as production.** `/health/db` returns
`{"status":"healthy","menuItems":82}` on both, so the menu tells you nothing about
whether the admin tables exist.

**Fix for a local machine.** Drop and recreate the database, then let the API
migrate from scratch — that is the only reliable route, and it is what a clean
database proves:

```bash
docker run -d --name at-dev-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=AsianTaste -p 5432:5432 postgres:16-alpine

# point the API at it for one run, and it migrates from empty
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=AsianTaste;Username=postgres;Password=dev" \
  dotnet run --project src/AsianTaste.API --no-launch-profile
```

**How to verify a migration properly.** Never against this local database. Bring up
a throwaway Postgres, point `ConnectionStrings__DefaultConnection` at it, boot
once, then **boot a second time and compare row counts** — a seed that appends on
every start is this repo's oldest bug (`02_seed_data.sql` once duplicated all 82
dishes, and migration 13's dedupe guards exist for the same reason). Remove the
container afterwards.

---

## Verifying anything

```bash
./scripts/check-deployment-health.sh    # is production working? (includes POS backlog)
dotnet test                             # 117 tests
fly logs -a asian-taste-api             # what the API is doing
curl -s https://asian-taste-api.fly.dev/health/pos   # any orders stuck on POS sync?
```

`docs/ARCHITECTURE.md` explains how all the pieces fit together.
`docs/research/` holds the Apple Pay, CI timing and Paseo write-ups.
