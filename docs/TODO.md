# Your todo

Everything I could do without you is done. This is what's left, ordered so that
each item unblocks the next. Every item says what I need from you, or which
decision I've made for now and how to change it.

**Where things stand:** the API, database and customer site are live and working.
Payment and POS are wired and tested, waiting only for credentials.

---

## 1. Fly billing — the app currently stops every 5 minutes

**Why it matters:** your Fly account is on the free trial, which stops machines
after 5 minutes. The app auto-starts on request, so it works with an 8-second
cold start each time. Fly Doctor reports this as a port fault and blames the app
— it isn't; the app binds `http://[::]:8080` correctly.

**What I need from you:** a credit card on the Fly account.
**Cost:** ~$2–3/month.
**How to tell it's fixed:** `fly status -a asian-taste-api` shows `started` and
stays that way.

---

## 2. Rotate the Neon password

**Why it matters:** it was pasted into a chat, so treat it as disclosed.

**What I need from you:** run these, replacing the password with the new one:

```bash
source .secrets.local          # after putting the new string in that file
fly secrets set "ConnectionStrings__DefaultConnection=$NEON_CONNECTION_STRING"
```

Then confirm: `curl https://asian-taste-api.fly.dev/health/db`

---

## 3. Stripe — make payment real

The code is written, tested and deployed. It's waiting on keys.

**What I need from you** (Stripe dashboard → Developers → API keys):

| Value | Where it goes |
|---|---|
| `sk_test_...` or `sk_live_...` | `Stripe__SecretKey` on Fly |
| `pk_test_...` or `pk_live_...` | `VITE_STRIPE_PUBLISHABLE_KEY` on Vercel |
| `whsec_...` | `Stripe__WebhookSecret` on Fly |

```bash
fly secrets set Stripe__SecretKey="sk_..." Stripe__WebhookSecret="whsec_..."
```

**Webhook endpoint** — this one is easy to get wrong and fails silently:

```
https://asian-taste-api.fly.dev/api/webhook/stripe
```

Note **`webhook`** (singular). My own docs said `webhooks`; that returns 404,
nothing arrives, and no error is raised anywhere. Subscribe to exactly four
events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`, `charge.refunded`.

**Before real customers:** set `Payment__UseMockGateway=false`. While it's `true`
the API approves payments without contacting Stripe — right now that means orders
are accepted unpaid.

---

## 4. Lightspeed POS

Also written, tested and deployed; waiting on credentials.

**What I need from you:** register an app at
<https://developers.lightspeedhq.com> (Lightspeed Retail or Restaurant). You'll
get a Client ID and Client Secret.

Set the redirect URI **exactly** to:

```
https://asian-taste-api.fly.dev/api/oauth/callback
```

Then:

```bash
fly secrets set \
  Lightspeed__ClientId="..." \
  Lightspeed__ClientSecret="..." \
  Lightspeed__RedirectUri="https://asian-taste-api.fly.dev/api/oauth/callback"
```

**Then authorise once — I can't do this for you,** because it needs a human to
approve access in a browser:

```
https://asian-taste-api.fly.dev/api/oauth/authorize
```

Open that, approve, and the callback stores the tokens encrypted. Check with
`/api/oauth/status`.

**What I need to ask the owner:** which Lightspeed product is it? Retail and
Restaurant have different order APIs, and the account ID differs. Also worth
confirming *whether* they want POS sync at all — if the admin dashboard is how
the kitchen works, this is optional.

**Note:** orders currently queue for POS retry and give up after the configured
max attempts, marking `lightspeed_sync_status = Failed`. That's working as
designed, not a bug — but it means once credentials go in, check an existing
failed order is not silently skipped. You can requeue them from the admin
dashboard, or I can add a bulk requeue if useful.

---

## 5. Decisions I made for you

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

---

## 6. Things I found but did not fix

Ordered by how much they'd bite.

1. **The admin API is complete; the admin UI is not.** `GET /api/admin/orders`
   supports status and date filters with pagination, and there's no
   search-by-order-number — check with the owner whether they'll want that once
   there's real volume. The bigger gap is that the admin app is not deployed at
   all (item 5), so nobody can reach any of it yet.
2. **Refunds can be issued via the API but not the UI.** `POST
   /api/payments/{paymentId}/refund` exists and works (full or partial), but
   nothing in the admin app calls it — I grepped and the only match is a test.
   So someone must refund from the Stripe dashboard. Also note that endpoint
   carries a `// TODO: Update order with refund status`, so a refunded order may
   not reflect it locally. Worth finishing before the first refund request.
3. **No automated database backups.** Neon's free tier has none. Either upgrade
   or schedule a `pg_dump` to somewhere else.
4. ~~Modifiers do not reach the POS.~~ **Fixed, along with something worse.**
   Chasing this found that `GetOrderByIdAsync` never loaded `Items` at all, so
   *every* POS order was sent with `lines: []` — an order with no dishes on it,
   for a customer who had just paid. Two further faults sat behind it:
   `GetOrderItemsAsync` used `SELECT *` against snake_case columns, so item names
   came back empty and prices 0 (the row count was right, which is why it looked
   fine), and the payload omitted modifiers entirely.

   All three are fixed and verified against a real order carrying modifiers:
   the line now reads `Cold rolls (serve of 4) x1 @ 10.00` with three modifiers,
   the unit price including the +$1.50 adjustment, and the live order detail
   returns its line items. 8 unit tests pin the payload contract.

   **What remains here:** the POS has never been exercised against a real
   Lightspeed account, so the payload shape is unverified against their API — the
   `product`, `description` and `note` fields are my reading of their docs. Worth
   a careful first test order once credentials exist.
5. **`SavePaymentMethod` is accepted and silently ignored.** It's declared in
   `CheckoutDto` and sent by the checkout, but nothing in the API reads it — I
   grepped and it appears only in that DTO. A customer who ticks "save my card"
   gets no saved card and no message. Either implement it or remove the checkbox.
6. **Vercel Hobby is non-commercial.** A restaurant taking orders is commercial
   use. Move to Pro (~$20/mo) or Cloudflare Pages (free, commercial allowed).
7. **No rate limit on order creation beyond the global one** (100 req/min). Fine
   now; revisit if it's ever abused.

---

## 7. Questions I need answered eventually

Not blocking, but they change what I'd build:

- **How does the kitchen actually see orders?** A tablet running the admin app,
  the Lightspeed screen, or printed tickets? This decides whether POS sync is
  essential or a nice-to-have, and whether the admin app needs a kitchen display.
- **Who owns the domain?** `asian-taste.vercel.app` style URLs are fine to start,
  but a real domain (`asiantaste.com.au`) is wanted before customers see it.
- **Are there existing menu photos?** The menu currently renders without images
  by design (the only files in the repo are photos of a printed menu board, which
  would mislead customers). Real dish photography is the single biggest visual
  improvement available.
- **Is the printed menu the source of truth for prices?** The seed has 82 items
  at the prices in `Menu.md`. If the board differs, the board wins and the seed
  needs updating.

---

## Verifying anything

```bash
./scripts/check-deployment-health.sh    # is production working? (7 checks)
dotnet test                             # 85 tests
fly logs -a asian-taste-api             # what the API is doing
```

`docs/ARCHITECTURE.md` explains how all the pieces fit together.
