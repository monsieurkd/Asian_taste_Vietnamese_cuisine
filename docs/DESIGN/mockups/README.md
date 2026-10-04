# Mockups

Where design mockups live, what they must cover, and where the real assets go
when they arrive.

## Delivered — read this first

The mockup set is in. Start here:

| Read | For |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | The port contract — what ships, phase order, brand rules, known gaps, resume list |
| [`NEXT-SESSION-PROMPT.md`](NEXT-SESSION-PROMPT.md) | Copy-paste kickoff for the port into the real apps (`src/asian-taste-customer`, `src/asian-taste-admin`) |
| [`SOURCES.md`](SOURCES.md) | Provenance for this folder (tool, link, owner, capture date) |
| [`src/`](src/) | The clickable set — 16 screens, both stylesheets, the four scripts, 10 localized dish photos. Open `src/index.html` |

`src/` is the **source**; the PNG exports the rules below describe are drawn
from it and are not committed yet. Everything in this folder maps to the
"must draw" checklist further down — see `HANDOFF.md` §8 for the screen →
requirement table.

## Published on the admin domain

The staff-console set in [`admin-console/`](admin-console/) is served read-only
by the admin app at **`/design/admin-console/index.html`**. It is copied
verbatim into `src/asian-taste-admin/public/design/admin-console/` so Vercel
ships it — the deploy build only packages `src/asian-taste-admin/`, so the
`docs/` copy alone is never reachable on the web. When the set changes, copy it
across again; the `design/` path is excluded from the SPA rewrite in
`src/asian-taste-admin/vercel.json`. The console's Overview screen links here.

## Where to put your Open Design mockups

**`docs/DESIGN/mockups/`** — exports go here, in the repo, versioned with the
code they describe.

```
docs/DESIGN/mockups/
  SOURCES.md                        ← the tool links (see below)
  ratify/
    direction-a-home-1280.png       ← the 2–3 options being chosen between
    direction-b-home-1280.png
  customer/
    home-default-1280.png
    home-default-390.png
    menu-default-390.png
    menu-default-1280.png
    dish-card-anatomy-1280.png
    item-detail-qty2-390.png
    cart-empty-390.png
    cart-filled-390.png
    checkout-payment-390.png
    confirmation-390.png
  admin/
    login-1280.png
    dashboard-1280.png
    orders-1280.png
    order-detail-1280.png
    order-detail-tablet-1024.png
    menu-management-1280.png
  tokens/
    palette.png
    type-scale.png
    components.png                  ← the primitive sheet
```

### Rules

1. **Do commit** PNG exports (2× where practical). They are the reviewable
   artifact — a mockup a reviewer can't open in a diff is not a review.
2. **Do not commit** design-tool binaries (`.fig`, `.xd`, `.sketch`). They don't
   diff, they bloat, and they lock the source to one vendor. Export instead.
3. **Record the source link** in `SOURCES.md`: the file URL, who owns it, and
   which commit the exports were taken at. An export with no link back to its
   source is a dead end the moment it needs updating.
4. **Naming:** `<app>-<screen>-<state>-<width>.png`. The `state` segment is not
   optional — `cart-empty` and `cart-filled` are different designs, and this is
   the exact gap that let the empty state ship undesigned (`INVENTORY.md`).
5. **Keep each export under ~500 KB.** Optimise before committing.
6. **ASCII-safe names**, because these will be opened by scripts.

### SOURCES.md template

```markdown
| Surface | Tool | Link | Owner | Exported at |
|---|---|---|---|---|
| customer + admin | Open Design | <url> | <name> | commit abc1234 |
```

## What the mockups must cover

The minimum set, mapped to `INVENTORY.md`. Anything missing here will be
improvised in code, which is how the current UI happened.

**Must draw (customer)**
- [ ] `home` — 390 **and** 1280 (mobile scored 6/10, the weakest screen)
- [ ] `menu` — the 14-category navigation, 390 first
- [ ] `dish-card` anatomy — **the most important single artifact**, 82 items depend on it
- [ ] `item-detail` with modifiers, and with quantity > 1
- [ ] `cart` empty **and** filled
- [ ] `checkout` step 1, step 2, and processing
- [ ] `confirmation` with a live order status
- [ ] all four shared states: **empty · loading · error · sold-out**

**Must draw (admin)**
- [ ] `login` (fix the serif heading — D-06)
- [ ] `dashboard` at tablet size (the kitchen device, O10)
- [ ] `orders` list with filters
- [ ] `order-detail` with the status change control
- [ ] `menu-management` — **only if the fake API is made real** (D-02). Do not
      design a screen whose backend returns `Id = 0`
- [ ] the 6 order statuses as a visible scale

**Must draw (system)**
- [ ] `tokens/palette`, `tokens/type-scale`
- [ ] `tokens/components` — the primitive sheet, which is what stops the
      customer app hand-rolling a fourth button

**Deliberately not drawn:** `/about`, `/order`, `/contact` (stubs), `/account`
(being deleted), delivery tracking (out of scope).

## Where dish photos will actually land when they arrive

Photography is **data-driven, not a frontend asset**. The pipeline already
exists end to end:

```
menu_items.image_url  →  MenuItemDto.ImageUrl  →  <DishImage src={...} />
   (column exists)         (DTO exists)            (component exists)
```

- The column exists but **the seed never populates it** (`DishImage.tsx` doc
  comment; `src/AsianTaste.API/Models/Entities/MenuItem.cs:26`).
- Migration `10_clear_unverified_dish_images.sql` deliberately cleared a bad
  attempt: four images in `menu/` were pointed at dishes, and the judge caught
  that they are **photographs of a printed menu board, not of food** — *"[high]
  … they make the food look unappetising."* That was the right call and it is
  worth not repeating.
- `DishImage` degrades by rendering **nothing** when there is no photo, which is
  the honest behaviour for a menu with no photography.

So when the Uber Eats merchant assets (O1) or a photo shoot (O8) arrive:

1. Store the files (a `public/` directory or object storage — object storage is
   correct once there are hundreds; at 82 items a committed directory is fine).
2. Populate `menu_items.image_url` via a seed/migration.
3. **Check consistency before wiring them up.** Mixed sources (Uber's crops at
   various aspect ratios alongside one studio shot) will fail the same way the
   menu-board photos failed. If the Uber set is inconsistent, that is an argument
   for `DIRECTION.md` **A** over **B**, not a reason to ship bad photos.

## Ratification

Mockups are ratified by the owner **once**, in a single session, against
`DIRECTION.md`. One revision after. Then `README.md`'s status table is updated
and implementation starts — tokens first (`TOKENS.md`), then components
(`COMPONENTS.md`), then screens.
