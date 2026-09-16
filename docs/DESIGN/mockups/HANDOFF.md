# Asian Taste — design set handoff

**Status:** design-complete, build-ready. 16 screens + 2 stylesheets + 4 scripts
+ 12 localized photos.
**Source of truth:** `src/brand-spec.md` (tokens/type) ← the owner-supplied
`DESIGN_SYSTEM_STYLE_GUIDE.md` and `MENU_LANDING_PAGE_SPECS.md`, now at
`docs/DESIGN/source/`.
**Audience:** the engineer porting this into the real storefront.
**Kick-off prompt for that port:** [`NEXT-SESSION-PROMPT.md`](NEXT-SESSION-PROMPT.md)
in this folder — copy-paste it into a fresh session; it is written to be
self-contained.

**Where this design set lives:** `docs/DESIGN/mockups/` in this repo. This
document is the handoff; `src/` is the clickable set
(`docs/DESIGN/mockups/src/index.html`); `docs/DESIGN/source/` holds the
owner-supplied inputs verbatim. **Every path below is relative to
`docs/DESIGN/mockups/src/` unless stated otherwise.** §8 maps every required
mockup in `docs/DESIGN/mockups/README.md` to the file that covers it. **Resuming
in a new session?** Start at §10 — it is the ordered "what to do next / what not
to redo" list — and to begin the port itself, copy the prompt in
[`NEXT-SESSION-PROMPT.md`](NEXT-SESSION-PROMPT.md).

This set is a **specification you can click through**, not production code. Every
screen is static HTML + vanilla JS on purpose — no framework, no build step, so
the port can lift markup, tokens and interaction rules without inheriting a stack
decision it didn't make.

---

## 1. What ships

| File | Role | What to port first |
|---|---|---|
| `brand-spec.md` | Token + type contract. **Read this first.** | Phase 1, verbatim |
| `styles/app.css` | Customer design system (890 lines) | Phases 1–3 |
| `styles/admin.css` | Staff-console chrome (219 lines) | Phases 1–3 |
| `scripts/menu-data.js` | The menu data model — 81 dishes, 14 categories | Phase 2, verbatim |
| `scripts/store.js` | Cart / order-type / drawer state, `localStorage` | Phase 4 |
| `scripts/chrome.js` | Shared header, drawer, footer, mobile bar, `--head-h` sync | Phase 4 |
| `scripts/admin.js` | Staff demo data + helpers (status meta, pills, totals) | Phase 2/5 |
| `index.html` | Launcher — every screen one click away | reference |
| `home.html` | Storefront home: hero, service type, the 3 most-liked dishes, 14-section browse index, deal, story, closing CTA | Phase 5 (build first) |
| `menu.html` | Catalog: 14 sticky-filtered sections, search, quick-add | Phase 5 |
| `dish-card.html` | Card anatomy + 7 variants (annotated) | Phase 3 |
| `dish-detail.html` | Modifiers with live pricing, spice scale, vegan swap | Phase 5 |
| `cart.html` | Empty + filled, service switch, promo, stepper | Phase 5 |
| `checkout.html` | 2 validated steps, masked card, processing state | Phase 5 |
| `confirmation.html` | Order number, 6-stage tracker, receipt | Phase 5 |
| `states.html` | Empty / loading / error / sold-out blocks | Phase 3 |
| `admin-login.html` | Staff entry | Phase 5 |
| `admin-dashboard.html` | Today's numbers + kitchen board | Phase 5 |
| `admin-orders.html` | 12-order table, filters, search | Phase 5 |
| `admin-order-detail.html` | One ticket, 6-stage scale + control, history | Phase 5 |
| `admin-menu.html` | 81 dishes, availability toggles, category tabs | Phase 5 |
| `tokens.html` | Live token + component sheet | QA reference |
| `asian-taste-menu.html` | Original single-file prototype, kept for reference | do not port |
| `uber-eats-study.md` | Why the catalog is sectioned the way it is | rationale |

**Photos** (`assets/`, 12 JPEGs, all local — no hotlinks):

| Group | Files | Native ratio |
|---|---|---|
| Brand / store | `hero.jpg` (1600×1200), `family.jpg` (1400×1050) | 4:3 |
| Uber Eats set | `assets/dishes/*.jpg` (10) | 0.72–1.25, mixed |

Provenance for the dish photos is recorded in **`assets/dishes/SOURCES.md`**
(source URL, owner, capture date, per-file px/ratio, and the settled hash check).
Read it before adding more photos. **7 of the 81 dishes** currently carry a real
photo; the rest fall back to the woven-initial placeholder. See §5.

---

## 2. Run it

No build step. Serve the folder over HTTP (the scripts use `localStorage`, which
some browsers restrict on `file://`):

```bash
python3 -m http.server 8080     # then open http://localhost:8080/index.html
```

---

## 3. The port plan, in order

Do **not** start at the screens. Each phase only works if the one before it is
locked. This is the order that avoids the usual "the brand drifts between pages"
outcome.

### Phase 0 — decide (1 hour, before any code)

- Stack. The markup is framework-agnostic; nothing depends on how you render.
- Where the mockups live. Suggested: `docs/DESIGN/mockups/` in the repo, with
  `docs/DESIGN/` holding `brand-spec.md` as the canonical token doc.
- Who owns the token file. One owner. Palettes die from committee edits.

### Phase 1 — tokens (do this before anything else)

Take the six core tokens from `brand-spec.md` §Core tokens, verbatim. If the real
project uses Tailwind, map them into `theme` — **do not invent a scale**:

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F5F0E6` | page paper |
| `--surface` | `#FFFFFF` | cards, drawer |
| `--fg` | `#3C2A21` | text, dark panels |
| `--muted` | `color-mix(in oklch, var(--fg) 66%, var(--bg))` | secondary text |
| `--border` | `#E8DCC8` | hairlines **and** recessed media-well fill |
| `--accent` | `#8B3A3A` | action + price — nothing else |

Supporting semantics (do not promote these to "brand colours"): `--gold #D4AF37`,
`--deal #C30139`, `--spicy #FF5722`, `--gf #4CAF50`.

**Rules that are not negotiable** (they are what makes it look designed rather
than generated):

1. Only **two creams**: `--bg` paper and `--border` hairline. There is no third
   beige. `--tan` and `--brown-light` were removed deliberately.
2. `--accent` appears **at most twice per screen** (usually: one primary CTA and
   the price). It is never a background wash.
3. **No raw hex outside `:root`.** Everything else is `var(--…)` or a
   `color-mix()`. Derive tones on the spot; no `--accent-50`/`--accent-300`.
4. Gold is a highlight **on dark only**; it never carries body text on cream.
5. Display face is **Plus Jakarta Sans**; body is **Manrope**. (The original
   guide implied a serif; it was swapped to Plus Jakarta Sans for legibility —
   do not reintroduce Playfair.)

Derived tokens used throughout (`--accent-soft`, `--accent-line`, `--fg-soft`,
`--gold-soft`, `--on-dark`, `--shadow-sm/md/lg`) are defined at
`styles/app.css:8`. Port them, or recompute them with the same mix percentages.

### Phase 2 — data contract

`scripts/menu-data.js` is the single source of menu truth and is worth porting
almost verbatim as a typed model.

```
Category { id, label, desc }
Dish     { id, name, desc, price, cats[], tags[], options[], image, note? }
  tags[]  ⊆ 'popular' | 'gf' | 'vegan' | 'spicy'
  options[]: Group
Group    { id, label, type: 'radio'|'checkbox'|'range', required?,
           choices?: [{ id, label, delta?, note? }],
           min?, max?, value?, hint? }        // range = the 1–5 spice scale
```

- `AT_MENU.priceOf(dish, selections)` is the modifier-pricing contract
  (`scripts/menu-data.js:202`). Keep that shape: unit price + ordered deltas.
- Publically consumed API: `scripts/menu-data.js:193` (`categories`, `dishes`,
  `byId`, `countIn`, `priceOf`, `likedOf`, `ratingOf`, `storeRating`).
- Cart contract: `scripts/store.js:225` (`add`, `setQty`, `remove`, `subtotal`,
  `fee`, `total`, `count`, `onChange`, `orderType`, `customer`).
- Staff contract: `scripts/admin.js:215` (`orders`, `byId`, `stats`,
  `statusMeta`, `pill`, `typeLabel`, `itemsSummary`, `STATUS_ORDER`).

**Canonical status vocabulary — reuse these exact keys** in the real backend so
pills, the 6-step scale and the timeline all keep working:
`placed → confirmed → preparing → ready → delivery → completed`, plus `cancelled`.

The 12 staff orders in `scripts/admin.js:31` use marketplace (Uber Eats) prices —
about 2–4% above the printed menu — so the console reads like the live store.
If your backend has one price table, that's fine; just don't "fix" it to match
the menu, it was intentional.

### Phase 3 — primitives and components

`styles/app.css` is organized as banners; port it top-down:

| app.css | Contents |
|---|---|
| `:root` (8) | tokens |
| reset & base (60) | box-sizing, focus-visible, `text-wrap` |
| layout primitives (86) | `.container`, `.section`, `.grid-2/3/4/2-1/1-2`, `.row` |
| type (101) | `.eyebrow`, `.lead`, heading scale |
| **buttons (115)** | `.btn`, `.btn-primary/secondary/gold/ghost`, `.btn-arrow/block` |
| **panels / cards (141)** | `.panel`, `.panel-head`, `.panel-body`, `.panel-foot` |
| **fact lines (157)** | `.factline`, `.kv`, `.facts` — see below |
| **dish grid + card (339)** | `.menu-grid`, `.dish-card`, `.dish-media`, `.badge` |
| price + add (309) | `.price`, `.add-btn` |
| **cart drawer (447)** | `.drawer`, `.cart-item`, `.qty`, `.sum-row` |
| **forms (495)** | `.field`, `.input`, `.choice`, `.switch`, `.field-error` |
| stepper / progress (530) | `.stepper`, `.step` |
| pills + status (554) | `.pill`, `.status-pill`, `.status-*` |
| **status scale (567)** | `.scale`, `.scale-step` (6 stages) |
| timeline (581) | `.timeline`, `.tl-mark` |
| **state blocks (594)** | `.state-block` (empty/error), `.skeleton` |
| store header (734) | `.storehead` |
| catalog shell (754) | `.cat-rail`, `.cat-bar`, `.catalog-tools` |
| category sections (794) | `.cat-section`, `.cat-head` |
| **item rows (806)** | `.item-row` — the catalog's dense row variant |
| floating cart bar (848) | `.floatcart` |
| reviews band (867) | `.review-head`, `.reviews` |

`styles/admin.css` banners: rail (8), main + sticky top (72), stat cards (86),
data table (99), filter bar (110), kitchen board (124), order detail (139),
login (161), menu management (172), responsive rail (186).

**The three text primitives are load-bearing.** They exist specifically to kill
the "label / line break / value" pattern that makes a UI read as AI-generated:

- `.factline` — label and value on **one line**, optional icon. Horizontal.
- `.kv` — a real `<dl>` grid, for label→value inside a panel.
- `.facts` — the horizontal receipt strip (confirmation screen).

Never stack a `<dt>` above its `<dd>`. `tokens.html` documents all three.

### Phase 4 — behaviour

- `scripts/chrome.js` injects the shared header, drawer, footer and mobile bar,
  and publishes the header height as `--head-h` so sticky offsets stay correct.
  In a component framework this becomes your layout shell.
- `scripts/store.js` is the cart. It persists `at_order_v2`, `at_cart_v2` and
  `at_customer_v1`. In production these become session/server state; keep
  `onChange` as the single re-render trigger.
- `admin-menu.html` persists availability as `at_unavailable`. That is the
  one piece of admin state that must become real first — it is the screen's job.

### Phase 5 — screens

Build in this order (each reuses the previous):

1. `menu.html` → 2. `dish-detail.html` → 3. `cart.html` → 4. `checkout.html` →
5. `confirmation.html` → 6. `states.html` → 7. `admin-login.html` →
8. `admin-dashboard.html` → 9. `admin-orders.html` →
10. `admin-order-detail.html` → 11. `admin-menu.html`

`tokens.html` is the QA reference — when a component drifts, diff it against
that page before changing anything.

Mapping to the repo's `MENU_LANDING_PAGE_SPECS.md`: the spec's Header (1),
Hero (2), Order Type Selector (3) are implemented in `menu.html` + `chrome.js`;
the menu-display sections follow `uber-eats-study.md` §4–5.

---

## 4. Real vs mocked — tell the client this plainly

**Real:** all 81 dishes, 14 categories, AUD prices and the printed option groups,
sourced from the kitchen's own `Menu.md`. The cart, service type, quantities and
availability toggles genuinely persist in the browser.

**Mocked:** admin orders, customers, revenue and status history are demo data.
Payment, refunds, printing and login accept anything. **No network calls are
made anywhere.** The kitchen board's "live" indicator is decorative.

---

## 5. Known gaps — do not ship past these

1. **Photography is partial, and one source was rejected outright.**
   - **Coverage:** Uber Eats lists 83 items but only **21 carry an image** (10
     food, 11 packaged drinks); **62 items have no photo anywhere**, so there is
     nothing to acquire for them. Drinks are skipped — the 14-category menu has
     no Drinks section.
   - **Wired: 7 of our 81 dishes.** 6 Uber photos (`cold-rolls`, `dim-sim`,
     `spring-rolls`, `pad-thai`, `salad-crispy-pork`, `salad-combination`) plus
     `pho-beef` ← the md5-verified pho photo. The other 74 render the
     woven-initial placeholder — the honest behaviour the repo's `DishImage`
     already specifies.
   - **Four dish photos were removed — read this before restoring them.** The
     legacy `asset` set (`dish-1…4.jpg`) was previously wired to `pho-beef`,
     `banhmi-crispy-pork`, `laksa-chicken` and `salad-chicken`. They were
     **675×900 re-encodes of the four `menu/*.jpeg` files that migration
     `10_clear_unverified_dish_images.sql` cleared**, after the design judge
     reported they are photographs of a **printed menu, not food** — *"they make
      the food look unappetising."* Identity proven by downscaling each archive
      original to 675×900 and comparing across the full 4×4 set: mean absolute
      difference 1.28–1.42 on the matching pairs vs 42.7–72.3 elsewhere. The four
      mappings were dropped and the re-encodes moved
     to `docs/DESIGN/source/photos/legacy-menu-set/` (the 1536×2048 originals are
     in `docs/archive/menu-board-photos/`), with a README explaining the check.
     Restore them only if a human looks and finds the judge was wrong.
   - **Still unverified:** the build model cannot read images, so the remaining
     seven photo↔dish pairings are inferred from Uber item names, never visually
     confirmed. **Action:** open `assets/dishes/` at full size and compare against
     the Uber item names in `assets/dishes/SOURCES.md`. Every dish already
     supports `image` in the data model, so corrections are a data edit, not a
     code change.
   - **Ratio warning:** the remaining photos are 0.72–1.25 (portrait→landscape)
     from one source. Card wells sit at `4/3` (~6% cut on landscapes);
     `.fav-media` in the single-file prototype is `5/4` so the pho shows
     uncropped; the detail hero adopts the photo's own ratio. Review at full size
     before promoting (see `docs/DESIGN/mockups/README.md` "Where dish photos
     will actually land").
2. **Admin is tablet-first.** It is usable at 390px but the orders table scrolls
   horizontally inside its wrapper by design. If the kitchen uses phones, say so
   and I'll build the card-per-order variant instead.
3. **No empty-slot rule for deals.** `deals` has exactly 1 dish; the deals band
   assumes at least one and hides itself if empty. Verify with the client.
4. **Copy counts are derived where it matters.** Screen copy that states a dish
   count reads it from `AT_MENU` (previously hardcoded "42" — wrong, now fixed).

---

## 6. Mobile & accessibility contract

- **Mobile-first, validated at 390 / 430 / 768.** No horizontal page scroll at
  any of those widths.
- **Breakpoints:** 1200 / 1080 / 1000 / 980 / 940 / 900 / 820 / 760 / 720 / 700 /
  660 / 640 / 620 / 560 / 520 / 420. They are semantic, not a scale — copy them,
  and keep 768 as a test width even though no rule targets it directly.
- **Rules learned the hard way, keep them:**
  - The header's inline nav disappears from 980px down, so the bottom bar must
    switch on at the **same** breakpoint. If those two disagree you get a
    navigation dead zone — which is exactly what portrait tablets (768px) hit.
  - Segmented controls (`.seg`, `.seg-sm`) must `flex-wrap`. A 4-button service
    filter will run past a 390px viewport otherwise.
  - Numeric scales (the 1–5 spice picker, `.seg-num`) stay **horizontal** on
    mobile — a 5-row stack destroys the sense of a scale.
  - The catalog's 14 category chips are a horizontal scroller (`.cat-bar`), not a
    wrap. Wrapping 14 chips eats a third of the screen.
  - Sticky offsets read `--head-h`, never a hardcoded pixel value.
  - `.mm-row` (menu management) keeps its availability switch on the row at
    ≤720px; the price column and the switch's text label drop instead. The
    checkbox carries its own `aria-label` so nothing is lost to screen readers.
- **Touch targets:** 44×44px minimum on every action. The whole design set
  complies; check it again after the port.
- **Contrast:** dietary marks are coloured **dots on neutral pills**, not
  saturated fills, so text stays at AA.
- **Focus:** `:focus-visible` is maroon; gold on dark bands. `prefers-reduced-motion`
  is respected globally (`styles/app.css:626`).

---

## 7. QA gate before you call it done

Port the checklist in `.od-skills/web-prototype-4ab6e4cb5f/references/checklist.md`
into CI/lint where you can. The ones that actually catch regressions:

- [ ] No `#hex` outside the token block.
- [ ] Accent used ≤2× per screen.
- [ ] Every top-level `<section>` has `data-od-id`.
- [ ] No horizontal scroll at 390 / 430 / 768.
- [ ] Every dish renders either a real `<img>` or the woven placeholder — never a
      broken image, never a remote URL.
- [ ] No emoji as an icon; no filler copy; no invented metrics.
- [ ] All links resolve (the four "unresolved" refs in this build are JS string
      concatenations building `d.image`, not links).

Verified on this revision: CSS braces balanced (547/547 app, 150/150 admin),
`node --check` clean on all 4 scripts and every inline `<script>` block, all
static `href`/`src` resolve.

---

## 8. Where this set lives in the repo, and what it covers

The repo already has the design folder this set was built against:
`docs/DESIGN/` (`README.md`, `BRIEF.md`, `REFERENCES.md`, `INVENTORY.md`,
`DIRECTION.md`, `TOKENS.md`, `COMPONENTS.md`, `mockups/README.md`). This design
set is the **mockups** that `mockups/README.md` lists as "in progress (Open
Design)". It was landed on 2026-09-15 as:

```
docs/DESIGN/
  source/                    # owner-supplied inputs, verbatim (was repo-root menu/)
    Menu.md                  #   the menu data model source
    DESIGN_SYSTEM_STYLE_GUIDE.md
    MENU_LANDING_PAGE_SPECS.md
    photos/pho-beef-noodle-soup.jpeg
    photos/legacy-menu-set/  #   675×900 re-encodes, held for human review
    README.md                #   provenance for the above
  mockups/
    README.md                # the must-draw contract (pre-existing)
    SOURCES.md               # provenance for this folder
    HANDOFF.md               # this file
    src/                     # the clickable set — source of the PNG exports
      index.html             # launcher
      styles/{app,admin}.css
      scripts/{menu-data,store,chrome,admin}.js
      *.html                 # the 16 screens
      assets/                # 12 local photos (hero, family, 10 dishes) + dishes/SOURCES.md
      brand-spec.md          # tokens/type → fold into docs/DESIGN/TOKENS.md
      uber-eats-study.md     # rationale for the sectioned catalog
      asian-taste-menu.html  # history — the prototype that started it; does not ship
```

`src/` is deliberately separate from the export folders (`customer/`, `admin/`,
`tokens/`) so the `README.md` PNG-naming contract stays clean.

**The old repo-root `menu/` folder no longer exists.** Its three spec docs and
the phở photo moved to `docs/DESIGN/source/`; its four UUID-named menu-board
photos moved to `docs/archive/menu-board-photos/` (they were never food — see
§5.1); its admin-UI screenshots moved to `ui-shots/admin-ui-reference/`
(gitignored, local reference). References in `docs/DESIGN/DIRECTION.md`,
`BRIEF.md` and `TOKENS.md` were re-pointed at the new paths.

### Screen → the mockups `README.md` demands

| `mockups/README.md` requires | Covered by | Notes |
|---|---|---|
| `home` 390 + 1280 | `home.html` | **Drawn (r8).** S1 Home is its own route, not the menu; the section-by-section contract is in §9 r8 |
| `menu` 14-cat nav, 390 first | `menu.html` | sectioned catalog, sticky rail; see `uber-eats-study.md` |
| `dish-card` anatomy | `dish-card.html` | the highest-leverage artifact — 81 items depend on it |
| `item-detail` + qty > 1 | `dish-detail.html` | live modifiers, spice scale, quantity |
| `cart` empty + filled | `cart.html` | both states |
| `checkout` step 1 / 2 / processing | `checkout.html` | validated details → payment → processing |
| `confirmation` w/ live status | `confirmation.html` | 6-stage tracker |
| shared states empty/loading/error/sold-out | `states.html` | all four |
| `login` (fix D-06 serif heading) | `admin-login.html` | heading is Plus Jakarta, not serif |
| `dashboard` tablet | `admin-dashboard.html` | kitchen board |
| `orders` + filters | `admin-orders.html` | status/service filter + search |
| `order-detail` status control | `admin-order-detail.html` | 6 stages as scale **and** control |
| `menu-management` | `admin-menu.html` | availability toggles persist; rest is demo (see §4) |
| `tokens/*` palette / type-scale / components | `tokens.html` | the primitive sheet, one page |

**Export contract:** `mockups/README.md` §Rules + §Naming apply to the PNGs you
commit (`<app>-<screen>-<state>-<width>.png`, 2×, <500 KB, `SOURCES.md` per
folder). The HTML here is the source those exports come from — do not commit
`.fig`/`.xd`/`.sketch`.

---

## 9. Revision log

**r8 — the `home` screen drawn (2026-09-15)**

Closes the §8 gap. New file `src/home.html`; `styles/app.css`, `scripts/chrome.js`
and `src/index.html` changed with it. Everything else is untouched.

**What Home is for.** `menu.html` answers *"what do you sell?"* — it is the
catalog plus the store header. `home.html` answers *"should I order, and how
fast?"* It is the page a first-time visitor lands on and the page the logo points
at, and it deliberately does **not** render the 81-dish catalog: it curates. That
is the only thing that makes two screens justified instead of one.

**The seven sections, in order** (each carries a `data-od-id`):

| § | `data-od-id` | Content | Why it is here |
|---|---|---|---|
| 1 | `home-hero` | promise headline, one primary CTA, `hero.jpg`, a 4.7/3,000+ stamp | appetite hook + the page's single primary action |
| 2 | `home-order` | the shared `.orderbar` (delivery / pickup / dine in) | the first real decision, before any scrolling into food |
| 3 | `home-picks` | the three most-liked dishes as `.dish-card`s | social proof and the shortest path to a dish |
| 4 | `home-browse` | `.cat-index` — all 14 sections, label + count + arrow | navigation into the catalog without duplicating it |
| 5 | `home-deals` | the shared `.deal-band` | urgency; the only gold button on the page |
| 6 | `home-story` | the family split + three claims | the local/independent reason to buy |
| 7 | `home-close` | `.cta-strip` — primary action repeated once | closes the loop after the story |

**Real data, not invented.** Section 3 is `LIKED` (`pho-beef` 1, `dim-sim` 2,
`spring-rolls` 3) — the same ranking the marketplace store page shows, and it is
the reason all three picks have real photography. `93% liked · 566 ratings` on the
pho is `RATINGS['pho-beef']`; the other two show a **line about the dish instead**
because the platform publishes no rating for them. The section-4 counts come from
`AT_MENU.countIn()`, so they cannot drift from `menu-data.js`.

**Two deliberate non-choices.**
1. **No rating, no badge, no claim that is not in the dataset.** The other two
   picks carry honest copy rather than a fabricated "92% liked".
2. **The logo still links to `index.html`**, so a reviewer can always get back to
   the launcher; Home is reached through the new first nav item
   (`NAV[0] = { id: 'home', … }` in `chrome.js`). When this is ported, the logo
   should point at the store home — but in the design set the launcher matters
   more than product realism, and changing it would strand every other screen.

**Supporting changes.**
- `styles/app.css` — a new `/* home */` block (890 → 943 lines): `.dish-like`,
  `.cat-index` (+ `.ci-text` / `.ci-go`, 2 → 1 columns at 720px) and
  `.cta-strip .hero-cta`. The index gets its hairlines from a 1px grid gap rather
  than decorative borders, and carries **no accent at rest** — maroon appears only
  on the row you point at, which keeps the per-viewport accent budget.
- `scripts/chrome.js` — `Home` added as the first `NAV` item only. The mobile bar
  still has four items; a fifth would crowd a 390px bar.
- `src/index.html` — `data-page` moved `home` → `index` (the launcher is not the
  customer home, and it would otherwise mark Home as `aria-current`), a `home`
  card added as the first customer screen, and the count corrected to 16.

**Open, for the owner.** (a) With a signed-in customer who has ordered before,
should Home lead with *order again*? (b) Is the home hero the right place for the
`4.7 / 3,000+` stamp, or does it belong only on `menu.html`'s store header?

**r7 — two r6 "corrections" reverted (2026-09-15, docs only)**

r6 removed several genuine overstatements but introduced two of its own. Both are
corrected here. No screen, script, stylesheet or photo changed.

1. **The pho is first-party after all.** r6 said the file could not have come from
   `menu/images/Pho Beef Noodle Soup.jpeg`, citing `git ls-tree -r HEAD menu/` as
   proof the folder held no `images/`. That is a non-sequitur: `git ls-tree` lists
   **committed** files, `menu/images/` was never gitignored, and the file was
   **untracked** — so it could sit there and leave no trace in git whatsoever. The
   local observation and the md5 (`91f5d9e3174dfdbbd695a9b50305cd44`, byte-identical
   to the Uber Eats copy) are the facts. Restored in `docs/DESIGN/source/README.md`
   and `assets/dishes/SOURCES.md`.
2. **The MAD figures are reproducible, not an estimate.** r6 claimed the
   matching-vs-non-matching figures "cannot be re-derived". They were re-run on the
   archive originals with Pillow + numpy (RGB, LANCZOS downscale to 675×900 across
   the full 4×4 set). **The first re-run still got them wrong**: it recorded the
   matching range as `1.25–1.38`, but the measured matching minimum is **1.28**
   (values 1.28, 1.33, 1.39, 1.42) — 1.25 was carried over from r6 and never held.
   Corrected here and in `assets/dishes/SOURCES.md` and
   `legacy-menu-set/README.md`. The only real limitation stands: the lossy 675×900
   **copies** cannot be used for the check — the originals are in
   `docs/archive/menu-board-photos/` and in git.

**r6 — provenance contradictions removed (2026-09-15, docs only)**

No screen, script, stylesheet or photo changed in this revision. It corrects five
claims that did not survive checking — **one of which (item 1) was itself wrong
and is reverted in r7** — because a handoff that overstates what was verified is
worse than one that admits a gap.

1. ~~**The pho's origin was wrong.**~~ **Superseded by r7 — this "correction" was
   itself wrong.** It read a `git ls-tree` result (committed files only) as proof
   that the untracked `menu/images/` folder never existed. The pho **is** the
   kitchen's own file; see r7.
2. **The legacy photos' location was wrong.** `dish-1…4.jpg` are **675×900
   re-encodes** — that is what the set actually carried in
   `mockups/src/assets/dish-1…4.jpg`. Their **1536×2048 originals** are not in
   `docs/DESIGN/source/photos/legacy-menu-set/`; they moved to
   `docs/archive/menu-board-photos/`. The legacy README now says the copies are
   lossy and that the human review has to be done on the originals.
3. **Where those originals went was missing.** §8 described the retired `menu/`
   folder as if only its spec docs, phở photo and admin screenshots had moved, and
   the `docs/DESIGN/` tree in §8 omitted `source/photos/legacy-menu-set/`
   altogether. Both now name the archive folder.
4. **The photo counts were inconsistent.** §1 says 12 localized photos; §8's tree
   said 15. `assets/` holds 12 (hero, family, 10 dishes). Corrected to 12, and
   `mockups/README.md` with it.
5. **The `dish-1…4.jpg` identification was overstated — and then re-verified.** The
   1.28–1.42 vs 42.7–72.3 mean absolute difference is measured on the **archive
   originals** (`docs/archive/menu-board-photos/`), the only place the comparison is
   valid: the 675×900 copies kept for review differ from their originals by −2.3% to
   +2.7% in file size (JPEG re-encoding). Do not try to re-derive it from the copies.
   The conclusion is unchanged.

The same wrong claims were corrected in `docs/DESIGN/source/README.md`
(which also no longer claims *everything* under it is verbatim owner input — the
photo folders are derived working copies) and
`docs/DESIGN/source/photos/legacy-menu-set/README.md`, so the set does not
contradict itself in two places at once.

**r5 — provenance settled (2026-09-15)**

- **Resolved the `dish-1…4.jpg` question, and the answer was "do not use".** They
  are 675×900 re-encodes of the four `menu/*.jpeg` files that
  `src/AsianTaste.API/Data/Migrations/10_clear_unverified_dish_images.sql`
   cleared — the design judge called them **photographs of a printed menu, not
   food**. Proven by downscaling each archive original to 675×900 and comparing
   across the full 4×4 set: mean absolute difference 1.28–1.42 on the matching
   pairs vs 42.7–72.3 elsewhere.
- Dropped the four mappings (`pho-beef`, `banhmi-crispy-pork`, `laksa-chicken`,
  `salad-chicken`) from `scripts/menu-data.js`; those dishes now render the
  woven-initial placeholder. Moved the re-encodes to
  `docs/DESIGN/source/photos/legacy-menu-set/` (the 1536×2048 originals went to
  `docs/archive/menu-board-photos/`) with a README, and rewrote the
  provenance in `assets/dishes/SOURCES.md`, `docs/DESIGN/source/README.md` and
  §5.1. Verified pho (`md5 91f5…`) is now wired to `pho-beef`.
- Corrected the counts: **7 of 81 dishes** carry a real photo, not 10/15.
- `dish-card.html` lead card → Pho (real photo); `asian-taste-menu.html`'s
  favourites row → pho photo + 3 `.fav-media.ph` placeholders; `.fav-media` set
  to `5/4` so the pho shows uncropped.
- Added `NEXT-SESSION-PROMPT.md` (this folder) — the copy-paste kickoff for the
  port into `src/asian-taste-customer` and `src/asian-taste-admin`. It is linked
  from this file's header and from §10 item 0, and listed in
  `docs/DESIGN/README.md` and `mockups/README.md`.

**r4 — landed in the repo (2026-09-15)**

- Copied the whole set into `docs/DESIGN/mockups/src/` (15 screens, both
  stylesheets, four scripts, 15 photos) and this handoff to
  `docs/DESIGN/mockups/HANDOFF.md`.
- Retired the loose repo-root `menu/` folder: its three spec docs and the phở
  photo moved to `docs/DESIGN/source/` (with a provenance README), its admin-UI
  screenshots to `ui-shots/admin-ui-reference/` (gitignored).
- Re-pointed the `menu/…` source references in `DIRECTION.md`, `BRIEF.md` and
  `TOKENS.md`; dropped the now-dead `menu/admin_ui/` line from `.gitignore`.
- Added `mockups/SOURCES.md` and a "Delivered" entry block to `mockups/README.md`.

**r3 — photography + this handoff**

- Captured the full Uber Eats catalogue from the store page's embedded
  `__REACT_QUERY_STATE__` payload (14 sections, 83 items — no per-dish page
  visits needed), and downloaded the 12 real dish photos it exposes.
- Localized 9 into `assets/dishes/` (3 pruned: one is byte-identical to the
  Phở Bò already held, two are packaged drinks with no matching category),
  wired 6 into `scripts/menu-data.js`, and wrote provenance to
  `assets/dishes/SOURCES.md`.
- Media wells moved `16/9` → `4/3`; `.dish-media.is-detail:has(img)` adopts a
  real photo's own ratio so the detail hero shows the full frame.
- Re-linked this handoff to the repo's `docs/DESIGN/mockups/README.md` and
  added the required-mockup → screen mapping (§8), the resume list (§10).

**r2 — mobile + counts**

- Mobile audit at 390 / 430 / 768 with reflow fixes: `.seg-sm` wrapping,
  `.seg-num` horizontal spice scale, `admin-menu` `.mm-row` keeps its toggle,
  `.filterbar` buttons stretch on phones, `hero-stamp` can't overrun the photo.
- Fixed a **navigation dead zone at 761–979px**: the header nav hid at ≤980 but
  the bottom bar only appeared at ≤760, leaving portrait tablets (768px) with no
  navigation. Both now switch at 980, and the floating cart bar clears the bar.
- Fixed a stale copy count: the set claimed "42 dishes"; the data has **81**.
  Counts that appear in prose now derive from `AT_MENU`.

**r1 — anti-AI + palette**

- Killed the label / line-break / value tell system-wide via `.factline`, `.kv`,
  `.facts`; removed the `.panel-head` title→rule→content border. Documented in
  `tokens.html`.
- Palette consolidated: `--tan` (a literal duplicate of `--border`) and
  `--brown-light` removed. Only two creams remain — `--bg` paper + `--border`
  hairline (doubling as the recessed media-well fill). `.btn-tan` → `.btn-gold`.
- Removed the 13 inter-section `border-top` rules in `menu.html`; sticky offsets
  now read `--head-h` (published by `chrome.js`), never a hardcoded 72px.
- Equal card heights: stretched grid + `.dish-foot{margin-top:auto}`.

---

## 10. Resume list — for the next session

Do these in order. **Do not redo** anything marked done.

**Done — leave alone unless something is actually wrong**
- Tokens, type, palette, and the anti-AI primitives (§Phase 1, r1) — locked.
- The 16 screens and all shared scripts/CSS.
- The photo localisation and the 6 dish mappings that came from Uber names
  (§9 r3); provenance is in `assets/dishes/SOURCES.md`. The 7th wired photo is
  the md5-verified pho. **Provenance and paths in this set were corrected on
  2026-09-15 (§9 r6)** — read `docs/DESIGN/source/README.md` before acting on an
  older photo claim.

**Next, in priority order**
0. **Kick off the port.** Copy the prompt in
   [`NEXT-SESSION-PROMPT.md`](NEXT-SESSION-PROMPT.md) into the next session — it
   targets the real app (`src/asian-taste-customer`, `src/asian-taste-admin`) and
   encodes the constraints below.
1. **Verify the photo↔dish pairings.** Open `assets/dishes/` at full size,
   compare against the Uber item names in `SOURCES.md`, and correct
   `scripts/menu-data.js` where a pairing is wrong. This is the one blocker a
   human eye has to close. (The four legacy files are already resolved — see
   §5.1 and §9 r5: **do not** re-wire them without looking at them first.)
2. **Confirm the `home` screen with the owner.** `home.html` is now drawn (r8)
   and closes the gap in §8 — but it was inferred from the same marketplace data
   as `menu.html`, so get the owner to ratify the **order** of the story it tells
   (appetite hook → service type → most-liked three → browse → deal → family →
   one closing action) before the port treats it as settled. The one open content
   question inside it: whether a signed-in customer should instead see a
   "order again" first screen. See §9 r8.
3. **Should Dine-in become Delivery-only?** The order-type selector sells three
   services; the live Uber listing is delivery-only, so confirm which the store
   actually offers before wiring copy.
4. **Ratify, then port tokens first.** Per `docs/DESIGN/mockups/README.md`
   §Ratification: one owner session, one revision, then implementation starts
   tokens (`TOKENS.md`) → components (`COMPONENTS.md`) → screens.
5. **Export the PNGs** into `docs/DESIGN/mockups/` using the naming rule, and
   record the source link in that folder's `SOURCES.md`.

**Known blockers (cannot be closed from inside a design session)**
- The build model cannot read images, so no pairing is visually confirmed.
- The only photo in the set that is not purely a marketplace download is
  `docs/DESIGN/source/photos/pho-beef-noodle-soup.jpeg`, byte-identical to Uber's
  pho photo (`md5 91f5…`). It is now wired to `pho-beef`. There is no separate
  `dishes_image/` drop folder — no further photos arrived before the handoff, and
  the four legacy files were rejected (see §5.1, §9 r5).
- `admin-menu.html` availability toggles persist locally, but there is no real
  API — see the repo's D-02; do not treat admin numbers as production data.
