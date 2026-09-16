# Uber Eats study — Asian Taste store page

Source: <https://www.ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA>
Captured: live page fetch (text render, JS-hydrated content included).

This is a working reference for how the **real** Asian Taste store is presented on
the largest delivery marketplace in Australia. We are not copying the brand — we
are borrowing the **information architecture and browsing patterns** that make a
14-category menu painless to scan. Everything below is grounded in what the page
actually shows.

---

## 1. What the page actually contains

**Store identity block**

| Field | Value on the live page |
| --- | --- |
| Name | Asian Taste |
| Rating | **4.7 ★** · **3,000+ ratings** |
| Cuisine tags | Vietnamese · Asian · Chicken · $ (price bracket) |
| Address | 329 Henley Beach Rd, 8-9, Brooklyn Park, South Australia 5032 |
| Neighbourhood | Lockleys, Adelaide |
| Hours | All day menu · 10:00 am – 9:00 pm |
| Deliverability | Delivery availability resolved only once an address is entered |
| Promo chip | `$0 delivery fee (new users)` — "new customers" |
| Hero | Single wide store image (tb-static.uber.com processed image) |

**Section list (this is the full menu nav — 13 sub-sections + Featured)**

1. Featured items
2. Banh Mi Vietnamese Meat Rolls
3. Beef Dishes
4. Chefs Special
5. Chicken Dishes
6. Drinks
7. Noodle Bowl Salad
8. Noodle Dishes
9. Noodle Soup
10. Rice Bowl
11. Rice Dishes
12. Seafood Dishes
13. Snack
14. Vegetables Dishes

Then: **Rating and reviews**, then **Frequently asked questions**, then a
5-level breadcrumb (`Australia → South Australia → Adelaide → Lockleys → Asian Taste`).

**Real item data observed** (name · price · % liked · rating count)

Featured items, with an explicit **"No. 1 / No. 2 / No. 3 most liked"** rank badge:

| Badge | Item | Price |
| --- | --- | --- |
| No. 1 most liked | Pho Beef Noodle Soup | $19.80 · 93% (566) |
| No. 2 most liked | Dimsim (serve of 3) | $8.00 |
| No. 3 most liked | Spring Rolls | $8.00 |
| — | Crispy Pork roll | $10.50 · 92% (415) |
| — | Pad Thai | $19.90 |
| — | Combination Noodle Bowl Salad | $21.50 · 94% (255) |
| — | Rice Paper Rolls | $9.50 |
| — | Crispy Roasted Pork Noodle Bowl Salad | $20.50 · 92% (192) |
| — | Combination roll | $11.50 · 93% (173) |
| — | Chicken Lemongrass roll | $10.50 · 90% (128) |
| — | Chicken Egg Noodle Soup | $18.90 · 92% (104) |

Banh Mi section:

| Item | Price | Signal |
| --- | --- | --- |
| Crispy Pork roll | $10.50 | 92% (415) |
| Combination roll | $11.50 | 93% (173) |
| Chicken Lemongrass roll | $10.50 | 90% (128) |
| Snack Super Deal (2 spring rolls + 1 can of drink) | $7.00 | 96% (58) · shows drink choices inline |
| Grilled Chicken roll | $10.00 | 91% (82) |
| Tofu Roll | $9.50 | 92% (79) |
| Snack Super Deal 2 (2 Dimsims + 1 can of drink) | $7.50 | shows drink choices inline |
| Chicken Sate roll | $10.50 | 93% (45) |
| Lemongrass Beef Banh Mi | $10.50 | 100% (8) |

Real reviews carry **name + date + star row**, e.g. *"best bahn mi" — vanessa G.,
30/12/25*; *"Amazing service" — Hima A., 20/08/26*; the long ones are the
highlighted quotes ("It's cost-effective and good food! The avocado smoothie…").

**Note for us:** the marketplace lists at higher price points than our own
published `Menu.md` (e.g. Pho Beef $19.80 vs our $15.50) — marketplace markup and
a more granular naming scheme. Our menu data stays as published in `Menu.md`.

---

## 2. The browsing patterns worth stealing

### 2.1 Section index, always reachable
The 14 section links sit in a list that stays with the menu as you scroll. On a
wide screen it is a persistent **left rail**; on a phone it collapses to a
horizontally scrollable chip strip. That single decision is why a 100+ item menu
feels navigable.

### 2.2 Sections of *rows*, not a wall of cards
Each item is a **horizontal row**: text block on the left (title, then
`price • %liked (count)`, then any required-choice summary), square thumbnail on
the right with a small round **`+`** button pinned to the image's bottom-right.
Rows are dense — you scan many items per screen instead of three big cards.

### 2.3 Social proof attached to the item
`93% (566)` lives on the row itself. The "No. 1 most liked" badge promotes the
top sellers in Featured without any editorial copy.

### 2.4 Featured is a real section, not a carousel
"Featured items" repeats items that also appear in their own categories. It is
a deliberate **top-of-menu highlight**, ordered by the platform's own ranking.

### 2.5 Required choices are previewed at row level
Deals that need a drink selection say so on the row ("Drink choice: Coke / Coke
Nosugar / Sprite / …") before you tap in. No surprise modifier screens.

### 2.6 Delivery/Pickup is a first-class toggle
Two tabs directly above the menu. The store will not even quote a delivery time
until an address is known — availability is deferred, not faked.

### 2.7 Reviews and FAQ are part of the store page
The browsing journey continues past the menu into social proof and logistics
questions ("Can I order…?", "How do I pay…?") without leaving the page.

---

## 3. What we adopt, and what we deliberately do not

**Adopt**
- Store header that leads with rating + cuisine + price bracket + address + hours.
- Persistent section navigation (left rail ≥ laptop, chip strip on phone) with
  per-section item counts.
- Sectioned long-scroll catalog, one `<section>` per category.
- Compact item **rows** with thumbnail + quick add, alongside our richer dish
  cards where a photo/marketing moment is warranted.
- Item-level social proof: surface the real popularity signals we have
  (`popular` category, GF/Vegan/Spicy tags) as row-level chips.
- "Most liked" rank treatment for the top three, using our own category data.
- Delivery / Pickup / Dine in as a first-class toggle at the top of the menu.

**Do not adopt**
- Marketplace price points — we keep `Menu.md` prices as published.
- Uber's brand chrome, colour, type, or "delivery unavailable" gating.
- Carousel-heavy promo rails and upsell modals — our brand is calmer and
  family-run; we keep one accent, generous whitespace, and no dark patterns.
- The 5-level breadcrumb/FAQ SEO furniture — unnecessary in a single-venue site,
  though a short review block fits our brand well.

---

## 4. Concrete rules for our sectioned menu

1. **One section per category**, in `Menu.md` order, each `<section class="cat-section">`
   with a stable `id="cat-<id>"` for deep links (`menu.html#cat-banhmi`).
2. **Sticky section nav**: `nav.cat-rail` (≥1080px, sticky under the header) and
   `nav.cat-bar` (scrollable chips below that). Same data, one active state.
3. **Scroll-spy** drives the active nav item; clicking a nav item scrolls the
   section into view with heading offset for the sticky header.
4. **Section header** shows the label, the printed one-line description, and an
   item count.
5. **Item rows** keep: name, the required-choice hint (our `required` radio
   group label), real tags, price, and a quick add / "Choose options" action.
6. **Search** filters rows live, hides empty sections, and reports remaining
   count — never a dead end.
7. **Floating cart bar** appears once the cart is non-empty on small screens,
   mirroring the persistent cart affordance without a marketplace rail.
8. Keep the existing hero/order bar, deals band and story further down so the
   page still reads as *our* restaurant, not a marketplace.

---

## 5. Mapping: live store → our build

| Live store element | Our component |
| --- | --- |
| Store name + 4.7 ★ + 3000+ ratings | `.store-head` rating line (`4.7` from live page, presented as our own) |
| Vietnamese · Asian · Chicken · $ | `.store-tags` (cuisine + price bracket) |
| 329 Henley Beach Rd… | `.store-head` address + hours |
| Left section rail / chip strip | `nav.cat-rail` / `nav.cat-bar` |
| Sectioned menu | `.cat-section` × 14 |
| Item row + thumbnail + `+` | `.item-row` with `.item-thumb` + quick add |
| `93% (566)` social proof | `.item-like` chip (from our `popular` data) |
| "No. 1 most liked" | `.badge-liked` on top three |
| Delivery / Pickup tabs | existing `.seg` order bar |
| Reviews block | `.reviews` band with real-style review rows |
| FAQ | short `.faq` accordion (2–3 venue questions only) |
