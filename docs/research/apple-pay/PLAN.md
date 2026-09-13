# Apple Pay integration plan

Status: **researched, not implemented.** Written 2026-09-13.

## The headline

**Apple Pay needs no new integration code.** The checkout already uses Stripe's
`PaymentElement`, and Apple Pay is a *wallet that sits on top of card* — Stripe
renders the Apple Pay button automatically when three conditions hold:

1. The customer's device supports it (Safari on Mac/iOS with a card in Wallet).
2. The **domain is registered** with Stripe for payment-method domains.
3. The PaymentIntent allows wallets (see the blocker below).

So the work is configuration, not development. What follows is the exact list.

## Two blockers, both real

### Blocker 1: the domain must be registered (and `vercel.app` won't work)

Apple requires proof that the site asking for a wallet payment owns its domain.
Stripe handles the merchant-validation handshake, but **you must register each
domain** — top-level *and* subdomain. `asian-taste-customer.vercel.app` is a
Vercel-owned domain we do not control, so it cannot be registered.

**This makes the custom domain a prerequisite, not a nice-to-have.** The domain
work was deferred earlier; Apple Pay is the reason to revisit it.

Registration is one API call per domain:

```bash
curl https://api.stripe.com/v1/payment_method_domains \
  -u "$STRIPE_SECRET_KEY:" \
  -d domain_name=asiantaste.com.au
```

Then verify the result — a domain can exist while the wallet is still inactive:

```bash
curl https://api.stripe.com/v1/payment_method_domains \
  -u "$STRIPE_SECRET_KEY:"
```

Look for `"apple_pay": {"status": "active"}`. Anything else means the domain is
registered but not usable yet, and the button will not appear. This is the state
that generates the "I registered the domain and it still doesn't work" reports.

**Register in both test and live mode.** They are separate registrations; a
test-mode domain does nothing for live payments.

### Blocker 2: the PaymentIntent forbids wallets

`StripePaymentGateway.cs` creates intents with a hard allow-list:

```csharp
PaymentMethodTypes = new List<string> { "card" },
```

Apple Pay is a wallet on top of card, so restricting the intent to `card` means
Stripe will not offer it. The fix is `automatic_payment_methods`:

```csharp
AutomaticPaymentMethods = new PaymentIntentAutomaticPaymentMethodsOptions
{
    Enabled = true,
},
```

**Verified: this appears exactly twice** — line 73 and line 209. They are not
duplicates, they are different flows:

| Line | Capture | Used for |
|---|---|---|
| 73 | `CaptureMethod = "automatic"` | Pickup/delivery — charge immediately |
| 209 | `CaptureMethod = "manual"`, `SetupFutureUsage = "off_session"` | Dine-in — authorise now, capture later |

Both need changing, and the difference matters when testing: an Apple Pay payment
on the dine-in path authorises without charging, so a Stripe dashboard check for
"did money move" will look wrong if you tested the wrong path.
`automatic_payment_methods` and `payment_method_types` are mutually exclusive;
sending both is an error.

**Side effect worth knowing:** enabling automatic methods turns on every method
enabled in your Stripe dashboard, not just Apple Pay. Enable Apple Pay and Google
Pay, and leave everything else off, or customers will see payment options the
restaurant cannot reconcile.

## What to change

| # | Change | Where | Blocked by |
|---|---|---|---|
| 1 | Point a real domain at the customer app | DNS + Vercel | Buying the domain |
| 2 | Register the domain for payment-method domains, test + live | Stripe API | #1 |
| 3 | Confirm `apple_pay.status == "active"` | Stripe API | #2 |
| 4 | Replace `PaymentMethodTypes` with `AutomaticPaymentMethods` | `StripePaymentGateway.cs` ×2 | Nothing |
| 5 | Enable Apple Pay + Google Pay, disable the rest | Stripe dashboard | Nothing |
| 6 | Add `VITE_STRIPE_PUBLISHABLE_KEY` for the new domain's deployment | Vercel | #1 |
| 7 | Test on a real Apple device in Safari | manual | #1–#6 |

Changes **4 and 5 need no domain and can be done now**, so the integration is
ready the moment a domain exists.

## Testing: the part that catches people out

Apple Pay **cannot** be tested in Chrome, on Windows, on Firefox, or against
`localhost`. It requires Safari on an Apple device with a card in Wallet, over
HTTPS. Stripe's own docs list Apple Pay as supported only in Safari (plus other
Chromium browsers on desktop *only* when explicitly forced to always show).

Practical consequences for this project:

- Local development cannot exercise it at all. A tunnel (`ngrok`) plus a
  registered tunnel hostname is the usual workaround, but the hostname changes
  every restart so it is a poor fit for repeated testing.
- The existing headless-browser checks (`scripts/`, the UI quality loop) **cannot
  detect Apple Pay regressions**. They run headless Chrome, where the wallet never
  renders. Do not treat a passing UI loop as evidence Apple Pay works.
- Verification has to be a manual pass on a real iPhone or Mac.

**Test cards:** in test mode, Apple Pay uses Stripe's standard test cards. Add one
to Wallet via Settings to make the button appear.

## Risks

- **Wallets bypass the card form's validation.** Apple Pay supplies its own name,
  email and phone. Our checkout collects those for the order; a wallet payment
  arrives with different, possibly empty, values. Worth deciding which wins before
  relying on order confirmation emails having a name in them.
- **`automatic_payment_methods` widens what can be charged.** If someone later
  enables Klarna or Afterpay in the dashboard, they appear at checkout with no
  code change and no review. That is a feature and a hazard; the dashboard is now
  part of the payment surface.
- **The domain change touches CORS.** A new origin must be added to
  `Cors__AllowedOrigins__N` on Fly, and the variable is indexed — the JSON-array
  form does not bind and fails silently. This already caused one outage.

## Recommendation

Do changes **4 and 5 now** — they are small, unblocked, and testable to the point
of "the card form still works". Defer the rest until a domain exists, and treat
"Apple Pay" as a *reason* to buy the domain rather than a task that can be
finished first.

Do **not** start with the frontend. There is no frontend work.

## Sources

- <https://docs.stripe.com/apple-pay>
- <https://docs.stripe.com/payments/payment-methods/pmd-registration>
- <https://docs.stripe.com/testing/wallets>
- Apple Pay on the web: <https://developer.apple.com/apple-pay/>
