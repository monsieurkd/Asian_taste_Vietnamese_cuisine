# Design sources

The raw inputs the design work was built from. These lived in a loose `menu/`
folder at the repo root; they were moved here on 2026-09-15 during the mockup
handoff, so the design inputs sit with the design docs instead of in a stray
top-level directory.

The three spec docs are the owner's originals, kept **verbatim** so every claim
in `docs/DESIGN/` and `docs/DESIGN/mockups/` can be traced back to its source.
The photo folders are derived working copies; their provenance is recorded below,
including the claims that could not be verified.

| File | What it settles | Read by |
|---|---|---|
| [`Menu.md`](Menu.md) | 14 categories, ~81 dishes, AUD prices, printed option groups | `../DIRECTION.md`, `../mockups/src/scripts/menu-data.js` |
| [`DESIGN_SYSTEM_STYLE_GUIDE.md`](DESIGN_SYSTEM_STYLE_GUIDE.md) | the intended faces and palette | `../TOKENS.md`, `../mockups/src/brand-spec.md` |
| [`MENU_LANDING_PAGE_SPECS.md`](MENU_LANDING_PAGE_SPECS.md) | landing-page section/component spec | `../COMPONENTS.md`, `../mockups/src/menu.html` |
| [`photos/pho-beef-noodle-soup.jpeg`](photos/) | the phở photo — **md5-verified** against the Uber Eats copy, and wired to `pho-beef` | `../mockups/src/assets/dishes/pho-beef-noodle-soup.jpg` |
| [`photos/legacy-menu-set/`](photos/legacy-menu-set/) | four 675×900 re-encodes the repo's migration 10 rejected — **held for human review, unused** (the 1536×2048 originals are in [`docs/archive/menu-board-photos/`](../../archive/menu-board-photos/)) | `photos/legacy-menu-set/README.md` |

## Provenance of `photos/`

**`pho-beef-noodle-soup.jpeg`** — a 550×440, 34 KB JPEG, md5
`91f5d9e3174dfdbbd695a9b50305cd44`. That md5 **is** byte-identical to the pho
photo served by the restaurant's Uber Eats listing, so the two are one file, not
a look-alike. It is kept here at an ASCII-safe name so scripts can open it, and
it is the photo now wired to `pho-beef`.

It was supplied locally as `menu/images/Pho Beef Noodle Soup.jpeg` and moved here
during the mockup handoff. That path leaves no trace in git because the file was
**untracked**: `git ls-tree HEAD menu/` lists only *committed* files (the three
spec docs and the four UUID-named photos), and `menu/images/` was never
gitignored, so an untracked file sitting there would appear nowhere in history.
Git can neither confirm nor deny the path; the local observation and the md5 are
what stand. An earlier revision read the `git ls-tree` result as proof the folder
never existed — it only proved the file was never committed.

**`legacy-menu-set/`** — four **675×900** JPEGs, `dish-1…4.jpg`. These are the
re-encodes the design set carried as
`../mockups/src/assets/dish-1…4.jpg`. The full-resolution originals (1536×2048,
UUID-named) are **not here** — they moved to
[`docs/archive/menu-board-photos/`](../../archive/menu-board-photos/). Both sets
are the images
`src/AsianTaste.API/Data/Migrations/10_clear_unverified_dish_images.sql` cleared
after the design judge reported they are photographs of a **printed menu, not
food**. They are held here only so a human can confirm that. See
`photos/legacy-menu-set/README.md` for the identity proof (each original matches
its re-encode by downscale comparison) and for what to do if the judge was
mistaken.

## Not here

- The four full-resolution UUID-named photos are **not** in this folder. They
  moved to [`docs/archive/menu-board-photos/`](../../archive/menu-board-photos/)
  on 2026-09-15, and remain in git history (`git show HEAD:menu/<uuid>.jpeg`).
  Only the 675×900 re-encodes are kept under `photos/legacy-menu-set/`.
- The current admin-UI screenshots that were in `menu/admin_ui/` were moved to
  `ui-shots/admin-ui-reference/`. That path is gitignored on purpose — local
  reference only, never committed (`.gitignore`).
- Nothing else came out of `menu/`: the three spec docs and the phở photo are
  listed above, and the four UUID photos are in the archive folder.
