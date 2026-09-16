# Next session — UI rewrite kickoff prompt

Copy everything between the rules into a fresh session. It is written to be
self-contained; it names its own source files rather than assuming memory.

---

## Mission

Port the finished, ratified design set in `docs/DESIGN/mockups/src/` into the two
real front-ends, so the running apps match the mockups pixel-for-pixel in
structure and token-for-token in style:

- `src/asian-taste-customer/` — React 19 + Vite + TypeScript + Tailwind v4 + Zustand
- `src/asian-taste-admin/` — React 19 + Vite + TypeScript + Tailwind v4 + React Query

This is a rebuild and replace job against existing, working screens since the old one is every bad. try to not change the routing shape, do not touch the API, and do not invent features the mockups do not show. The aim is too completely delete the old UI and replacing the new UI to make it look better. routing using existing backend code. Make the design modular for a professional design repo and avoid ai slop 

## Read these first, in this order

Paths are relative to the repo root. Files 2–5 live in `docs/DESIGN/mockups/src/`.

1. `docs/DESIGN/mockups/HANDOFF.md` — the port contract. Its **§3 "The port plan,
   in order"** is the sequence; **§9** is what already changed; **§10** is the
   do-not-redo list. This file supersedes memory.
2. `docs/DESIGN/mockups/src/brand-spec.md` — the locked tokens and type scale.
3. `docs/DESIGN/mockups/src/styles/app.css` — the customer design system; this is
   the reference implementation of those tokens.
4. `docs/DESIGN/mockups/src/styles/admin.css` — staff-console chrome.
5. `docs/DESIGN/mockups/src/tokens.html` — open it in a browser; it is the live
   token + component sheet you QA against.
6. `AGENTS.md` — commands, conventions, known traps. `docs/TODO.md` is the live
   state of the project.

**A note on paths in files 1–5:** `HANDOFF.md` writes every path relative to
`mockups/src/` (it says so itself), so its `styles/app.css` means
`docs/DESIGN/mockups/src/styles/app.css`. When a path here and a path there
disagree, the repo root wins.

Open `docs/DESIGN/mockups/src/index.html` in a browser before writing any code.
Every screen is one click away. You cannot copy what you have not looked at.

**One of those five has moved since this file was written.** The admin app never
declared fonts that Tailwind could see: `src/asian-taste-admin/src/index.css` used
`--font-family-sans` / `--font-family-serif` instead of Tailwind v4's
`--font-sans` / `--font-serif`, so it rendered in a fallback face. As of
2026-09-15 the type half of that is already fixed. **Re-check before you "fix" it
again** — `grep -n "font-sans\|font-serif\|font-family" src/asian-taste-admin/src/index.css`.
Item 1 (the palette tokens) is untouched and still needs the port.

## Hard constraints — violating one of these is a failed port
- **The palette is closed.** Only `--bg #F5F0E6`, `--surface #FFFFFF`,
  `--fg #3C2A21`, `--border #E8DCC8`, `--accent #8B3A3A`, plus the supporting
  `--gold #D4AF37`, `--deal #C30139`, `--spicy #FF5722`, `--gf #4CAF50`. There is
  no `--tan` and no `--brown-light` — both were deleted as duplicates. `--tan`'s
  job is done by `--border`; `--brown-light` is gone.
- **Display face is Plus Jakarta Sans** (`--font-display`), body is **Manrope**.
  Playfair Display was retired for legibility. Load both via the font import in
  `index.css`; do not leave Playfair wired to headings.
- **No raw hex outside the token block.** If you need a colour that has no token,
  stop — it is a sign the design set already has an answer and you missed it.
- **One accent per screen, used at most twice.** The red is for the single most
  important action, not for chrome.
- **Every `<section>` in the mockups carries a `data-od-id`.** Keep the equivalent
  identity in the components you build (a stable `id`/`data-*` per region) so the
  UI-quality loop can still address regions.
- **Do not add comments that restate the code.** Match the existing "explain why,
  cite the incident" tone in this repo.

## What is actually wrong today — fix these

These were concrete, verified mismatches between the running apps and the mockups
when this file was written. **Re-verify each one before acting on it** — the
status column says what the last check found, and any code change since invalidates
it.

1. **Both `index.css` files are on the retired palette.** *(holds — re-checked
   2026-09-15)*
   `src/asian-taste-customer/src/index.css` and
   `src/asian-taste-admin/src/index.css` still declare `--color-tan: #E8DCC8` and
   `--color-brown-light: #D2B48C`. The design set removed both. Replace the token
   block with the mockups' set (map `--color-cream` → the paper `--bg`, and treat
   `--color-tan` usage as `--border`), then delete the dead tokens so nothing
   silently keeps using them.
2. **Headings are still Playfair Display.** *(holds — re-checked 2026-09-15)*
   The customer `index.css` maps `h1..h6` to `--font-serif` (Playfair). The locked
   display face is Plus Jakarta Sans. Swap it, and add Plus Jakarta Sans to the
   font import — it is not currently loaded at all (the import pulls Inter,
   Manrope and Playfair only).
3. **The admin app's fonts never applied.** *(fixed 2026-09-15 — do not redo)*
   It used to define `--font-family-sans` / `--font-family-serif`; in Tailwind v4
   the utilities map to `--font-sans` / `--font-serif`, so those two lines
   generated **no utility** and the admin rendered in a fallback face. The names
   are now `--font-sans` / `--font-serif`. The customer file carries a comment
   about exactly this trap — read it before touching font declarations.
4. **Real location content is still placeholder.** *(holds — re-checked
   2026-09-15)* `src/asian-taste-customer/src/App.tsx` footer says
   `123 Main Street / Suburb, State 1234` and `(02) 1234 5678`. The mockups carry
   the real details (Brooklyn Park, Adelaide; `Australia/Adelaide` timezone). Port
   the real values and delete the lorem — the street address and the live phone
   number are both in the Uber Eats listing quoted in
   `src/assets/dishes/SOURCES.md`.
5. **Screens, one-for-one.** *(structural — still to do)* Each mockup maps to a
   live component; port the *markup and rules*, keep the *data plumbing*:
   | Mockup (`docs/DESIGN/mockups/src/`) | Live target (in `src/asian-taste-customer/src/` unless noted) |
   |---|---|
   | `menu.html` | `pages/MenuLayout.tsx` + `components/menu/MenuGrid.tsx`, `MenuItemCard.tsx`, `components/layout/CategoryNav.tsx` |
   | `dish-card.html` | `components/menu/MenuItemCard.tsx` variants |
   | `dish-detail.html` | `components/menu/ItemDetailModal.tsx`, `ModifierGroupSection.tsx` |
   | `cart.html` | `pages/CartLayout.tsx`, `components/cart/CartItem.tsx`, `CartSummary.tsx` |
   | `checkout.html` | `pages/CheckoutPage.tsx` + `components/checkout/*` |
   | `confirmation.html` | `pages/ConfirmationPage.tsx` |
   | `states.html` | empty/loading/error states across the customer app |
   | `admin-*.html` | `src/asian-taste-admin/src/pages/{Login,Dashboard,Orders,OrderDetail,MenuManagement}Page.tsx` |
   | `tokens.html` | QA reference for every screen above |

   The customer app also carries four screens the mockup set does not cover —
   `pages/HomePage.tsx`, `SearchPage.tsx`, `AccountPage.tsx`, and the
   `Header`/`Hero`/`SearchFilters` components. **Restyle them to the same tokens
   and primitives; invent no new design for them.** `home` is a known gap
   (`HANDOFF.md` §8, §10 item 2) — it needs an owner decision, not a guess.
   The `Header` also renders a `footer` from `App.tsx`, which is where item 4's
   lorem lives.

## Port order

Follow `HANDOFF.md` §3. In short: **tokens → data model → primitives →
behaviour → screens.** Concretely:

1. Tokens: both `index.css` files, fonts included, dead tokens deleted.
2. Primitives: buttons, pills, the `.factline`/`.kv`/`.facts` family, media wells
   — from `styles/app.css` and `styles/admin.css`, as Tailwind components or
   `@layer components` classes. Do not copy the mockups' class names into JSX
   blindly; translate them, but keep the computed values identical.
3. Customer screens in this order: menu → dish detail → cart → checkout →
   confirmation → states.
4. Admin: login → dashboard → orders → order detail → menu management.

Keep the anti-AI rules: no "label / line-break / value" tell (use the factline
primitives), no title→rule→content border on panels, equal card heights via a
stretched grid, sticky offsets read from a published `--head-h`, never a
hardcoded `72px`.

## Content and data

- `docs/DESIGN/mockups/src/scripts/menu-data.js` — 14 categories, 81 dishes — is
  the **agreed shape** for the port. Port it verbatim to the customer app's
  `src/asian-taste-customer/src/types/menu.ts` plus its data layer. Do not assume
  `types/menu.ts` is
  already it: it is a different, hand-rolled shape today (230 lines, last
  touched Feb 2026), and the API
  is the real source at runtime. Treat `menu-data.js` as the contract the API
  response should be mapped into, not as a file to overwrite blindly.
- **Photography is partial — 7 of 81 dishes have a photo, and that is correct
  behaviour, not a bug.** Six came from the Uber Eats listing; the seventh is the
  pho photo, md5-identical to the listing's own copy. The rest render the
  woven-initial placeholder, which matches
  the app's existing `DishImage` contract when `image_url` is empty. Do **not**
  fabricate photos and do **not** restore the four rejected legacy files
  (`docs/DESIGN/source/photos/legacy-menu-set/`) — they are photographs of a
  printed menu board, not food, and the repo's migration
  `10_clear_unverified_dish_images.sql` cleared them for that reason.
- Provenance and per-file ratios: `docs/DESIGN/mockups/src/assets/dishes/SOURCES.md`.
  Copy the images into each app's `public/` (neither app has one yet beyond
  `vite.svg`) or the API's static path, and rewire the paths — do not hotlink
  `tb-static.uber.com`.
- The six Uber photo↔dish pairings are inferred from item names, not visually
  confirmed. A human should look before this ships; treat them as data, easy to
  correct, and flag it in the PR.

## Verify — do not call it done without these

From `AGENTS.md`, run in each app touched:

```bash
cd src/asian-taste-customer && npm run build && npm run lint && npm test
cd src/asian-taste-admin    && npm run build && npm run lint && npm test
```

`npm run build` (`tsc -b && vite build`) is the strongest frontend check in the
repo. Also:

- Diff each ported screen against its mockup at **390px and 1280px** (the design
  set was built and audited at both). The admin is **tablet-first** — check 768px.
- Screenshot the running app against the mockup and look at them side by side;
  the repo already has `npm run ui:shots && npm run ui:judge` for this.

## Do not

- Do not change the API, routing shape, or Stripe flow.
- Do not treat `admin-*.html` numbers as production data — admin demo data is
  mocked (see `HANDOFF.md` §4).
- Do not re-litigate tokens, type or palette — they are ratified and locked
  (`HANDOFF.md` §9 r1, §10 "Done — leave alone").

## First three actions

1. Open `docs/DESIGN/mockups/src/index.html` and click through all 16 screens.
2. Read `HANDOFF.md` §3 and §9–§10.
3. Rewrite `src/asian-taste-customer/src/index.css`'s token + font block to match
   `brand-spec.md` (`docs/DESIGN/mockups/src/brand-spec.md`), then run
   `npm run build` to prove nothing referenced a token you deleted. Expect this to
   fail on the first pass **and to need a sweep, not just a rename**: the dead
   tokens are referenced from JSX as well as CSS, so `npm run build` will not
   catch all of it. As of 2026-09-15 that is 6 references inside the customer
   `index.css`, 4 in the admin `index.css`, and 13 more in customer `.tsx` files
   as `bg-tan` / `border-tan` / `hover:bg-tan` (CategoryNav, SearchFilters,
   DishImage, QuantitySelector, CartItem, SearchPage, HomePage). `--tan`'s job is
   now `--border`; there is no replacement for `--brown-light`, so those call
   sites need a decision from `brand-spec.md`, not a mechanical rename.

Report back with: what you changed, the build/lint/test result. Don't ask, execute, test to verify and iterate. including
`docs/DESIGN/`, which this prompt treats as read-only input.
