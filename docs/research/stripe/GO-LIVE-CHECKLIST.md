# Stripe: test → live, tested properly

Written 2026-09-16. The goal is to prove real money moves **for about 50¢**, and
to avoid the one failure that charges a customer while the kitchen never sees the
order.

## The failure that actually bites

Test-mode and live-mode webhook endpoints have **different signing secrets**. If
the `whsec_` on Fly belongs to the test endpoint, then when live keys go in:

- the customer **is charged**,
- the order **stays `Pending`**,
- the kitchen **never sees it**,
- and **nothing raises an error**.

Every other mistake is loud. This one is silent, and it costs a customer. So it
gets tested first, in isolation, before any real order.

## Before you start

Item 2 in `docs/TODO.md` must be done: **turn off Klarna, Zip and Link, turn on
Google Pay.** With `automatic_payment_methods` now in use, anything enabled in the
Stripe dashboard appears at checkout with **no code change and no review**. Going
live with Klarna on means a customer can pay in a way the till cannot reconcile.

## Step 1 — prove the webhook before taking real money

Do this with test keys first, so a mistake costs nothing.

1. Create the live webhook endpoint at
   `https://asian-taste-api.fly.dev/api/webhook/stripe` with the four events.
2. **Set the three secrets together.** Setting one without the others breaks
   payments in a way that looks like a bug in the app:
   ```bash
   fly secrets set \
     Stripe__SecretKey="sk_live_..." \
     Stripe__WebhookSecret="whsec_..."     # the LIVE endpoint's secret
   ```
3. Confirm the mode actually took:
   ```bash
   fly logs -a asian-taste-api | grep STRIPE
   ```
   You want `ENABLED (live keys)`. **`IN TEST MODE` means the secret did not take**
   — usually a typo or the wrong endpoint's secret.
4. **Check the webhook secret belongs to the live endpoint.** Stripe dashboard →
   Webhooks → the live endpoint → recent deliveries. Send a test event and confirm
   it arrives **and is not rejected**. A `400` here is the signature mismatch.

## Step 2 — the one real order, then refund it

This is the only step that costs money, and it is worth paying about **50¢** to
know the path works end to end rather than guessing.

Place **one** real order with your own card, on a **pickup** order (v1 does not
take delivery), for the cheapest dish — about $8.50. Then check, in this order:

| Check | How | What it proves |
|---|---|---|
| Money moved | Stripe dashboard → Payments, live mode | The charge is real |
| The order exists | Admin dashboard → Orders | The order was created |
| It is prepaid | Order shows paid, not `Pending` | **The webhook landed** — this is the step-1 failure |
| Customer got a receipt | The email you used | The email path works |
| The kitchen can see it | Admin dashboard on the restaurant's device | The tablet view is the kitchen's view |

**Then refund it** from the Stripe dashboard (~50¢, no fee on a refunded charge).

If the order shows `Pending` while Stripe shows a successful payment, stop: that
is the webhook-secret mismatch, and no customer should be allowed through until it
is fixed.

## Step 3 — the publishable key must match

A mismatch between `pk_live_` and `sk_live_` breaks checkout **silently** — the
form renders and then fails.

- On Vercel, set `VITE_STRIPE_PUBLISHABLE_KEY` to `pk_live_...` **and redeploy**.
  Vite inlines it at build time, so changing the value alone does nothing.
- Prove it landed, rather than assuming:
  ```bash
  curl -s https://asian-taste-customer.vercel.app/ \
    | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 \
    | xargs -I{} curl -s https://asian-taste-customer.vercel.app{} \
    | grep -c 'pk_live_'
  ```
  Zero means the key was missing at build time.

## What this costs

| Item | Cost |
|---|---|
| Having test keys | $0 |
| Activating the Stripe account | $0 |
| Creating live keys and a webhook | $0 |
| **One real $8.50 order, refunded** | **~50¢** |
| Ongoing | 2.2% + 30¢ per real transaction |

## What cannot be automated, and must be done by hand

- **Apple Pay**: Safari, an Apple device, a card in Wallet, over HTTPS. Not
  testable in Chrome, on localhost, or by any script here.
- **Google Pay**: works in Chrome, but needs a real card to complete.
- Creating the live keys and the live webhook endpoint — that needs the Stripe
  dashboard login.

## Rollback

If live payments misbehave, the switch is only three secret values. Put the test
values back and redeploy Vercel with `pk_test_`; the code has no branching on live
versus test, so there is nothing else to undo.
