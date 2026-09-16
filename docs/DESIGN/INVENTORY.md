# Screen & state inventory

Derived from the actual routes and components, not from a plan document. This is
the checklist wireframes and mockups are drawn against: **every screen, every
state.** A state with no design is a state the customer will find.

Evidence keys: `[J]` judged in `ui-shots/ui-qa-report.md`, `[C]` read from code,
`[V]` verified by running it.

---

## Customer app

Routes from `src/asian-taste-customer/src/App.tsx:30-50`.

### Global chrome

| Screen | States | Notes |
|---|---|---|
| **Header** | default · scrolled · cart-with-count · cart-empty · logged-out | Holds the wordmark, nav, cart, and (today) a `Login` button |
| **Footer** | default | **Entirely placeholder business data** — see D-08 |

### S1 · Home — `/`

| State | Designed? |
|---|---|
| Default (hero + categories + favourites) | ⚠️ exists, judged 7/10 desktop / **6/10 mobile** |
| Loading (menu fetch in flight) | ⬜ unknown — a skeleton was never designed; the capture script had to wait for data explicitly to avoid photographing one (`scripts/ui-shots.mjs:14-17`) |
| Error (API down) | ⬜ **none** — this is the "No items found" outage class |
| No menu data | ⬜ none |

Defects: hero secondary button illegible on the photo `[J]`; category rail clipped at the right edge `[J]`; header `Login` competes with the hero CTA `[J]`.

### S2 · Menu — `/menu`, `/menu/category/:id`, `/menu/popular`

| State | Designed? |
|---|---|
| Default, 82 items / 14 categories | ⚠️ exists, judged 7/10 |
| Category filtered | ⚠️ |
| Popular filtered | ⚠️ |
| Loading | ⬜ |
| Error | ⬜ |
| All items sold out | ⬜ none — a real evening scenario |

Defects: no dish photography, *"reads as a spreadsheet"* `[J]`; emoji category icons `[J]`; rail clipped `[J]`; `Add +` pill ~36px, under the 44px tap target `[J]`.

**Nav constraint:** 14 categories is more than the current chip row can show. Phở Nguyễn jumps between ~8 sections with sticky anchors (`REFERENCES.md`). 14 does not fit a rail on 390px — this is an open design question, not a styling one.

### S3 · Item detail — `/menu/item/:id` (overlay on S2)

| State | Designed? |
|---|---|
| Default with modifiers | ⚠️ exists, judged 7/10 |
| No modifiers | ⬜ |
| Quantity > 1 | ⚠️ **quantity control not visible without scrolling at either viewport** `[J]` |
| Sold out | ⬜ |
| Long description / long option list | ⬜ |

**Accessibility defect (D-07):** the modal is a fixed overlay with no `role="dialog"`, no `aria-modal`, no focus trap and no Escape handler — only `aria-label="Close"` (`ItemDetailModal.tsx:340`). Its own capture script documents this: *"The modal has no `role=dialog`; it is a fixed overlay panel"* (`scripts/ui-shots.mjs:89`).

### S4 · Search — `/search`

| State | Designed? |
|---|---|
| Results | ⚠️ judged 7/10 desktop / **6/10 mobile** |
| No results (empty state) | ⚠️ judged — off-token dashed grey border `[J]` |
| No query yet | ⬜ |
| Loading | ⬜ |
| Error | ⬜ |

Defects: `Price Range ($)` should be `A$` `[J]`; 🌶️ emoji in a label `[J]`; search button flush against the input, breaking the spacing rhythm `[J]`.

### S5 · Cart — `/cart`

| State | Designed? |
|---|---|
| Empty | ⚠️ judged 7–8/10, off-token cool-grey icon `[J]`, composition top-weighted `[J]` |
| With items | ⬜ **not judged** — needs state the capture cannot create |
| Item removed mid-session | ⬜ |
| Sold-out item in cart | ⬜ |

### S6 · Cart item edit — `/cart/edit/:itemId`
Same as S3.

### S7 · Checkout — `/checkout` · **two steps: details → payment**

| State | Designed? |
|---|---|
| Step 1, your details | ⬜ **not judged** |
| Step 1, validation errors | ⬜ |
| Step 1, pickup vs scheduled time | ⬜ |
| Step 2, payment method choice | ⬜ |
| Step 2, card entry (Stripe) | ⬜ — Stripe Elements themed with hardcoded hex, off-token `[C]` `StripeCardPaymentForm.tsx:198-200` |
| Processing | ⬜ |
| Payment declined | ⬜ |
| 3DS / wallet challenge | ⬜ |

### S8 · Confirmation — `/confirmation`, `/confirmation/:orderNumber`

| State | Designed? |
|---|---|
| With an order number | ⬜ not judged |
| Without one | ⬜ |
| Order status changing (pending → ready) | ⬜ — `useOrderStatus` + WebSocket exist; this is a design gap, not a plumbing one |

### S9 · Account — `/account` · **DELETE**

Slated for removal (guest checkout + local order history). The design scope
drops three screens: `AccountPage` (~550 lines, the most off-token file in the
repo at 65 `gray-*` uses), `LoginModal` (14), `CreateAccountModal` (24).

### S10 · Dead routes — `/order`, `/about`, `/contact`

Render `"… - Coming Soon"` (`App.tsx:47-49`). Either build them or delete them
and remove the footer links. **Do not design them.**

### Deleted with S9

`LoginModal`, `CreateAccountModal` — and the `Login` button in the header.

---

## Admin app

Routes from `src/asian-taste-admin/src/App.tsx:36-59`. All are behind
`ProtectedRoute` except `/login`.

| Screen | Route | States needed | Today |
|---|---|---|---|
| **A0** Login | `/login` | default · invalid credentials · submitting · rate-limited | ⚠️ judged 7–8/10; headings render in sans, not the serif token `[J]` |
| **A1** Dashboard | `/dashboard` | stats · loading · no orders yet · error | ⬜ not judged |
| **A2** Orders | `/orders` | list · filters · pagination · empty · error | ⬜ |
| **A3** Order detail | `/orders/:id` | detail · status change · refund | ⬜ |
| **A4** Menu management | `/menu` | categories · items · modifiers | ⚠️ **the API behind this is fake** — see D-06 |
| **A5** Reports | `/reports` | charts · range filters · empty | ⚠️ **4 TODOs in the controller** `[C]` |
| **A6** Settings | `/settings` | editable · saved · error | ⬜ |
| **Shell** | `AdminLayout` + `Sidebar` + `TopBar` | desktop · tablet portrait/landscape · collapsed | ⬜ — device is owner input O10 |

**Order status states to design, all 6:** `pending · confirmed · preparing · ready · completed · cancelled`, plus the POS sync states (`Pending · Synced · Failed`) which the kitchen needs to distinguish from the order's own status.

---

## Defect register

Ordered by what it costs. Fix D-01…D-05 before any visual work.

| ID | Sev | Defect | Evidence | Source |
|---|---|---|---|---|
| **D-01** | **Blocker** | Footer ships an invented address (`123 Main Street`), invented hours, a **`(02)` Sydney phone number** and an email on a domain the shop does not own — to real Adelaide customers | `App.tsx:70-90` | `[C]` |
| **D-02** | **Blocker** | Admin menu API returns `201 Created` with `Id = 0` and writes nothing. The admin UI reports success and persists nothing | `AdminMenuController.cs` ×12 TODOs | `[C]` |
| **D-03** | High | Category rail clipped at the right edge with no scroll affordance — **3 separate captures** | `[J]` home-1280, home-390, menu-390 | `[J]` |
| **D-04** | High | Quantity selector not visible without scrolling in the core ordering modal, both viewports | `[J]` item-detail ×2 | `[J]` |
| **D-05** | High | Emoji used as category icons. The map does not fit our data: **7 of 14 categories fall back to the same `🍽️`**, and `Noodle Soup`, `Noodle Bowl Salad` and `Noodle Stir-Fry` all render `🍜` | `CategoryNav.tsx:9-37` | `[C]` |
| **D-06** | High | Admin app never renders the brand font: `--font-family-sans` is not a Tailwind v4 token (it must be `--font-sans`), so `font-sans` resolves to the system UI face. The customer app carries a comment explaining this exact bug | `asian-taste-admin/src/index.css:37` + `[J]` login headings | `[C]` `[J]` |
| **D-07** | High | Ordering modal has no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler | `ItemDetailModal.tsx:340`; documented in `ui-shots.mjs:89` | `[C]` |
| **D-08** | High | Footer links `/privacy`, `/terms`, `/accessibility` render but **no such routes exist**; `/order`, `/about`, `/contact` are `"Coming Soon"` stubs | `App.tsx:47-49, 98-102` | `[C]` |
| **D-09** | Med | No dish photography; menu judged *"visually flat and clinical… reads as a spreadsheet"* | `[J]` menu ×2 | `[J]` |
| **D-10** | Med | Off-token greys: cart empty-state icon, search empty-state dashed border, admin demo-credentials block | `[J]` ×3 | `[J]` |
| **D-11** | Med | Hero is a random Unsplash photo of a different restaurant, fetched at 1920px remotely (1.17 MB on `home-1280`) | `Hero.tsx:10-11` | `[C]` `[V]` |
| **D-12** | Med | Invented tagline `"Taste of Happiness"` / `"made fresh daily with love"` | `Hero.tsx:23-26`, `App.tsx:63` | `[C]` |
| **D-13** | Med | `Price Range ($)` violates the A$ currency rule; 🌶️ emoji in a label | `[J]` search-390 | `[J]` |
| **D-14** | Med | `Add +` button ~36px, under the 44px tap-target minimum | `[J]` menu ×2 | `[J]` |
| **D-15** | Med | Palette drift: non-token `gray-*`/`blue-*` classes — `AccountPage` 65, `ConfirmationPage` 40, `ItemDetailModal` 30 | `grep` over `src/**/*.tsx` | `[C]` |
| **D-16** | Med | `menu/design-review.md` was a 6-byte file containing `-logo` (now deleted) | repo | `[C]` |
| **D-17** | Low | Hero secondary button contrast on the photo; header `Login` competes with the hero CTA | `[J]` home ×2 | `[J]` |
| **D-18** | Low | Empty cart composition top-weighted with a large dead zone below the CTA | `[J]` cart-empty ×2 | `[J]` |
| **D-19** | Low | Two different bag glyphs between header and empty state | `[J]` cart-empty-390 | `[J]` |

## Not yet judged — close this gap before the redesign is called done

`ui-shots/ui-qa-report.md` judges 6 screens. These are unmeasured:

`checkout` · `checkout-payment` · `cart-filled` · `confirmation` · `account` ·
`admin/dashboard` · `admin/orders` · `admin/order-detail` · `admin/menu` ·
`admin/reports` · `admin/settings`

The capture script cannot reach them because they need a signed-in session or a
non-empty cart (`scripts/ui-shots.mjs:117-123`). Extend `SHOTS` to drive a real
login and a seeded cart, or the redesign will be validated on ~35% of the app.
