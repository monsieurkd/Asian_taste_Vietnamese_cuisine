
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

On 2026-10-01 the kitchen gained its own unit of work. **§17 is the record.** A
ticket now carries its dishes and a cook ticks each one off as it leaves the pass;
when the LAST dish on an order is ticked the order finishes itself and the customer
is emailed "ready to collect" — once, and verified live. There is also a counter
screen for face-to-face orders, with a compact tap-to-add dish grid. Four defects
in that work shipped green and were found by running it against a real database;
§17 lists all four, because they are the same kind of bug this repo keeps hitting.

Five items from §9 were closed on 2026-09-20 without needing you (refund
recording, order-number search, the silently-ignored `SavePaymentMethod`, order
rate limiting, and a backup script). What that work left open is in §9's
**"Decisions this work needs from you"** table — six items now, none urgent. D5
(SMS for the ready message) and D6 (taking card payment on the counter tablet) are
new in §17.

**What needs you, in this order. The first three are mine to have left behind, so
they come first — everything after them is a decision rather than a cleanup.**

| # | Item | Effort | Why it matters |
|---|---|---|---|
| **T1** | **Rotate the Neon database password** | ~5 min | A fragment of the live password was sitting in an untracked file at the repo root (`hi.md`). It was never committed and the file is deleted — but `docs/SECRET-AUDIT.md` records the same credential as recoverable from git history. **Until it is rotated, treat the production database password as public.** Neon console → your project → Roles → reset password → update the Fly secret. Nothing in the app can do this for you. |
| **T2** | **Cancel the probe orders on the kitchen board** | ~2 min | Six synthetic orders from testing the payment and hours rules are sitting as live tickets. Names are "Probe Test", "Probe Fixed" and "P". Cancel them from the admin dashboard: **orderIds 16, 17, 18, 19, 20, 21** — the order numbers are in §13.2b. They are not customer orders and nobody will collect them. |
| **T3** | **Confirm the new hours are right** | ~1 min | I corrected the trading hours to what §10 says you published, and the app now REFUSES orders outside them. **If a refusal is ever wrong, tell me** — the rule is deliberately strict, so a wrong hour costs an order rather than sending food out at 3am. Current: Mon 10–2:30, Tue–Sun 10–4 and 4:30–9. See §15. |
| **2** | Turn off Klarna, Zip and Link; turn on Google Pay | ~2 min in Stripe | **They would be offered to customers today.** Anything switched on in the dashboard appears at checkout with no review |
| **3** | Buy a domain (cheap path in §3) | ~$15/yr | The only thing between you and Apple Pay. A `*.vercel.app` host cannot be registered |
| **4** | Switch Stripe to live, using the checklist | ~15 min + ~50¢ | Prove it works with one real order, then refund it |
| **6** | Decide admin-dashboard exposure | a decision | It is a public URL with a login page |
| **12** | Try Paseo from your phone | ~5 min | Free; your laptop is the sandbox |
| **D1–D3, D5–D6** | Five decisions in §9 | a decision each | Backups, the order rate limit, refunds in the UI, SMS for the ready message, and card payment on the counter tablet. All have a working default, so nothing is blocked. **D4 (saved cards) was settled: removed** — see §13 |

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

> **Re-verified 2026-09-30, after two sessions of changes to the payment path.** A card
> order sent to production with a deliberately bogus Stripe token comes back
> `"Payment failed — please try again"` rather than `"Paid online"`. That proves the
> real gateway is running and that a fake token cannot buy food. Order `AT-301829-D396`.
>
> Both guards are still in place: `appsettings.json` defaults `UseMockGateway` to
> **false**, and `Program.cs` refuses to start a non-Development environment with it
> on. See §13.2b for the *other* payment defect found later (a real gateway that
> reported success without charging) — same symptom, different cause.

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
| ~~POS failure handling~~ | **Retired 2026-09-25** — the Lightspeed code is gone, tables kept | It was deferred and did nothing; the order flow no longer has a POS hook | Item 7 says how to bring it back |
| **Cash orders** | No gateway call, `Pay on pickup` | Nothing to charge at order time | — |
| **GST** | Prices include it; total = subtotal | Australian convention, matches the printed menu | — |
| **Pickup estimate** | From restaurant settings (15 min default) | Was hardcoded to 20 min in one place and 15 in another, so two screens promised different times | The setting is in `restaurant_settings`; both paths now read it |
| **Kitchen's order view** | A tablet running the admin dashboard, alongside Uber Eats | Your call — it is deployed and working | Point the tablet's browser at the admin URL |
| **Cash / pay-in-store** | Recorded in this app as `Pay at counter`; reconciled at the till | No POS integration, so nothing else can record it | — |
| **Custom domain** | Not now | Your call — customers here don't mind | Point DNS at Vercel when wanted |
| **Hosting the frontend** | Staying on Vercel for now | Your call — keeping it simple | Cloudflare Pages is the alternative (free, commercial use allowed) |
| ~~Editing the menu~~ | **Built 2026-09-25** — name, price, section, heat, description | Was the owner's own next ask | §14 item 4; the seed is still the source for a fresh database |
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

**Most of this list is now DONE.** It was written on 2026-09-20 and three later sessions
built through it — so read the items rather than the heading. What is genuinely still
open is marked **OPEN**; everything else says when it was closed and where. Six things
still need a decision from you, in the table at the end of this section (D5 and D6 are
new in §17).

1. ~~Deploy the admin app.~~ Done — it is live and verified. What remains is the
   exposure decision, in item 6.
2. ~~Refund recording.~~ **Done.** `POST /api/payments/{paymentId}/refund` works
   and now marks the order. The `charge.refunded` webhook — the authoritative path,
   since refunds actually happen in the Stripe dashboard — did the same thing: it
   logged the refund and changed nothing, so a refunded order kept reading as paid
   and the day's takings stayed overstated. Both now set `Refunded` or
   `PartiallyRefunded`.
   - **Found while fixing it:** `external_payment_id` is now written (from the captured
     charge) and the refund endpoint resolves the order by `payment_intent_id` first,
     then falls back — because `payment_intent_id` is what the checkout writes and what
     every webhook resolves against. Getting this wrong is quiet: the refund succeeds at
     Stripe while the order keeps reading as paid.
   - ~~Still missing: refunds via the UI.~~ **Built 2026-09-25** — a Refund button on
     the ticket, with a confirmation naming the amount, the customer and the order
     number. Full refunds only; a partial is a negotiation and the Stripe dashboard is
     the right place for it. D3 below is therefore settled.
3. ~~Automated database backups.~~ **Partly done.** `scripts/backup-db.sh` takes a
   verified, restorable dump — it writes through a `.partial` name, checks the
   archive reads back with `pg_restore --list`, and confirms the four tables that
   matter are in it. It falls back to the postgres Docker image when `pg_dump` is
   not installed, and prefers the unpooled Neon URL because `pg_dump` fails against
   PgBouncer.
   - **needs you:** nothing runs it on a schedule. See the decision below.
4. ~~Menu editing in the admin app.~~ **Done 2026-09-25.** You can change a dish's
   name, price, section, heat level and description from the menu screen, and mark a
   dish unavailable in one press. It was worse than "deferred": **every write endpoint
   was a stub** — it logged, returned `204` and changed nothing, so the "sold out"
   switch flipped in the UI while the dish stayed on sale. See §14 item 4.
   - **Still OPEN: adding and deleting a dish.** Hiding one covers the service-time
     need and is reversible; creating or removing one is a separate screen (an image,
     a section, and the printed-menu decision that it belongs there).
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
10. **OPEN — Reports and analysis.** The owner wants this later, for looking at trends
    rather than day-to-day. The old admin Reports page was removed with the UI rebuild
    because it showed mock numbers; a real one needs a reporting endpoint behind it.
    The `AdminReportsController` was deleted as dead code on 2026-09-25 (nothing called
    it), so this is a fresh build rather than a re-wire. Far down the line, deliberately.
11. ~~Menu editing~~ — duplicate of item 4, and done. (It was listed twice; the
    second entry is removed rather than left to look like unfinished work.)
12. **OPEN — The delivery pipeline.** Resolved in the other direction on 2026-09-25:
    the storefront now offers **pickup only**, because a delivery option that cannot
    complete a checkout is a promise the shop cannot keep. Uber Eats stays a link in
    the footer. To bring delivery back: add an entry to `SERVICES` in
    `src/asian-taste-customer/src/lib/services.ts`, give the order a delivery-fee field
    (the API has none), and decide who fulfils it. See §13.3.

### Decisions this work needs from you

| # | Decision | Why it needs you | Where it stands |
|---|---|---|---|
| **D1** | **Where database backups live, and whether to schedule them** — **STILL OPEN** | A backup on the same machine as the thing it protects is not a backup. Options: a Neon paid tier (real point-in-time restore), a scheduled job writing to object storage, or an external drive you run weekly | **Nothing runs on a schedule.** `scripts/backup-db.sh` is manual and verified; run it by hand until you decide. This is the most consequential one still open — right now a lost database is a lost database. |
| **D2** | **Order-creation rate limit: is 10/minute right?** — **STILL OPEN** | A business trade-off, not a technical one. Too low blocks a busy service; too high does not deter a script | 10/minute per IP, global 100/minute unchanged. Review once there is real traffic. |
| ~~D3~~ | ~~Refunds: build the admin button?~~ | — | **Settled 2026-09-25: built.** Full refunds from the ticket. Partial refunds stay in the Stripe dashboard on purpose. |
| ~~D4~~ | ~~Saved cards: finish it or leave it removed?~~ | — | **Settled 2026-09-25: removed.** The read side went too — nothing ever wrote a row to `customer_payment_methods`, so the Account page could only ever say "none". Finishing it means adding a SetupIntent write path, and the table is still there to build on. |
| **D5** | **SMS for "your order is ready" — add it?** — **STILL OPEN** | A customer who closed the tab is only reachable by email, and the ready message is the one they act on. Needs a provider (Twilio or similar), per-message credits, and one more secret to rotate | **Email only, built and verified in §17.** Deliberate: no new provider and no recurring cost for v1. The plumbing is one more `IEmailService`-shaped dependency if you want it. |
| **D6** | **Should a counter order take a card on the tablet?** — **STILL OPEN** | Right now staff use their own terminal and tick "Money taken", so the app records the sale but does not process it. Taking the payment in-app means a Stripe charge from the tablet, and the failure modes that come with it (a declined card with a customer watching, a refund path, a receipt) | **Not built, on purpose.** §17 decision 3: nothing on the counter screen can fail because Stripe is unreachable. |

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
| `AT-251846-DC69` | 21 | confirming an in-hours order still succeeds | accepted (correct) |

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

---

## 14. What the second session built, and what it did not — 2026-09-25

The manager's brief was four workstreams, all chosen by the owner. Three are done and
deployed; the fourth is half done and is recorded that way rather than rounded up.

### Built and live

| # | What | Why it mattered |
|---|---|---|
| 1 | **One-press kitchen board** | Moving an order meant opening it on another page and finding the status control — a navigation and a second decision for something the cook already knows. Each ticket now carries its own press, guarded by the same rule as the detail page. |
| 2 | **A closed kitchen refuses the order** | The storefront had shown "Closed" for a while and the API took the order anyway, because that notice was a courtesy rather than a control. Refused now at the API, before the order row, the charge and the email. |
| 3 | **Menu writes made real** | Every menu write endpoint was a stub: it logged, returned 204 and changed nothing. The console's "sold out" switch flipped in the UI while the dish stayed on sale. |
| 4 | **Menu editing** | The owner's own ask — change a price without a deploy. Sends only the fields he touched, so an unrelated edit cannot blank a description. |
| 5 | **Refunds from the ticket** | The endpoint worked and nothing called it, so a refund meant the Stripe dashboard and a copied payment id. |
| 6 | **Editing an order** | A phone change meant cancel-and-rebuild: refund, re-charge, and a second kitchen ticket for the same food. Now edited in place, in one transaction, re-priced from the menu. |

| 6 | **Edit an order** | A phone change meant cancel-and-rebuild: refund, re-charge, and a second kitchen ticket for the same food. Now edited in place, one transaction, re-priced from the menu. |
| 7 | **Allergies asked for and shown** | An allergy could only reach the kitchen if a customer typed it into a free-text note, because nothing asked and the seeded Allergy option group was unreachable. Now a field of its own, shown on the ticket and flagged on the board (§16). |

### Not built, deliberately

- **Adding a dish**, as opposed to hiding one. Creating a dish needs an image, a
  section and the printed-menu decision that it belongs there; that is a screen, not a
  field in an edit dialog. "Sold out" (hide/restore) covers the service-time need and is
  what the switch does.
- **Deleting a dish.** Removing something from the printed menu is a decision about the
  shop. Unavailable is reversible in one press; deleted is not.
- **Partial refunds.** The API supports them; the console offers full refunds only,
  because a partial is a negotiation about what went wrong and typing an amount into a
  kitchen screen invites a misplaced decimal point.

### Two bugs the production probes found

Both were found by probing the deployed API rather than by tests, which is the pattern
worth keeping:

1. **A card order with no payment token reported "Paid online"** having taken no money
   (§13.2b). Already fixed; the probe that confirmed the fix is the one in §13.2b.
2. **The pickup type was read two ways.** The trading rule compared it exactly
   (`== "SCHEDULED"`) while the order write treated anything not-ASAP as scheduled — so a
   client sending `scheduled` in lowercase had its order STORED as scheduled and JUDGED
   as immediate, and an out-of-hours pickup was accepted. Both call sites now use one
   helper, with 13 tests and an invariant: the instant that gets stored and the instant
   that gets judged are the same one.

The second is the same shape as everything else this session: one rule, encoded twice,
with the wrong encoding deciding. The fix is always to leave one.

### Verified in production

```
POST /api/orders  {"pickupTime":{"type":"SCHEDULED","scheduledTime":"2026-09-26T03:00:00+09:30"}}
HTTP 409  {"error":"kitchen_closed","message":"The kitchen opens at 10:00."}

POST /api/orders  {"pickupTime":{"type":"scheduled", ...same time...}}
HTTP 409  (the lowercase case that used to be accepted)

POST /api/orders  {"pickupTime":{"type":"ASAP"}}
HTTP 200  (in-hours orders are unaffected)
```

`scripts/check-deployment-health.sh` passes, and the six endpoints the cleanup removed
still return 404.

---

## 15. The three things at the top of this file, in detail — 2026-09-29

Recorded here because the table above is terse and each of these has a failure mode
worth understanding before doing it.

### T1 — Rotate the Neon password (do this first)

**What happened.** A file called `hi.md` sat untracked at the repository root containing
a fragment of the live Neon password. It was never committed — `git log --all -- hi.md`
finds nothing — and the file has been deleted.

**Why it still matters.** `docs/SECRET-AUDIT.md` (written 2026-09-21, before this
session) records that the same credential is already recoverable from git history
through a different file, `.secrets.local.example`. That was a finding about history,
not about working-tree files, and this session did not change it.

**What to do.**

1. Neon console → your project (`shy-cherry-02896954`) → Roles → reset the password.
2. Update the connection string everywhere it lives: the Fly secret
   (`fly secrets set ConnectionStrings__DefaultConnection="..."`), and your local
   `.secrets.local` / `.env.local`.
3. Verify: `curl -s https://asian-taste-api.fly.dev/health/db` should report healthy
   with 82 menu items. If it does not, the secret did not take effect.

**Do not paste the new password into any file in this repository**, including
`.secrets.local.example`, which is the template that leaked it originally.

### T2 — Cancel the six probe orders

These are synthetic orders created by deploying and probing the live API. They are real
rows in the production database and appear as live tickets on the kitchen board.

| orderId | Order number | Created by | What it proves |
|---|---|---|---|
| 16 | (earliest) | the payment probe | an uncharged card order claimed "Paid online" |
| 17 | `AT-251703-5CFF` | the payment probe, before the fix | same defect |
| 18 | `AT-251709-74F7` | the payment probe, after the fix | now correctly reads "Payment failed" |
| 19 | `AT-251841-05E7` | the closed-kitchen probe | an in-hours order still succeeds |
| 20 | `AT-251841-B8AB` | the hours probe without a UTC offset | read as lunchtime, correctly |
| 21 | `AT-251846-DC69` | the final verification | in-hours ordering unaffected |
| 23 | `AT-301801-934F` | the allergy path, end to end | the declaration reaches the order row |
| 24 | `AT-301829-D396` | re-verifying the payment gateway after all this work | a fake Stripe token is REJECTED — so the real gateway is running, not the mock |

All six are `Pending`, so they sit in the "New" column. Cancel them from the admin
dashboard (open each, use the status control). The customer names are "Probe Test",
"Probe Fixed" and "P", so they are easy to spot.

**Optional, and useful:** keep #18 until you have seen it. It is the order that shows
the payment fix working — a card order with no payment token, correctly reported as
unpaid rather than as a sale.

### T3 — Confirm the trading hours, because the app now enforces them

This is the one change in this session that can **refuse a customer's order**, which is
why it is worth a moment rather than an assumption.

Before this work the app showed "Closed" on the menu page and took the order anyway —
the notice was a courtesy, not a control. The API now refuses an order outside the
hours below, before any money moves.

| | |
|---|---|
| Monday | 10:00 – 14:30 (lunch only) |
| Tuesday – Sunday | 10:00 – 16:00, then 16:30 – 21:00 |

Two details:

- **The break is enforced.** An order at 16:15 is refused with "The kitchen opens at
  16:30." Before this change one open/close pair per day was stored, so the shop could
  be shown open in the dead hour between services.
- **A scheduled order is judged at the time it is WANTED**, not when it is placed. So
  ordering at 4pm for a 7pm pickup is fine, and ordering at 4pm for a 3am pickup is
  refused.

**If the app ever refuses an order you know is fine, that is a bug in these hours and I
want to hear about it** — a wrong hour costs a real order. The rule is deliberately
strict in the other direction: when it cannot read the hours at all it refuses rather
than assuming open, because the cost of guessing wrong is food going out at 3am.

---

## 16. Allergies — what changed, and the one thing it did not fix

### The dead end it started from

An `Allergy` option group was seeded into `modifier_groups` in migration 13, for the
dishes where it matters (Pho, Laksa, Pad Thai, the noodle dishes), with sensible choices
— "No peanuts", "No coriander". **It has never once been reachable.**

The customer app builds a dish's options from the printed-menu table in
`src/asian-taste-customer/src/lib/menuModel.ts`, and that table contains no allergy
group. The code that *would* read the database's groups exists (it is the first branch
of `optionsFor`) and is therefore dead. Confirmed against production: 82 dishes, and the
menu list endpoint returns **zero** modifier groups.

So an allergy could only reach the kitchen if a customer typed it into the free-text
order note — which most people do not, because nothing asks.

### What now happens

1. **Checkout asks directly**, above the free-text box, and says where the answer goes.
   Asking is the whole point: a box nobody is prompted to fill is a box that stays empty.
2. **It is stored in its own column** (`orders.allergy_declaration`, migration 15) as
   free text. Not a fixed list — an allergy list that cannot express the customer's
   actual allergy is worse than no list, and "sesame", "MSG" and "the fish sauce" are all
   real answers.
3. **The ticket shows it as its own block**, above the notes, in the red the console
   already uses for money not taken.
4. **The kitchen board flags it too.** This is the one that matters most: the board is
   where a cook decides what to start next, and an allergy they only see after opening
   the ticket is one they have already begun cooking without.

### The thing it did NOT fix

**The seeded option groups are still unreachable.** Wiring the API's `modifier_groups`
into the customer UI is a separate change with its own questions — pricing (the groups
carry surcharges the printed options also carry, and double-counting is a real risk),
and whether per-dish options should replace the printed ones or sit beside them.

Until that is done, a dish's options on the customer site remain the printed menu's,
which is deliberate and correct for v1. The allergy field above does not depend on it.

### If you want more here

The honest next step would be **per-dish allergy notes** rather than one order-level
field — "no peanuts on the Pad Thai" is more useful to a kitchen than "no peanuts". That
needs the option groups wired up, and a decision about whether the customer picks
allergies per dish or once per order. Worth asking the owner before building it.

## 17. The kitchen's dish-by-dish flow, and the counter screen — 2026-10-01

Built in one session, in six commits. This section records what exists, the four
decisions that were yours, and — more usefully — the four defects that a real database
found after every unit test passed.

### What now exists

| Piece | Where | What it does |
|---|---|---|
| Per-dish done marks | `order_items.is_completed` / `completed_at` (migration 16) | A cook ticks each dish off. Reversible, and unticking never moves an order backwards. |
| Finish-on-last-dish | `OrderService.SetItemCompletedAsync` | The last dish moves the order to Ready. Decided in one place, so no caller can bypass it. |
| "Your order is ready" email | `OrderEmailQueue` + `SendGridEmailService` | Sent AT MOST ONCE, claimed against `orders.ready_notified_at`. |
| Ticket dish list | `components/orders/OrderItems.tsx` | Each dish is a one-tap control, on the board, the Orders row (expandable) and the ticket page — one component, so the three cannot disagree. |
| Counter order API | `POST /api/admin/orders` | A staff-created walk-in order, priced from the current menu, no payment provider involved. |
| Counter screen | `CounterOrderPage.tsx`, `lib/counterTicket.ts` | Compact tap-to-add dish grid and a running ticket. |

Two things that had been dead code since the beginning are now live and were the whole
reason the "notify the customer" feature was cheap to build: `IEmailService.
SendOrderStatusUpdateAsync` existed with no caller, and `BroadcastStatusUpdateAsync`
existed with no caller either. The second one matters for a different reason — a status
set on one tablet now reaches the others immediately instead of waiting up to thirty
seconds for their poll.

### The four decisions the owner made

1. **The last dish finishes the order**, rather than prompting or waiting for a status
   press. One tap per dish, and the status follows from the ticks.
2. **Email only.** No SMS — that needs a new provider and a per-message cost. Recorded
   below as outstanding.
3. **The counter screen records money as taken, and takes no payment.** No Stripe charge
   from the tablet, so a counter order cannot fail because Stripe is unreachable.
4. **A walk-in gives a name, and nothing else.** Phone and email are optional and stored
   blank. No customer record is created, because `customers.email_normalized` is UNIQUE
   and the second anonymous walk-in of the day would collide with the first.

Two more the owner set directly: **staff-created orders bypass the trading-hours gate** (a
person with a tablet is proof the shop is open, and the gate would refuse a walk-in at
9:55pm — verified live: the public checkout returned 409 at the same hour the counter path
accepted), and the ticks were scoped to the kitchen board's ticket.

**That last one was corrected.** "The admin view" reasonably means the Orders table and
the ticket page, and on those screens the same order showed its dishes as plain text with
nothing to press — which reads as a broken feature rather than a scoped one. The list and
its tick are now one component (`components/orders/OrderItems.tsx`) used by all three
screens. The two deliberate differences that remain: the **board is optimistic** (a cook
presses it twice a second, and a round trip under the finger makes the pass feel broken)
while the **Orders list is not** (used one-handed mid-phone-call, where a row that changes
before the server agrees is worse than half a second of latency); and the board's list is
always open while the table's is one press away.

### The four defects a real database found

Every one of these shipped green — 266 unit tests passing, build clean, lint clean. All
four were found by starting the API against a real Postgres and calling the endpoints.
They are recorded because they are all the same KIND of bug: SQL that reads correctly and
behaves silently wrong, which is what this repo has been bitten by before.

1. **`COUNT(*)::int FILTER (WHERE ...)` is a syntax error** (SQLSTATE 42601). `FILTER`
   attaches to the aggregate call, so the cast has to come after it. The entire admin
   order list returned HTTP 500 — the kitchen board was an error page.
2. **`includeItems` added as a bare C# bool was sent as TEXT.** The `CASE WHEN @IncludeItems`
   took the false branch every time, so every ticket came back with no lines *while still
   answering 200*. The board would have rendered tickets with nothing to cook, which reads
   as "this order has no items" rather than as a broken flag. Fixed with `DbType.Boolean`.
3. **An unqualified `id` inside the correlated subquery resolved to the inner table's id.**
   `WHERE tally.order_id = id` compared a line's order to the line's own id — always false,
   so every ticket read "0 of 0" with real orders that had lines. Fixed by aliasing
   `orders o` and qualifying every reference, including the filter conditions built in C#.
4. **`string_agg(col, '' ...)` inside a C# verbatim string is not a delimiter.** Postgres
   saw a stray quote and rejected the query (42883).

A fifth, caught while writing the tests rather than by running them: an intermediate
version claimed `ready_notified_at` twice per finish, which would have marked an order
announced and then skipped the send — ready food, and a customer never told.

Guards for all of these now live in `tests/AsianTaste.API.Tests/Data/
OrderQueryColumnMappingTests.cs`, which is where this repo already keeps its "the SQL
reads fine and does the wrong thing" checks. The suite is at **271** (floor moved with it
in the same commit).

### What was verified, and how

Not just tests — the whole flow was exercised against a live Postgres and a running API:

- a counter order was created and came back `Confirmed`, priced 23.00, `paid: true`
- its board ticket returned both dishes with `itemsDone: {done: 0, total: 2}`
- ticking the first dish returned `doneLines: 1, orderMarkedReady: false`
- ticking the LAST returned `orderMarkedReady: true` and the order was `Ready` in the
  database
- with an email address on the order, `customerNotified: true`, and the queued email read
  *"Order AT-020818-DF9C is ready to collect"* with the collection address
- unticking left the Ready order Ready (`orderMarkedReady: false`, no backward move)
- finishing a second time reported `customerNotified: false` — the once-only claim held
- an unpaid counter order was recorded `payment_status: Pending` with no `paid_amount`
- the public checkout returned 409 "The kitchen opens at 10:00" while a counter order at
  the same hour succeeded

Probe orders 30 and 31 were deleted afterwards.

### Deliberately NOT built

- **SMS.** Decision 2 above. A customer who closed the tab is only reachable by email.
- **Counter payment through Stripe.** Decision 3. Staff use their own terminal and tick
  "Money taken".
- **Table numbers as data.** `CreateCounterOrderDto.TableNumber` is free text folded into
  the kitchen note. There is no table layout and no foreign key, because an unused key is
  a promise the app does not keep.
- **Partial refunds from the console.** Unchanged — still Stripe-dashboard only.
- **Kitchen display units / printed dockets per station.** The board is one screen.

### Worth knowing before you change this

- **`orders.status` is still the source of truth for "how far along is this order".** The
  dish marks are progress *within* an order, not a second status. Nothing outside the
  board reads them, and unticking a dish on a Ready order changes nothing about the order.
- **`ready_notified_at` is claimed, never cleared.** A failed send leaves the order marked
  announced, because the column records "the kitchen finished this and someone was told" —
  a failed email is a log entry, not a reason to re-announce on the next tick of an
  unrelated dish. If a send fails, the order is in the log and the customer needs a phone
  call. Making that retryable is a real change, not a tweak.
- **A counter order has no `customers` row.** Anything that assumes every order has a
  customer id will miss counter orders — the name lives on the order itself.
- **Most orders in the development database have NO items at all.** 23 of the 25 rows in
  `orders` were seeded straight into that table by older scripts without their
  `order_items`, so their tickets have nothing to cook. This is a data condition, not a
  bug — check `select count(*) from order_items where order_id = N` before believing the
  dish list is broken. The board now says "This order has no items recorded." instead of
  rendering nothing, precisely so the two cases are distinguishable.
- **The counter screen prices locally and sends no price.** If you ever add a field to
  `toRequest`, check it is not money: the whole guarantee is that the server re-prices from
  the current menu.
