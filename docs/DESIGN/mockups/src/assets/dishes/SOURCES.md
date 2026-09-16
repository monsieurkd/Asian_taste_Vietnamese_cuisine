# Dish photo sources — `assets/dishes/`

Captured 2026-09-15 from the restaurant's own Uber Eats listing.

## Source

| Surface | Tool | Link | Owner | Exported at |
|---|---|---|---|---|
| Dish photos | Uber Eats store listing | https://www.ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA | Asian Taste (merchant photos) | 2026-09-15 |

## How these were obtained

Not by opening each dish page. The store page server-renders its entire
catalogue into an embedded `__REACT_QUERY_STATE__` JSON payload, which carries
every section, item, price, description and `imageUrl`. That payload was
extracted from the rendered page, then each image was fetched from Uber's
public CDN (`tb-static.uber.com`). No per-dish page visits were needed.

**Coverage limit:** Uber Eats lists 83 distinct items but only **21 carry an
image** — 10 food photos and 11 packaged-drink photos. The remaining 62 items
have no photo on the listing, so there is nothing to acquire for them. They
keep the woven-initial placeholder, which is the same honest behaviour the
app's `DishImage` component uses when `image_url` is empty.

Drinks were not imported: the 14-category menu has no Drinks category.

## Mapped into `scripts/menu-data.js`

| File | Native px | Ratio | Uber item name | Our dish id |
|---|---|---|---|---|
| `pho-beef-noodle-soup.jpg` | 550×440 | 1.25 | Pho Beef Noodle Soup | `pho-beef` |
| `rice-paper-rolls.jpg` | 550×768 | 0.72 | Rice Paper Rolls | `cold-rolls` |
| `dimsim-3.jpg` | 550×699 | 0.79 | Dimsim (serve of 3) | `dim-sim` |
| `spring-rolls.jpg` | 550×440 | 1.25 | Spring Rolls | `spring-rolls` |
| `pad-thai.jpg` | 550×440 | 1.25 | Pad Thai | `pad-thai` |
| `combination-noodle-bowl-salad.jpg` | 550×440 | 1.25 | Combination Noodle Bowl Salad | `salad-combination` |
| `crispy-roasted-pork-noodle-bowl-salad.jpg` | 550×453 | 1.21 | Crispy Roasted Pork Noodle Bowl Salad | `salad-crispy-pork` |

## Acquired but with no matching dish

These are real dishes on the Uber Eats listing that do **not** exist in the
81-item menu transcribed from `Menu.md`. Kept in case those dishes are added.

| File | Native px | Uber item name |
|---|---|---|
| `chicken-egg-noodle-soup.jpg` | 550×440 | Chicken Egg Noodle Soup |
| `tender-beef-pepper-soy.jpg` | 550×440 | Tender Beef in Pepper-Soy sauce |
| `crispy-skin-chicken.jpg` | 550×493 | Crispy-skin Chicken |

## Provenance check — settled 2026-09-15

Verified by hash while landing this set in the repo. Two earlier notes in this
file were wrong and are now replaced by checked facts.

**1. The pho photo is first-party, and verified by hash.**

It was supplied locally as `menu/images/Pho Beef Noodle Soup.jpeg` and moved to
`docs/DESIGN/source/photos/pho-beef-noodle-soup.jpeg` during the handoff.
`md5 91f5d9e3174dfdbbd695a9b50305cd44`, 550×440, 34 KB — **byte-identical to the
Uber Eats pho photo**, so the two copies are one file, not a look-alike. That is
expected rather than suspicious: a restaurant uploads its own photo to its own
listing. It is the strongest asset in the set, and it is wired to `pho-beef` as
`pho-beef-noodle-soup.jpg`.

The `menu/images/` path does not show up in git because the file was **untracked**.
`git ls-tree HEAD menu/` lists only committed files, and `menu/images/` was never
gitignored, so an untracked file there leaves no trace in history — git cannot
confirm or deny it. An earlier revision of this file read that absence as proof the
folder never existed; that conclusion was wrong. The observation that the file sat
there, and the md5, are the facts that hold.

**2. `dish-1…4.jpg` are the four images the repo already rejected.**

- The four loose `menu/*.jpeg` files (UUID-named, 1536×2048) are exactly the
  "four images sitting in the repo's `menu/` directory" that
  `src/AsianTaste.API/Data/Migrations/10_clear_unverified_dish_images.sql`
  cleared, after the design judge reported they are **photographs of a printed
  menu, not of food** — *"they make the food look unappetising."* Those originals
  are now at `docs/archive/menu-board-photos/`.
- `assets/dish-1…4.jpg` were 675×900 re-encodes of those four files. Verified by
  downscaling each archive original to 675×900 (LANCZOS) and comparing across the
  full 4×4 set: mean absolute difference **1.28–1.42** on the four matching pairs
  versus **42.7–72.3** on every non-matching pair — so the mapping is 1:1 in the
  order in the table below. Re-run this on the **archive originals**
  (`docs/archive/menu-board-photos/`), never on the 675×900 copies, which are lossy
  re-encodes that differ from their originals by −2.3% to +2.7% in file size.
- Because a menu-board photo in a dish slot misleads the customer about the dish
  — the repo's own migration calls it *"worse than no image at all"* — the four
  dish mappings (`pho-beef`, `banhmi-crispy-pork`, `laksa-chicken`,
  `salad-chicken`) were **dropped**, and the four 675×900 re-encodes were moved
  out of the design set to `docs/DESIGN/source/photos/legacy-menu-set/` for human
  review. Their 1536×2048 originals now live at
  `docs/archive/menu-board-photos/`, and also remain in git history:
  `git show HEAD:menu/01768f38-81a8-4bfa-8934-7b4c40e67919.jpeg > out.jpeg`.

If a human looks at `legacy-menu-set/` and finds they are in fact food
photographs, they can be restored — but that is an owner decision, not a default.

**Current photo coverage: 7 of 81 dishes.** 6 Uber photos (table above) plus the
verified pho. The other 74 render the woven-initial placeholder.

## Ratio policy

Every remaining photo comes from the one marketplace source, so its ratios are
at least homogeneous in origin: **0.72–1.25** (portrait → landscape). The
uniform 0.75 set is gone (see above).

- Files are stored at their **native ratio** — no destructive pre-cropping.
- Uniform wells use `object-fit: cover`. The card-level wells sit at `4/3`,
  which cuts the landscape photos by ~6% instead of ~30%.
- `.fav-media` (the single-file prototype's favourites row) is `5/4` — exactly
  the landscape photos' ratio — so the pho shows uncropped.
- The dish-detail hero adopts the photo's own ratio, so its full frame shows.

Before promoting any of this to production, review the set at full size.
Marketplace photos carry marketplace cropping, and the repo's own
`10_clear_unverified_dish_images.sql` exists because an unreviewed photo set
shipped once already.
