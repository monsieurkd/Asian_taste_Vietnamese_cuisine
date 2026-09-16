# Legacy `menu/` photo set — held, not used

Four photos that used to sit loose in the repo-root `menu/` folder. They are the
675×900 re-encodes the design set carried as
`docs/DESIGN/mockups/src/assets/dish-1…4.jpg`, saved here under the same names so
a human can look at them. The full-resolution originals (1536×2048, UUID-named)
are in `docs/archive/menu-board-photos/`, and in git
(`git show HEAD:menu/<uuid>.jpeg`). **They are not used anywhere in the design
set.**

**The re-encode is lossy, so the pixels here are not evidence.** `dish-1…4.jpg`
are small JPEG re-saves. Judging whether these are photographs of food has to be
done on the originals in `docs/archive/menu-board-photos/`.

## Why they were pulled

They are the four images the repo already ruled on.
`src/AsianTaste.API/Data/Migrations/10_clear_unverified_dish_images.sql` cleared
them after the design judge reported:

> "[high] The dish card images are photos of a printed menu, not of food — the
> text on them is illegible and they make the food look unappetising."

That migration's own words: placing a menu-board photo in a dish's image slot is
*"worse than no image at all."*

## How the identity was established

`docs/DESIGN/mockups/src/assets/dish-1…4.jpg` were 675×900 re-encodes of
`docs/archive/menu-board-photos/`'s four 1536×2048 files. Proof: downscale each
archive original to 675×900 and compare across the full 4×4 set — mean absolute
difference is **1.28–1.42** on the four matching pairs and **42.7–72.3** on every
non-matching pair, so the mapping is 1:1 in the order in the table below.
(**These re-encodes are lossy** — run any re-check on the archive originals, never
on the copies in this folder.)

| Here | git original (`git show HEAD:<path>`) | Native px | Was mapped to |
|---|---|---|---|
| `dish-1.jpg` | `menu/01768f38-81a8-4bfa-8934-7b4c40e67919.jpeg` | 1536×2048 | `pho-beef` |
| `dish-2.jpg` | `menu/346c54ed-8d15-4d09-a8f6-f0994ed321cb.jpeg` | 1536×2048 | `banhmi-crispy-pork` |
| `dish-3.jpg` | `menu/548dd033-2223-42d9-a9e9-7f168dbe70f1.jpeg` | 1536×2048 | `laksa-chicken` |
| `dish-4.jpg` | `menu/e9c06ce8-b8a5-4c63-8ec1-5ea74347e620.jpeg` | 1536×2048 | `salad-chicken` |

Those four mappings were dropped, so those dishes now render the woven-initial
placeholder instead.

## What to do with them

Open the **originals** in `docs/archive/menu-board-photos/` at full size. If they
are in fact food photographs — and the judge was looking at something else —
`dish-1…4.jpg` here can be restored to `docs/DESIGN/mockups/src/assets/` and
re-wired in `mockups/src/scripts/menu-data.js`. If they are photos of a printed
menu, as the migration says, delete this folder: the originals live in
`docs/archive/menu-board-photos/` and in git history, and nothing references the
copies here.

Do not restore them without that human check. That is the exact mistake
migration 10 was written to undo.
