# Components

## The structural finding this file exists to fix

| App | Primitives layer | Consequence |
|---|---|---|
| **admin** | 15 primitives in `src/components/ui/` (Button, Card, Input, Badge, Table, Dialog, Select, Tabs, Switch, Skeleton, Toast, …) | drift is *contained* |
| **customer** | **none** — no `components/ui/` directory exists | every screen hand-rolls |

That asymmetry is the mechanical cause of the customer app's drift: with no
Button to reuse, `AccountPage` ends up with **65** non-token `gray-*` classes,
`ConfirmationPage` 40, `ItemDetailModal` 30 (defect D-15). The admin app is
cleaner *because* it has primitives — not because it was written more carefully.

**Therefore: the customer app gets a primitives layer in this pass.** That is
the single highest-leverage code change in the UI work, and it is what stops the
drift recurring after the mockups are implemented.

### And the icons are inconsistent in three separate ways

| System | Source | Reality (verified by `grep` over `src/`) |
|---|---|---|
| Heroicons | `@heroicons/react` | **18 files** in the customer app — this *is* the customer app's icon set |
| Lucide | `lucide-react` | **0 imports** in the customer app (an unused dependency) — it is the **admin** app's set, 18 files |
| **Emoji** | hardcoded string literals | **5** customer files: `CategoryNav.tsx`, `SearchFilters.tsx`, `MenuItemCard.tsx`, `ItemDetailModal.tsx`, `HomePage.tsx` |

So there are three distinct inconsistencies:

1. **Across the two apps.** Customer = Heroicons, admin = Lucide. One product,
   two glyph families.
2. **Within the customer app.** The header renders `ShoppingCartIcon`
   (`Header.tsx:139`) while the empty cart renders `ShoppingBagIcon`
   (`CartPage.tsx:50`) — two glyphs for one concept, from the *same* library.
   That is the judged finding *"the header cart icon and the empty-state bag are
   two different bag glyphs at different weights — pick one icon set"*.
   `CartPage.tsx:50` also uses off-token `text-gray-400`, which is what the judge
   read as *"a cool blue-grey… a default icon-library stroke"*.
3. **Emoji alongside both** (see BANNED-01).

**Pick one: Lucide.** The admin app already uses it in 18 files, it has the
complete set we need (shopping bag, utensils, plus, minus, chevron), and its
stroke weight is consistent. Then:

- Migrate the customer app's 18 Heroicons files to Lucide.
- Remove `@heroicons/react` from `src/asian-taste-customer/package.json`
  (`lucide-react` is already a dependency there — it is simply never imported).
- Delete `CategoryNav.tsx`'s emoji map rather than extending it.
- Collapse one glyph per concept (one bag, one cart, one search).

---

## Allowed primitives

**Admin** — reuse, do not fork: `avatar` `badge` `button` `card` `dialog`
`dropdown-menu` `input` `label` `select` `skeleton` `switch` `table` `tabs`
`textarea` `toast`/`toaster` (`src/asian-taste-admin/src/components/ui/`).

**Customer** — to be created, mirroring the admin set and the same token layer:
`Button` `Card` `Badge` `Input` `Select` `Dialog` `Tabs` `Switch` `Skeleton`
`Toast`.

> **Note on `badgeVariants.ts` / `buttonVariants.ts`:** the admin app splits
> variant maps into separate files, which is a workaround for Vite/HMR
> fast-refresh limits on mixed exports. Keep that split when mirroring — do not
> "simplify" it back into the component file.

## New domain primitives

These do not exist in either app and are where most judged defects live:

| Primitive | Replaces | Fixes |
|---|---|---|
| `PriceText` | ad-hoc `$` strings | D-13 — one place that knows `A$`/`$` + 2 decimals + GST-inclusive |
| `CategoryRail` | `CategoryNav.tsx` emoji chips | D-03 (clipping), D-05 (emoji), and the 14-category question |
| `DishCard` | `MenuItemCard.tsx` | D-09 (no photo / "spreadsheet"), D-14 (36px tap target) |
| `ModifierSheet` | `ItemDetailModal.tsx` internals | D-04 (quantity not visible), D-07 (no dialog semantics) |
| `QuantityStepper` | the clipped quantity control | D-04 |
| `EmptyState` | 4 separate hand-rolled empty states | D-10, D-18 |
| `OrderStatusBadge` | per-page status colours | gives the customer app the status scale it lacks |
| `OrderStatusTimeline` | nothing (not designed) | the order-tracking state has no design today |

`DishCard` is the one to design first — it is the most-repeated element in the
product (82 items) and the one that was judged *"visually flat and clinical…
reads as a spreadsheet"*.

---

## Banned patterns

Each of these has already caused a defect in this codebase. This list is the
part of the design system that a linter can enforce.

| ID | Banned | Why | Use instead |
|---|---|---|---|
| **BANNED-01** | **Emoji as UI icons** | `🍽️` is the fallback for **7 of our 14 categories** and three different noodle categories all render `🍜`. Renders differently on iOS/Android/Windows | Lucide. `CategoryNav.tsx`'s icon map is deleted, not extended |
| **BANNED-02** | **Raw hex in a component** | 15 sites outside token definitions; `RevenueChart.tsx:42-53`, `StripeCardPaymentForm.tsx:198-200`. Breaks the theme | A semantic token. If none fits, add the token **first**, in a reviewable diff |
| **BANNED-03** | **Tailwind palette classes** `gray-*` `slate-*` `blue-*` `zinc-*` `neutral-*` | **449 occurrences** across both apps — the single largest source of drift | `--color-text-muted`, `--color-border`, `--color-surface` (see `TOKENS.md`) |
| **BANNED-04** | **Hand-rolling a twin of an existing primitive** | A bespoke `<div>` button sitting next to `Button` | The primitive. If the primitive can't do it, extend the primitive |
| **BANNED-05** | **Element-level heading sizing** | `h1 { font-size: 3rem }` makes every `h1` in every context 48px, including modals and cards | `text-display`/`text-h1` utilities + `font-serif` for display headings |
| **BANNED-06** | **Mixing icon sets or glyphs** | Heroicons (customer) vs Lucide (admin); *two* different bag glyphs inside the customer app; emoji in both. See §And the icons are inconsistent | Lucide, one glyph per concept |
| **BANNED-07** | **Arbitrary Tailwind sizes** `text-[13px]` `min-h-[60px]` `w-[180px]` | 20+ sites; the scale becomes unenforceable | The `--text-*` / spacing scale. Note: arbitrary **colour** values are already at 0 — keep it that way |
| **BANNED-08** | **Inline `style={{}}` for static values** | `MenuGrid.tsx`, `ReportsPage.tsx` | Classes. Inline style only for values computed at runtime |
| **BANNED-09** | **A third decorative use of `accent`** | Gold is on the hero underline, the favourites underline, the upsell card border, the footer headings and the logo — the judged "loudest element" problem | `accent` gets **one** job per screen |
| **BANNED-10** | **Untrue content** | The footer's invented address, hours, Sydney phone number and email (D-01) | Real values or omit the element. **Never a placeholder in a shipped surface** |

## Enforcement tiers

Match the existing guardrail culture in `docs/GUARDRAILS.md`:

| Tier | Check |
|---|---|
| **Fast (pre-commit)** | `grep` gate: no `@heroicons` import in customer, no emoji in `.tsx` string literals, no `gray-`/`slate-`/`zinc-`/`neutral-`/`blue-` palette class, token parity between apps |
| **Mid (CI)** | ESLint rules for BANNED-02/07/08; `tsc` + build |
| **Slow (nightly)** | the existing screenshot loop in `ui-shots/`, re-pointed at the new rubric |

**Important:** the fast grep gate is what turns this document from advice into a
constraint. Ten banned patterns with no check is how the last design system
ended up with 449 non-token palette classes.
