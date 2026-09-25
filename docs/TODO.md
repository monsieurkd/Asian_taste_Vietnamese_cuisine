
# Your todo

Everything I could do without you is done. This is what's left, ordered so that
each item unblocks the next. Every item says what I need from you, or which
decision I've made for now and how to change it.

**Where things stand:** the API, database, customer site and admin dashboard are
live. **v1 is card + Apple Pay, pickup only** — and the storefront now offers only
pickup, so nothing can be ordered that the shop cannot serve (§13). The design set
has been rebuilt into both front-ends (§11).

On 2026-09-25 the order workflow was taken end to end — how the stages are named,
what each screen says about payment and timing, and what data a screen may show —
and the codebase was cleaned around it. **§13 is the record of what changed and
which decisions it implements.** Two long-standing promises were kept on the way:
the kitchen ticket now shows the real payment state and the time an order is wanted.

Five items from §9 were closed on 2026-09-20 without needing you (refund
recording, order-number search, the silently-ignored `SavePaymentMethod`, order
rate limiting, and a backup script). What that work left open is in §9's
**"Decisions this work needs from you"** table — four items, none urgent.

**What needs you, in this order:**

| # | Item | Effort | Why it matters |
|---|---|---|---|
| **2** | Turn off Klarna, Zip and Link; turn on Google Pay | ~2 min in Stripe | **They would be offered to customers today.** Anything switched on in the dashboard appears at checkout with no review |
| **3** | Buy a domain (cheap path in §3) | ~$15/yr | The only thing between you and Apple Pay. A `*.vercel.app` host cannot be registered |
| **4** | Switch Stripe to live, using the checklist | ~15 min + ~50¢ | Prove it works with one real order, then refund it |
| **6** | Decide admin-dashboard exposure | a decision | It is a public URL with a login page |
| **12** | Try Paseo from your phone | ~5 min | Free; your laptop is the sandbox |
| **D1–D3** | Three decisions in §9 | a decision each | Backups, the order rate limit and refunds in the UI. All have a working default, so nothing is blocked. **D4 (saved cards) was settled on 2026-09-25: removed** — see §13 |

**Settled on 2026-09-16** (was four open questions): phone, hours, delivery and the
cash option are all answered and applied — §10.

**Waiting on someone else:**

- **Senior review — visual quality and codebase organisation.** Open, raised
  2026-09-17 and tracked as **[issue #3](https://github.com/monsieurkd/Asian_taste_Vietnamese_cuisine/issues/3)**
  — both front-ends, no backend review. Nothing here is blocked on it, and its
  findings land in this file. Review-shaped work lives in GitHub issues from now
  on; this file stays the live list of what is outstanding.

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

## 7. Lightspeed POS — retired on 2026-09-25, the tables kept

**Where this stands:** the integration's **code is gone**. It was written and
deployed but never configured, so it had no producer and no consumer: a full service
layer, a background retry host, a webhook service, an OAuth flow, two dev endpoints,
`/health/pos` and a deployment-health check — all sitting in the DI graph doing
nothing, with a POS push in the order-creation path that always failed and queued.

The **database tables and migrations stay**, deliberately. A shipped migration cannot
be un-applied, the tables hold real rows, and dropping them would be a destructive
change with nothing to gain.

**Your decision, unchanged:** a **tablet running the admin dashboard**, alongside Uber
Eats, where the restaurant manages orders and sees which are prepaid. Cash and
pay-in-store happen in Lightspeed. Nothing blocks the restaurant going live, which
has been true since v1.

**To bring it back if the owner ever says yes:** it is a rebuild from
`docs/research/lightspeed/PLAN.md` rather than a flag, because the code is not there
any more — and this time it should start from what the POS needs, not from what the
API happens to expose. The order flow no longer has a POS hook at all, so nothing is
half-wired in the meantime.
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

### Decisions made while building the agent swarm (2026-09-19)

You asked for an autonomous swarm that can merge and deploy. Several consequential
choices were made while building it. Each is reversible, and each is flagged here
because it **should have been a question put to you** rather than a judgement call —
the instruction was not to ask. The two marked **you should look at this** are the ones
where a different answer is genuinely reasonable.

| Decision | What I chose | Why | How to change |
|---|---|---|---|
| **Autonomy ceiling** ⚠️ **you should look at this** | The swarm *can* merge to `main` unattended (which deploys to production), but only via an explicit `--merge` flag; the default run stops with a green branch | You said "auto-merge + deploy". I implemented it as asked, but no model ever executes the merge — the driver does, with a fixed shape, so a bad judgement cannot land code by itself | Drop `--merge`, or run in a throwaway clone/fork |
| **Rollback is a `git revert`, not a redeploy** ⚠️ **you should look at this** | On a failed production health check after `--deploy-watch`, the merge is reverted and the pipeline re-runs | A revert is the only safe way to undo a shared branch (a reset would rewrite `main` and is denied) | Accept the minutes-long window, or keep the swarm off `main` entirely |
| **`--deploy-watch` was never tested against production** | Written and documented, never triggered for real | I could not run it here (no model credential), and testing it would mean deliberately breaking production | Treat the first few runs as an experiment; the docs say exactly that |
| **Eight roles, not five** | Added `swarm-pm-assistant` and split dev into four specialists | You asked for a PM assistant, and for dev agents specialised per area ("back, front, UI, C#") — so the split follows your words. But 4 specialists is more seams than this codebase strictly needs | Merge roles in `.reasonix/skills/`; the driver only requires `DEV_ROLES` to match |
| **Chunks run sequentially** | No parallel chunk execution | Research on multi-agent loops is consistent that free coordination is where they fail (conflicting edits, stale state, duplicated work). Sequential is slower and correct | Implementing parallel chunks is a real change, not a config flag — I would not |
| **`--max-attempts 3`, `--max-replans 3`** | 3 fix attempts, then 3 direction changes, then halt | Your instruction: 3 attempts before changing direction, and no rewriting an already-wrong module | Both are CLI flags — no edit needed |
| **Danger chunks halt instead of building** | Chunks touching migration order or `Payment__UseMockGateway` stop the run | Those have caused production incidents here and no automated check fully judges them | Remove `danger` from the PM's vocabulary if you want them attempted |
| **Guardrail edits are never auto-merged** | A run touching `.github/workflows/**`, `scripts/check-*.sh`, `.gitignore`'d guardrails, `.githooks/**` or `.test-baseline` is halted | A guardrail cannot audit its own removal, and lowering `.test-baseline` is the cheapest way for a stuck agent to fake green | Deliberate; I would not change it |
| **Run artifacts are gitignored** | `.swarm/` holds logs, plans, reports — local only, not committed | It's an audit trail for the machine that ran it, not source | Commit it if you want the reports in history |
| **The driver's own logic is tested by a selftest, not the suite** | `scripts/swarm/selftest.mjs` (46 checks) is outside `dotnet test` and outside `.test-baseline` | It is JavaScript, so it cannot join the C# suite; wiring it into CI is a workflow change, and the swarm is forbidden from touching workflows | Add a CI step calling `node scripts/swarm/selftest.mjs` — worth doing |

---

## 9. Future work, in the order I'd do it

You've said most of this is for later, so it's recorded rather than recommended.
The order below is by how much it would bite, not by effort.

**Items 2, 3, 5, 6 and 9 were completed on 2026-09-20 without needing you** —
they were all resolvable from the code. Details below each. Four things from that
work do need a decision, marked **needs you**.

1. ~~Deploy the admin app.~~ Done — it is live and verified. What remains is the
   exposure decision, in item 6.
2. ~~Refund recording.~~ **Done.** `POST /api/payments/{paymentId}/refund` works
   and now marks the order. The `charge.refunded` webhook — the authoritative path,
   since refunds actually happen in the Stripe dashboard — did the same thing: it
   logged the refund and changed nothing, so a refunded order kept reading as paid
   and the day's takings stayed overstated. Both now set `Refunded` or
   `PartiallyRefunded`.
   - **Found while fixing it:** `external_payment_id` is never written by any code
     path, so the pre-existing `GetOrderByExternalPaymentIdAsync` **and the refund
     endpoint's use of it** could never match an order. Added a lookup by
     `payment_intent_id`, which is what the checkout actually stores.
   - **Still missing: refunds via the UI.** The endpoint exists but nothing calls
     it, so a refund still means the Stripe dashboard. That is now safe (the order
     updates either way), but a "Refund" button is unbuilt.
3. ~~Automated database backups.~~ **Partly done.** `scripts/backup-db.sh` takes a
   verified, restorable dump — it writes through a `.partial` name, checks the
   archive reads back with `pg_restore --list`, and confirms the four tables that
   matter are in it. It falls back to the postgres Docker image when `pg_dump` is
   not installed, and prefers the unpooled Neon URL because `pg_dump` fails against
   PgBouncer.
   - **needs you:** nothing runs it on a schedule. See the decision below.
4. **Menu editing in the admin app.** You've deferred this. Today the menu lives
   in `02_seed_data.sql` and changes need a deploy. The admin API exists; the UI
   doesn't.
5. ~~Search orders by number.~~ **Done.** This was worse than described: the old
   search filtered only the ~100 orders already fetched, so it silently failed at
   the one lookup staff actually perform — a customer reading out a number on the
   phone. Now a real server-side filter. Two hazards are pinned by tests: the term
   is parameterised (an injection would be trivial otherwise, since it comes
   straight from a query string), and a typed `%` is escaped so it means a literal
   character rather than matching every order.
6. ~~`SavePaymentMethod` silently ignored.~~ **Done — removed, not implemented.**
   The flag went through the store, the pending order, the request body and the DTO,
   and nothing read it; no code wrote a row to `customer_payment_methods`. Worse,
   the Account page told customers to "tick save this card at checkout to keep one
   for next time" — a promise the app could not keep. That copy is gone and the flag
   is removed end to end, with a test that makes re-adding it without an
   implementation fail the build.
   - **needs you:** if you want saved cards, the read side (table, getter, Account
     panel) was kept deliberately, so it is additive. It needs a Stripe SetupIntent
     plus a decision about when a stored card may be charged.
7. **A real domain, when it matters.** You've said people here don't mind, so
   it's parked. `asiantaste.com.au` would be the choice; point DNS at Vercel.
8. **Cloudflare Pages instead of Vercel**, if the commercial-use question ever
   becomes a problem. Vercel Hobby is non-commercial and a restaurant taking
   orders is commercial use. Parked for now.
9. ~~Order-creation rate limiting.~~ **Done.** Only the global 100 req/min applied,
   which is right for browsing and useless for the endpoint that writes a row,
   creates a PaymentIntent and queues an email — a script could create 100 orders
   before tripping it. Order creation now has its own 10/minute budget, keyed so
   that browsing cannot spend it and one abusive address cannot lock out everyone
   else.
   - **Worth watching:** 10/minute is a judgement call, not a measured figure. It
     should be reviewed against real traffic once there is any.
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

### Decisions this work needs from you

| # | Decision | Why it needs you | The default I have taken |
|---|---|---|---|
| D1 | **Where database backups live, and whether to schedule them** | A backup on the same machine as the thing it protects is not a backup. Options: a Neon paid tier (real point-in-time restore), a scheduled job writing to object storage, or an external drive you run weekly | **None — `scripts/backup-db.sh` is manual only.** Run it by hand until you decide |
| D2 | **Order-creation rate limit: is 10/minute right?** | It is a business trade-off, not a technical one. Too low blocks a busy service; too high does not deter a script | 10/minute per IP, global 100/minute unchanged |
| D3 | **Refunds: build the admin button?** | The endpoint now works correctly, so this is purely about whether you want to refund without opening Stripe | Not built. Refunds happen in the Stripe dashboard, and the order now updates either way |
| D4 | **Saved cards: finish it or leave it removed?** | Needs a Stripe SetupIntent flow and a rule for off-session charges | Removed. The read side is kept so finishing it is additive |

---

## 10. Decisions made on 2026-09-16 — v1 scope

The owner answered the open questions. What follows is the current scope, not a
proposal. The questions as they were asked are archived in
`docs/archive/2026-09-16-owner-answers.md`.

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
- **"Out for delivery" is removed** (no delivery in v1).
- **"Completed" is back, as `Collected`.** It was removed with the v1 scope when
  `Ready` was the end of the story, then restored on 2026-09-17: `Ready` alone
  cannot tell the owner whether an order was ever picked up, so a bag left on the
  counter is indistinguishable from one that went out the door, and neither was
  counted as sold. The console now has a fourth stage —
  `Placed → Confirmed → Ready → Collected`.
  - **Collected is stored as the API's `Completed`.** No schema change, no
    migration: the enum value already existed and only the console's vocabulary
    and board behaviour changed. `apiStatusValue` sends `Completed`.
  - **Pressing it clears the board** — collected orders leave the live columns,
    and the dashboard now counts them (`Collected today`, and `Revenue today` is
    summed from them). It previously summed `Ready`, which reported every bag
    still on the counter as sold.
  - **Ready is no longer terminal**, so an order sitting there still shows as
    work in hand. That is deliberate — someone still has to hand it over.
  - **The customer's tracker is unchanged**: `Completed` still reads as the last
    stage, `Ready`. The customer does not need a "collected" state; the shop does.

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

### Verified (commands that actually ran, on 2026-09-18)

Kept as a record of that change, not as the current state — the suite has moved on
(it is 170 API tests plus 93 customer and 61 admin front-end tests as of §13), and
the commands to run today are under "Verifying anything" at the end of this file.

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
`docs/archive/2026-09-16-owner-answers.md`.

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
3. **`/health/pos` reported it** without failing anything, since a stuck POS order
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

## Fixed: the two local databases are now one

**What was wrong.** There were two local Postgres databases, `AsianTaste` and
`AsianTaste_Dev`, and which one you reached depended on an environment variable —
with **the broken one as the default**.

`appsettings.json` named `AsianTaste` with the password `your_password`. That is a
*template* value: production overrides it from the Fly secret, so nobody had ever
meant it to be a real database. But ASP.NET falls back to that file when
`ASPNETCORE_ENVIRONMENT` is unset, so a plain `dotnet run` created and migrated
`AsianTaste` instead of the real one. That run died partway through
`01_create_schema.sql`, and because `CREATE TABLE IF NOT EXISTS` then succeeds
forever without repairing anything, the database ended up with 7 tables and no
`admin_users` — permanently.

The symptom, on every local boot:

```
Migration statement failed with SQLSTATE 42703: column "customer_id" does not exist
Database initialization FAILED after 3 attempts. The API is starting WITHOUT a working database.
```

The menu still returned 82 items, so it looked fine — but `/api/auth/login` gave
`500 relation "admin_users" does not exist`, the admin dashboard was unusable
locally, and **no migration added after that failure ever ran there** (migration 13
had applied to `AsianTaste_Dev` and never to `AsianTaste`).

**It cost two wrong conclusions, which is why it is written down.** One
diagnostic run tested `AsianTaste_Dev`, found it healthy, and reported the bug
"already healed" — true for that database, wrong for the one a plain `dotnet run`
actually reached. `/health/db` answers `{"status":"healthy","menuItems":82}` on
both, so a clean bill of health on the menu is not evidence the schema is sound.
**Check the database name, not the schema, when a local table is "missing".**

**What changed.**

- `AsianTaste` was dropped. It held no real data — 0 orders, 0 order items, only
  the 82 seeded dishes, which `02_seed_data.sql` recreates.
- `appsettings.json` now points at **the same database as
  `appsettings.Development.json`** (`AsianTaste_Dev`), so there is no wrong
  database left to reach by accident. Production is unaffected: `fly.toml` sets
  `ASPNETCORE_ENVIRONMENT=production` and the real connection string is the Neon
  secret.
- Two junk `probe_tmp*` tables dropped from `AsianTaste_Dev`.
- `README.md` and `AGENTS.md` now pass `ASPNETCORE_ENVIRONMENT=Development`
  explicitly, because the old instructions were what led you into the trap.

**Verified:** a plain `dotnet run` now returns `401` on a bad login rather than
`500`, a real login returns `200`, and the pho returns all four option groups.

**How to verify a migration.** Still not against a local database — bring up a
throwaway Postgres, point `ConnectionStrings__DefaultConnection` at it, boot once,
then **boot a second time and compare row counts**. A seed that appends on every
start is this repo's oldest bug (`02_seed_data.sql` once duplicated all 82 dishes,
which is why migration 13 has dedupe guards). Remove the container afterwards.

## Verifying anything

```bash
./scripts/check-deployment-health.sh    # is production working?
dotnet test                             # 170 tests (the floor lives in .test-baseline)
fly logs -a asian-taste-api             # what the API is doing
curl -s https://asian-taste-api.fly.dev/healthz      # liveness
curl -s https://asian-taste-api.fly.dev/health/db    # can it reach the database?

# The three guardrails, run locally before pushing:
./scripts/check-test-wiring.sh          # can every tracked test file run?
./scripts/check-test-health.sh          # did the suite really run, and mean something?
./scripts/check-ci-integrity.sh --static-only   # are the guardrails still armed?

# Front-ends (from each app directory):
npm run build && npm run lint && npm test
```

`docs/ARCHITECTURE.md` explains how all the pieces fit together.
`docs/research/` holds the Apple Pay, CI timing and Paseo write-ups.

---

## 13. The order workflow, and the cleanup around it — 2026-09-25

The brief was "clean the repo, and fix the UI/UX and the backend so the order flow
is smooth", with the order workflow as the part that matters most. That is what this
section records: the decisions taken, what changed, and what is deliberately still
open. §10 and §11 are the older scope records and are unchanged.

### The decisions this work implemented

| Decision | Answer | Where it shows |
|---|---|---|
| **The stage vocabulary** | One set of stages, the shop's own words: **New → Cooking → Ready → Collected** | Both front-ends, one module (§13.1) |
| **What a ticket must carry** | The real payment state, and the time an order is wanted | Console board, order list and ticket (§13.2) |
| **Delivery** | **Pickup only in the UI.** Uber Eats stays a link in the footer | Storefront (§13.3) |
| **Lightspeed** | Retire the code and the endpoints, **keep the tables** | API, DI, health checks, deploy script (§13.4) |
| **Cleanup depth** | Also delete endpoints nothing calls, plus the deferred scaffold | §13.4 |
| **How it lands** | Merge to `main` and deploy once everything is green | CI → Fly (API) + Vercel (apps) |

### 13.1 One vocabulary for the order journey

`src/shared/lib/orderStatus.ts` is now the only place the stages are named, and both
apps import it. The words are the shop's, not the API's:

    placed → New       confirmed → Cooking      ready → Ready      collected → Collected

- **"Confirmed" was the problem.** The kitchen board's column header already said
  "Cooking" while the pill on the same card said "Confirmed", so one screen carried
  two names for one state — and neither word tells a cook what to do next.
- **The keys and the API values did not change.** `apiStatusValue` still sends
  `Pending`/`Confirmed`/`Ready`/`Completed`, and `statusKey` still folds `Preparing`
  onto the cooking stage. This is a vocabulary change, not a schema change.
- **The storefront had its own second list** (`lib/orderLifecycle.ts`, three stages)
  in which `Completed` read as **"Ready"**. A collected order therefore still read as
  waiting on the counter to the customer. That list is now derived from the shared
  one, so the two apps cannot drift apart again.
- **The customer's tracker gained the handover stage** (`Collected`) for the same
  reason, and the board's columns are built from `OPEN_STATUSES` rather than a
  hand-written copy.

### 13.2 What a screen may now say

Four defects were found in the order path while doing this. Each is fixed, and each
has a test that fails without the fix.

1. **The kitchen ticket showed nothing.** `GetAdminOrderDetailAsync` selected its
   columns with **no aliases at all**, and Dapper maps by exact name with underscore
   matching off — so every multi-word property (order number, customer, status,
   service, times) came back empty. Only the single-word columns were left standing.
   The page rendered correctly, which is what made it read as missing data.
2. **A declined card read as paid.** Neither admin query selected `payment_status`,
   and the ticket's payment panel printed "Paid online" for anything that was not
   Cash. Both the detail endpoint and the list now carry the payment state, and the
   console reads it through one helper (`readPayment`), which flags money that has
   not been taken on the ticket and in the list.
3. **A scheduled order looked identical to an ASAP one.** `requested_time` was
   stored and never displayed, so an order wanted at 6pm appeared on the board at 4pm
   and would have been cooked on arrival. The list, the ticket and the detail page
   now say "For 4:30 PM" or "ASAP".
4. **"Today" was a UTC day, and the last 100 rows.** `GetDashboardSummaryAsync`
   compared against `DateTime.UtcNow.Date`, so the whole Adelaide evening service was
   counted as *tomorrow's* takings; and the dashboard recomputed "Collected today"
   and "Revenue today" from the fetched page, so a busy day truncated both. The
   summary now uses the restaurant's own timezone, and the dashboard uses the
   server's figures.

Also fixed on the way: the customer's order detail now returns the modifiers it had
already loaded (spice level, allergy, paid extras were being discarded, so the
customer's copy of an order showed fewer choices than the kitchen's), the pickup
estimate on the customer's screens comes from the restaurant setting rather than a
literal `+20` minutes that disagreed with the checkout's `+15`, and the confirmation
screen reports "Paid" only when a charge was actually captured.

### 13.2b A card order could read as paid having taken no money — found in production

Found on 2026-09-25 by the deployment probe that runs after a deploy, not by a test
and not by review. A card order posted to the live API with **no payment token at
all** came back `"paymentDisplay": "Paid online"`, and the order row was written as
paid. Nothing had been charged.

`StripePaymentGateway.AuthorizePaymentAsync` was the cause. Its comment said the
server "verifies it with Stripe rather than trusting the client's word", but the
code never used the client's PaymentIntent id — it **created a new one** and returned
`Success = true` unconditionally. The new intent was uncaptured, so no money moved,
and because Stripe returned it happily the app saw nothing wrong. `PaymentMethodId`
was assigned by `OrderService` and then never read by anything.

Four things now guard it, each pinned by a test that fails without the fix
(`StripePaymentVerificationTests`):

1. A card authorization with no PaymentIntent id is refused outright.
2. The intent is **retrieved**, not created — no new intent can be minted here.
3. Only `succeeded` or `requires_capture` counts as paid; anything else is reported
   with the reason the customer needs (`requires_action`, a decline, still processing).
4. The intent's amount must equal the order's own server-computed total, so a client
   cannot confirm a cheaper amount and have the order recorded at the full price.

**Verified in production, 2026-09-25.** A scheduled pickup at 3am Adelaide (sent with
its UTC offset) is refused:

```
POST /api/orders  {"pickupTime":{"type":"SCHEDULED","scheduledTime":"2026-09-26T03:00:00+09:30"}}
HTTP 409  {"error":"kitchen_closed","message":"The kitchen opens at 10:00."}
```

That probe also found a real bug, which is why it was worth running: the pickup type was
read TWO ways. The trading rule compared it exactly (`== "SCHEDULED"`) while the order
write treated anything that was not ASAP as scheduled — so a client sending `scheduled`
in lowercase had its order STORED as scheduled and JUDGED as immediate, and an
out-of-hours pickup was accepted. Both call sites now use one helper, `PickupTime`, with
13 tests.

**The probes left several orders behind**, all synthetic and untouched, all in
production, all `Pending` on the kitchen board. Cancel them from the admin dashboard:

| Order number | orderId | Why it exists | What it returned |
|---|---|---|---|
| `AT-251703-5CFF` | 17 | the probe, before the fix | `"Paid online"` with nothing charged |
| `AT-251709-74F7` | 18 | the same probe, after the fix | `"Payment failed — please try again"` (correct) |
| one earlier probe | 16 | the probe, before the fix | same defect as order 17 |
| `AT-251841-05E7` | 19 | verifying the closed-kitchen rule | "Payment failed" (correct) |
| `AT-251841-B8AB` | 20 | a scheduled pickup sent without a UTC offset | accepted as lunchtime, correctly — see below |

Order 20 is a lesson rather than a defect: the probe sent `03:00` with **no timezone**,
which the API reads as UTC = 12:30pm Adelaide — inside opening hours, so it was accepted.
Sending the offset (`+09:30`) is what made it a 3am order and correctly refused. The
`ScheduledTime` field now documents that it must carry an offset.

Order 18 is worth keeping a moment as the after-the-fact evidence that the fix works
in production. None of these is a real customer order: the customer names are
"Probe Test" and "Probe Fixed", and the email addresses are not real. Delete or
cancel them; order 18 shows a failed payment rather than a paid one, which is the
whole point.

### 13.3 The storefront offers only what the shop can serve

Delivery was shown with a "subject to availability" caveat and could never complete a
checkout — a customer built a basket, chose delivery, reached payment and was told to
switch to pickup. `ServiceId` is now `'pickup'`, that panel is gone, and `ServiceBar`
states the service instead of offering three answers of which two were dead ends.
Uber Eats is a footer link, where leaving this site is what a customer expects.

**To bring delivery back:** add an entry to `SERVICES` in
`src/asian-taste-customer/src/lib/services.ts` and its icon to `ICONS` in
`ServiceBar.tsx`, then give the order a delivery fee field (the API has none, which
is why no fee is charged online, and why the charged total currently equals the
subtotal).

### 13.4 What came out of the repository

Deleted because nothing could reach it, verified by grep across both front-ends,
the tests and the scripts:

| Removed | Why |
|---|---|
| `StripeController` (`/api/stripe/config`, `/status`) | No caller |
| `AdminReportsController`, `/admin/orders/stats/daily` and `DailyStatsDto` | No caller; the old Reports page was removed with the UI rebuild |
| `AdminSyncController` | Belonged to the retired POS sync |
| `AdminSettingsController` (`/api/admin/settings`) | No caller — the settings it edits are served by the seed and read by the order flow |
| `CreateOrderRequestDto.cs`, `OrderItemResponseDto` | Zero references; superseded by the checkout DTOs |
| `Order.SquarePaymentId`, `Order.SquareOrderId`, `ThirdPartyReference`, `LightspeedSentAt` | Legacy columns nothing writes or reads; the database columns stay |
| The **Lightspeed scaffold** — services, `OrderSyncBackgroundService`, webhook service, `OAuthController`, token entity/repository, `/api/dev/lightspeed/*`, `/health/pos`, its HttpClient and config block, and the POS push in `OrderService` | Deferred and doing nothing; it occupied the DI graph, two health checks and the deploy script |
| The **saved-cards read side** (`GetPaymentMethodsAsync`, `PaymentMethods`, the Account page panel) | Nothing ever wrote a row, so it could only ever say "none" — a promise the app could not keep |
| Customer app: `register`/`login`/`createFromOrder`/`validateToken` and the uncalled `paymentApi`/`menuApi` methods | Defined, never called; several had no API route at all. **They read as features that exist** |
| `StatesShowcase` and its `/states` route | Reachable only by typing the URL; no navigation led to it |
| `hi.md` | Contained a fragment of a live Neon database credential, untracked but not gitignored (§13.5) |

**Kept deliberately:** the Lightspeed migration files and the database tables (a
shipped migration cannot be un-applied, and dropping the tables would break the
data that is already there), `customer_payment_methods`, the menu management page,
`Reports` as future work, and every `admin/*` endpoint the dashboard actually calls.

`.test-baseline` dropped 197 → 170 in the same change. Three test files were retired
with their subjects (`OrderSyncRetryTests`, `LightspeedOrderPayloadTests`,
`AdminSettingsControllerTests`), and the POS half of the payment test file went with
the POS code. The same change added coverage for the order flow itself — column
mapping, the payment state, the pickup estimate, modifier mapping and the local day
boundary — and the reasons are written into `.test-baseline`.

### 13.5 One thing you should do, not me

`hi.md` at the repository root contained a fragment of a real Neon database
password. It was **never committed** (`git log --all` confirms), and it has been
deleted — but `docs/SECRET-AUDIT.md` records that the same credential is already
recoverable from git history via another file. **Rotate that password in the Neon
console.** Nothing in this change can do that for you, and until it is rotated the
production database password should be treated as public.

