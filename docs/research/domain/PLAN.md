# Moving off `*.vercel.app` to a real domain

Researched 2026-09-16. The blocker this removes: **Apple Pay requires a registered
domain, and a `*.vercel.app` host cannot be registered** because Vercel owns it.
So the domain is a prerequisite for Apple Pay, not a nice-to-have.

## The cheap answer

| Option | Indicative price | Notes |
|---|---|---|
| **Porkbun** `.com` | ~US$11/yr | Cheapest that also does `.com.au` |
| **Porkbun** `.com.au` / `.net.au` | listed, AU-capable | See eligibility below |
| **Cloudflare Registrar** `.com` | at-cost, no markup | **Cheapest for .com — but its supported-TLD list did not include `.au`**, so it cannot do a `.com.au` |
| **Vercel** `.com` | ~US$11/yr | Pro teams get **one free first year** on eligible TLDs (.app .dev .online .site .space .store .tech .website) — note **`.com.au` is not in that free list** |

**Recommendation: Porkbun for a `.com.au`,** or Cloudflare Registrar if you go
`.com`. You do **not** have to buy through Vercel — any registrar works; you just
point DNS at it.

### `.com.au` eligibility — check this before paying

`asiantaste.com.au` requires an **ABN (or ACN)**, or an exact-match Australian
trademark, plus an Australian presence. If the restaurant trades under their own
ABN that is fine; if not, a `.com` avoids the question entirely.

## The migration, in order

Do it in this sequence or Apple Pay will silently not appear.

1. **Buy the domain.** `asiantaste.com.au` via Porkbun, or a `.com` via Cloudflare
   Registrar.
2. **Add it to the customer app in Vercel** — Project → Settings → Domains → Add.
   Apex wants an **A record**; a subdomain wants a **CNAME** to the project's
   `…vercel-dns-017.com`. Or hand DNS to Vercel's nameservers — **copy any MX
   records first** or mail breaks.
3. **Register the domain with Stripe** (this is the Apple Pay step):
   ```bash
   curl https://api.stripe.com/v1/payment_method_domains \
     -u "sk_test_...:" -d domain_name=asiantaste.com.au
   ```
   Register **in live mode when you go live** — and note the asymmetry:
   **registering in live mode also covers sandbox, but registering only in test
   does NOT cover live.** Registering test-only is the state behind most
   "I registered it and Apple Pay still doesn't show" reports.
4. **Register every host you serve separately.** Apex and `www.` are different
   registrations. Pick one canonical host and redirect the other.
5. **Add the new origin to CORS on Fly**, or the browser blocks every request:
   ```bash
   fly secrets set Cors__AllowedOrigins__1="https://asiantaste.com.au"
   ```
   The variable is **indexed** (`__0`, `__1`, …). The JSON-array form fails
   **silently** and produces an empty allow-list.
6. **Confirm before believing it:**
   ```bash
   curl -s https://api.stripe.com/v1/payment_method_domains \
     -u "sk_live_...:" | grep -A3 asiantaste
   ```
   A domain can exist while the wallet is still **inactive** — check
   `apple_pay.status == "active"`, not merely that the domain was created.

## What this does not fix

- **Apple Pay still cannot be verified headlessly.** It needs Safari on an Apple
  device with a card in Wallet, over HTTPS. The nightly UI loop cannot detect an
  Apple Pay regression, so a green run is not evidence it works.
- **Google Pay needs no domain registration** — only the Stripe dashboard toggle.
  It works today.
- The admin app has its own URL. If you move that too, repeat steps 2 and 5.

## Cheapest path to Apple Pay, in one line

**Porkbun `.com.au` (~$15/yr) → add to Vercel → register in Stripe *live* mode →
add the origin to CORS.** Then one manual pass on a real iPhone or Mac.
