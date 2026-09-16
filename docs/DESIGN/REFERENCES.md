# References

Three references, fetched and read on 2026-09-14. Verdicts are about **what to
borrow structurally**, not "make it look like this". Copying structure from a
successful ordering flow is normal practice; none of the three is a visual
model to clone.

---

## 1. Phở Nguyễn — `phonguyen.com.au/order-now/`

**The best structural reference of the three.** A Vietnamese phở shop with a
photo-less, type-led menu, and it works. This matters because our photography is
not here yet.

What it does, and what we should take:

| Pattern | Detail | Verdict |
|---|---|---|
| **Dual-language dish names** | Every dish carries English *and* Vietnamese: `Rolling Rare Beef Phở` / `Phở Bò Tái Lăn`, `Brisket Phở` / `Phở Nạm` | **Borrow — highest-value idea here.** For a Vietnamese menu this is the single cheapest authenticity win, it costs no photography, and it is what the customer actually says at the counter. Our menu has none of it. |
| **Inline size pricing** | `Small $19.00 / Large $21.00` shown in the list, not hidden behind a modal | **Borrow.** Our modifier flow buries variants in `ItemDetailModal`. Sizes are a browsing decision, not a checkout decision. |
| **Inline extras with prices** | `Extra → Egg yolk $5.00, Noodle $4.50, Rare Beef $7.00` all visible in the list | **Borrow.** Makes the page scannable without clicking. |
| **Sticky category anchors** | `Signature · Traditional Phở · Stir-Fried Phở · …` as a jump list | **Borrow, adapted.** We have **14 categories** — more than this. See the nav decision in `INVENTORY.md`. |
| **No photography at all** | The menu carries itself on type, names and price | **Borrow as fallback.** Proof that a photo-less menu can look intentional. Our current menu was judged *"visually flat and clinical… reads as a spreadsheet"* — the difference is not the absence of photos, it is the absence of intent. |
| **Slide-over cart** | `Your Order` panel, subtotal, `Order now` → checkout, with a **restaurant selector** and an explicit block: *"Please choose restaurant before order"* | **Partly.** Slide-over cart: yes. Multi-location selector: **not for us** — one shop. |
| **Prices as `$` with 2 decimals** | `$ 19.00` | **Confirm.** Matches the A$ rule we currently break in `SearchFilters`. |

**Where it is weak — do not copy:** the page is a very long single scroll with no
search, and it is WooCommerce under the hood. Fine at 30 items; we have **82
across 14 categories**. We need the search and filter path it lacks.

**What it teaches about us:** Phở Nguyễn is the same cuisine, the same city,
roughly the same price band. It looks considered without a single dish photo. If
we ship photo-less, this is the standard to hit.

---

## 2. Pastagogo — `pastagogo.com.au`

An Adelaide pasta chain. Fetched and read; the useful part is what it reveals
about the local market, not its design.

| Observation | Detail | Verdict |
|---|---|---|
| **Ordering is outsourced** | The "order online" CTA hands off to `pastagogo.bopple.app` — a third-party platform, not their own UI | **Read the market, not the design.** A real multi-site Adelaide operator does not build ordering UI; they rent it. Our own ordering flow is therefore a genuine differentiator — worth designing properly, which is the point of this folder. |
| **Menu is a PDF** | `/download-menu` is a PDF; so is the allergen chart | **Avoid.** A PDF menu on mobile is the thing we beat. |
| **Multi-location selector** | Six Adelaide sites + two in Victoria, each with its own phone | **Avoid.** Out of scope; one shop. |
| **Allergen chart as a document** | A dedicated allergen PDF | **Consider later.** Our dietary badges (`GF`, `V`, spicy) exist in the seed data. For a menu built on fish sauce, peanuts and shellfish, a proper allergen table is a real trust feature — but it is content work, not design work. Note it, do not build it now. |
| **Hours + phones as a plain list with Maps links** | Utilitarian, legible, correct | **Borrow the plainness.** This is the part we got wrong: our footer has invented hours and a Sydney phone number. Correct and boring beats clever and false. |
| **Overall aesthetic** | Wix template, default type, stock imagery | **Avoid.** This is the "slop" our friend means — except theirs ships and makes money. A reminder that polish is not the only variable; correctness is. |

**The lesson:** the bar for an Adelaide restaurant site is low, and the
competition is a rental widget and a PDF. That is an opportunity, and it also
means "our UI is slop" is, commercially, survivable — the *untrue footer* is the
more urgent problem.

---

## 3. Uber Eats — `ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA`

**Fetched on 2026-09-14: `403 Forbidden — access denied`, 13 bytes.**

This is the answer to "scrape Uber for the menu and photos":

> **Uber Eats blocks automated access.** It is a scripted SPA behind bot
> protection; the request did not return a menu, it returned an access-denied
> page. There is no legitimate or practical scrape here, and the Terms of
> Service forbid it. Do not build a scraper.

**But the link itself is valuable**: it confirms the shop is on Uber Eats. Which
means **the owner has already uploaded their own dish photos to the merchant
portal.** Those are the shop's own assets. Ask for them — see `BRIEF.md` O1.
That is the legitimate, free, ten-minute route to the photography we need.

### Patterns to borrow (from using the product, not from scraping it)

Uber Eats' own UI is the bar because it is the tab already open next to ours.
The patterns worth taking are conventions of good ordering UX, not anyone's
property:

| Pattern | Why it works | Apply to us |
|---|---|---|
| **Horizontal category rail, sticky under the header** | One-thumbed category jumping without leaving the list | Yes — our current chip row is clipped at the right edge with no scroll affordance, on three separate screens |
| **Item card = photo · name · price · `+`** | A single glanceable unit; the add action is on the card | Yes — but our cards have no photo and the judged `Add +` pill is ~36px, under the 44px tap target |
| **Modifier sheet with a sticky, priced confirm button** | Cost changes are visible *before* commit; the button reads `Add to cart · $8.50` | Yes — our modal's quantity control is not visible without scrolling at either viewport, which is a break in the core flow |
| **"Most ordered" / popularity badges** | Social proof reduces choice paralysis on a long menu | Yes, **only if true** — depends on owner input O9 |
| **Sticky cart bar showing item count + total** | Always answers "what am I spending" | Yes |
| **Explicit, itemised totals** | No surprise at checkout | Yes — and we already have the GST-inclusive rule right |
| **Order-status tracking after purchase** | Kills "where is my food" support load | We have `useOrderStatus` + a WebSocket already; it is a design problem, not a plumbing one |
| **Fee transparency up front** | Trust | We are pickup-only, so mostly N/A — which is itself a selling point to make visible |

**What not to copy:** Uber's visual density is tuned for a delivery marketplace
with thousands of merchants competing. Our shop is one kitchen and one address.
Borrow the mechanics, not the visual noise, and not the marketplace chrome.

---

## Synthesis — the three ideas worth stealing

1. **Dual-language dish names** (Phở Nguyễn). Free, authentic, no photography
   required, and it is what the customer says at the counter. **Do this first.**
2. **A correct, boring footer** (Pastagogo, accidentally). Real address, real
   hours, real phone. We currently ship an invented Sydney number.
3. **A category rail + card + modifier sheet that survive one thumb** (Uber
   Eats). We have all three, and all three are measurably broken today.
