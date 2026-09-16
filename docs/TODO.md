
# Your todo

Everything I could do without you is done. This is what's left, ordered so that
each item unblocks the next. Every item says what I need from you, or which
decision I've made for now and how to change it.

**Where things stand:** the API, database, customer site **and admin dashboard**
are live and working, and **both front-ends have been rebuilt** against the
ratified design set in `docs/DESIGN/mockups/` (see §11 for what changed and the
six things that need you).

**What needs you, in this order:**

| # | Item | Effort | Why it matters |
|---|---|---|---|
| **2** | Turn off the extra payment methods | ~2 min in Stripe | **Klarna, Zip and Link would be offered to customers today.** Do this before taking real orders |
| **3** | Buy a domain, enable Google Pay | ~$15/yr | The only thing standing between you and Apple Pay |
| **6** | Decide admin-dashboard exposure | a decision | It is a public URL with a login page |
| **7** | Talk to the owner about Lightspeed | a conversation | The last POS blocker |
| **4** | Switch Stripe to live keys | ~10 min | Only when you want real money — and only after item 2 |
| **12** | Try Paseo from your phone | ~5 min | Free; your laptop is the sandbox. Nothing is switched on until you say so |
| **13** | Confirm the phone number, hours, delivery fee and cash option | ~5 min | The rebuilt UI shows a decision on each; four small confirmations close them out |

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

Full detail: `docs/research/apple-pay/PLAN.md`.

---

## 4. Switch Stripe from test to live — and it costs nothing to do

**Your setup right now:** `sk_test_...` on the API and `pk_test_...` on Vercel.
Both correct for testing. The live site loads with **zero console errors**, and
a card order goes through real Stripe in test mode.

**Do item 2 first.** Switching to live while Klarna, Zip and Link are enabled
means real customers can pay in ways the till cannot reconcile.

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

---

## 10. Questions still open

Only the ones still unanswered. The rest moved into the decisions table.

- **Does Lightspeed expose an API on the restaurant's plan?** This is the one that
  decides whether item 7 is a week of work or a non-starter. Ask alongside which
  product it is.
- **Are there existing menu photos?** The menu renders without images by design —
  the only files in the repo are photos of a printed menu board, which would
  mislead customers. Real dish photography is the single biggest visual
  improvement available, and it's a photography job rather than a code one.
- **Is the printed menu the source of truth for prices?** The seed has 82 items at
  the prices in `Menu.md`. If the board differs, the board wins and the seed needs
  updating.
- **Who changes prices once it's live?** Today it needs a deploy. This decides how
  urgent menu editing becomes.

### Added during the UI port (2026-09-15) — decisions I made, and what needs you

The front-ends were rebuilt against the ratified design set in
`docs/DESIGN/mockups/`. Everything below is a place where the design set and the
live system genuinely disagreed. **I picked the option that keeps the app honest
and reversible; none of it is settled fact.**

1. **Dine-in is not offered, because the API cannot accept it.** *(needs you)*
   The mockups draw three services (delivery / pickup / dine in) but the API's
   `OrderType` has two values — `Delivery` and `Pickup` — and the live marketplace
   listing is delivery-only. I shipped **two** buttons rather than a third that
   would fail at checkout or write an order type the kitchen cannot receipt.
   *If the restaurant does dine in*, this needs an API enum value plus a table
   number field, and then the button is a 10-minute change. `HANDOFF.md` §10
   item 3 raises the same question.

2. **The order tracker shows 5 stages, not the mockups' 6.** *(decision,
   reversible)* The design set draws `placed → confirmed → preparing → ready →
   out for delivery → completed`. The API stores six statuses and has no
   separate "out for delivery". I mapped the fifth stage onto `Ready` so the
   customer never sees progress the backend did not record. *To change it*, add
   the status to the API and the extra stage appears.
   The admin console still *shows* the sixth column ("Ready & out" merges ready +
   delivery) because that is where the handover actually happens.

3. **The 82 dishes now carry their printed option groups.** *(decision — worth a
   look)* `modifier_groups` is a stub: `AdminMenuController` returns an empty
   list with a `// TODO: Add IMenuRepository.GetAllModifierGroupsAsync`, and the
   seed has no modifier rows, so **every dish answered `0 option groups`**. The
   ordering flow in the mockups is built entirely around those choices.
   I transcribed the choices the paper menu actually prints (protein, cooking
   method, rice type, the 1–5 heat scale) from `docs/DESIGN/source/Menu.md` into
   `src/lib/menuModel.ts`, matched by dish name. The API's own groups win the
   moment they exist — the adapter prefers them.
   *What this means for you:* the options are real menu content, not invention,
   but a choice's `delta` (e.g. Combo pho +$1.00) is **displayed** and is **not
   yet sent to the API**, because there is nowhere to send it. If a customer
   picks a paid option today the kitchen sees it in the ticket notes and the
   price the API charges is the base price. The real fix is seeding the modifier
   tables. Flagged rather than hidden.

4. **Seven of the 82 dishes have a photo; the other 75 render the woven
   placeholder.** *(correct behaviour, no action)* `menu_items.image_url` is NULL
   for all 82 — migration `10_clear_unverified_dish_images.sql` cleared it. The
   seven photos now live in `src/asian-taste-customer/public/dishes/` and the
   rest fall back honestly. **Three pairings are inferred from item names and
   have never been confirmed by eye** (`pad-thai`, `combination-noodle-bowl-salad`,
   `crispy-pork-noodle-bowl-salad`) — a human should look. Correcting one is a
   data edit in `src/lib/dishPhotos.ts`, not a code change.

5. **Reports and Settings were removed from the admin app.** *(decision)* No
   mockup covers them and neither had real content — Reports was mock analytics
   and Settings had no API behind it. A screen with invented numbers is worse
   than no screen. The routes are gone; nothing else referenced them.

6. **The real phone number and trading hours are now in the app, and I need you
   to confirm them.** *(needs you)* The footer used to carry `123 Main Street`,
   invented hours and a Sydney `(02)` number. I replaced them with the shop's own
   published details: `329 Henley Beach Rd, Brooklyn Park SA 5032`,
   **`08 8298 8200`**, `orders@asiantaste.com.au`, and Mon–Tue 10:00–2:30 /
   Wed–Sun 10:00–8:50. The address matches the database and the menu flyer; the
   phone and hours came from the Uber Eats listing. **Please confirm the phone
   number and hours** — they are the two facts a first-time customer checks, and
   `docs/DESIGN/BRIEF.md` §"What we need from the owner" flags both as owner
   input that was never recorded. One place to change them:
   `src/asian-taste-customer/src/lib/site.ts`.

7. **Delivery is selectable, but the database says delivery is off.**
   *(needs you)* `restaurant_settings.enable_delivery` is **`false`** and
   `enable_pickup` is `true` (migration 09: *"delivery not offered at launch"*),
   yet the ordering flow offers delivery at a $5.00 fee that the API does not
   charge and nothing enforces. I kept both buttons because the design set and
   the marketplace listing both show delivery, but **the setting and the UI
   disagree**. Tell me which is true and I will either remove the button or flip
   the setting.

8. **Stripe payment methods are still the ones the dashboard has on.**
   *(no action, cross-reference)* Unchanged by this port — see item 2 above for
   the Klarna / Zip / Link list that needs switching off before live keys.

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

### Six things that need you (detail in §10)

1. **Is the phone number `08 8298 8200` and are the hours right?** They came from
   the Uber Eats listing and are now on every page. `lib/site.ts`, one file.
2. **Does the restaurant do dine in?** The mockups draw it; the API's `OrderType`
   has no such value, so there are two service buttons, not three.
3. **Is delivery actually offered?** `restaurant_settings.enable_delivery` is
   `false` in the database, but the UI shows a delivery option with a $5 fee the
   API does not charge. The setting and the screen disagree — tell me which wins.
4. **Two of the seven dish photos need a human eye.** They were matched by name,
   never looked at: pad-thai and the two noodle-bowl salads.
5. **No delivery fee is charged online — is that right?** *(needs you)* The shop's
   API records an order's total from its item prices alone: `CreateOrderRequestDto`
   has no fee field, so anything added at the checkout would be charged to the
   card while the order, the receipt and `PaidAmount` all recorded less. Rather
   than collect money the shop's own records disagree with, the online total is
   the subtotal and delivery is offered at no charge. **If the $5 fee is meant to
   apply, the API needs a fee field first** — say the word and that becomes the
   next piece of work, with the fee appearing in the UI the moment it can be
   recorded. The services and their facts live in
   `src/asian-taste-customer/src/lib/site.ts`.
6. **Cash on pickup can no longer be chosen online.** *(needs you)* The old
   checkout offered "pay at the counter"; the ratified design set's payment step
   is card and wallet only, so that option is gone. Cash still works in store —
   it just is not selectable on the website now. Tell me if you want it back and
   it is a small addition to the payment step.

### One thing to know about the option groups

`modifier_groups` is an empty stub on the API, so every dish answered "0 option
groups" and the whole customisation flow the mockups are built around had
nothing to render. The printed choices (protein, cooking method, rice, the 1–5
spice scale) were transcribed from `docs/DESIGN/source/Menu.md` into
`src/lib/menuModel.ts` and are shown, priced and sent as ticket notes. **A paid
option's surcharge is displayed but not yet charged**, because there is nowhere
in the API to send it — the real fix is seeding the modifier tables, and that is
the next piece of work rather than a UI one.

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

## Verifying anything

```bash
./scripts/check-deployment-health.sh    # is production working? (includes POS backlog)
dotnet test                             # 117 tests
fly logs -a asian-taste-api             # what the API is doing
curl -s https://asian-taste-api.fly.dev/health/pos   # any orders stuck on POS sync?
```

`docs/ARCHITECTURE.md` explains how all the pieces fit together.
`docs/research/` holds the Apple Pay, CI timing and Paseo write-ups.
