# Asian Taste — UI QA rubric (used by `npm run ui:judge`)

The judge (a vision LLM) grades screenshots against this rubric and reports
`[high]` / `[med]` / `[low]` issues plus an `**Overall: n/10**` score.
**This file is the executable spec.** Edit it when the design language changes and the
loop follows automatically.

## The anchor

**The `@theme` block in each app's `src/index.css` is the only source of truth**, plus
the shadcn-style primitives in `src/asian-taste-admin/src/components/ui/`.
The judge may **never** invent a palette or propose a redesign — only name the token or
primitive to use.

### Tokens (both apps)

| Token | Value | Role |
|---|---|---|
| `primary` | `#8B3A3A` | Deep Vietnamese red — primary actions |
| `primary-dark` | `#6B2A2A` | Hover/active on primary |
| `secondary` | `#3C2A21` | Dark brown — headings, structure |
| `accent` | `#D4AF37` | Gold — sparing accent, highlights |
| `accent-red` | `#C30139` | Loud red — promotions only |
| `cream` | `#F5F0E6` | Warm surface |
| `tan` | `#E8DCC8` | Secondary surface |
| `brown-light` | `#D2B48C` | Muted warm |
| `brown-medium` | `#8B4513` | Warm mid-tone |
| `success` / `warning` / `error` | `#4CAF50` / `#F57C00` / `#C62828` | Semantic |

### Admin-only

`sidebar #1C1C1E`, `sidebar-hover #2C2C2E`, `background #F5F5F7`, `card #FFFFFF`,
`border #E5E5E7`, and the order-status scale:
`pending #FF9500`, `confirmed #007AFF`, `preparing #5856D6`, `ready #34C759`,
`completed #8E8E93`, `cancelled #FF3B30`.

### Typography

Exactly two families: **Manrope/Inter** (sans, body + UI) and **Playfair Display**
(serif, headings). A third font is a `[med]`; more than 2–3 visible weights on one
screen is a `[med]`.

### Australian commerce rules (non-negotiable)

- Currency renders as **A$** or **$** with two decimals — never a bare integer like `$12`.
- **GST is included** in displayed prices. A checkout that *adds* a separate tax line to
  the total is a **`[high]`** defect: it double-charges and contradicts Australian
  consumer pricing convention.
- Prices are AUD. A `US$` or `£` anywhere is `[high]`.
- The restaurant is in **Adelaide, SA** — an address or phone that is not Australian is `[high]`.

## Scoring (1–10)

Judge each screenshot on all seven axes, weighted by severity:

1. **Token discipline** — do colours, fonts, radii, shadows look like they come from one
   system, or are there invented values (a hex that is not a token, odd pixel padding, an
   ad-hoc glow)? The smell: one element that doesn't match its siblings.
2. **Readability** — size/weight for the role, contrast of every text-on-background pair,
   nothing clipped, overflowing, or colliding.
3. **Spacing & alignment** — rhythm on the 4px scale, consistent gutters, elements sharing
   edges where they should, no cramped or floating orphans.
4. **Hierarchy & focal action** — the page has ONE obvious primary action, findable within
   ~3 seconds. For the customer app that is almost always "browse the menu" or "add to cart";
   for a filled cart it is "checkout". Secondary actions visibly quieter.
5. **Consistency** — buttons/fields/cards look like the same component everywhere; borders
   and radii match; nothing hand-rolled next to a primitive twin.
6. **Mobile (390px) / responsive** — no horizontal scroll, no clipped text, tap targets
   ≈44px tall, a sane one-column reading flow. Ordering on a phone is the primary use case.
7. **Appetite & trust (product resonance)** — this sells food, and the customer app must
   make the food look *appetising*: warm cream/tan surfaces, a red that reads as
   Vietnamese restaurant rather than corporate, generous imagery. The admin app is the
   opposite — dense, calm, high-clarity, no decoration. Judge each surface against its own
   job: a customer page that feels clinical/cold scores below its technical marks; an
   admin page that wastes space on decoration does too.

Fold them into the single `**Overall: n/10**` (severity-weighted):

- **10** — issue-free; ships as-is.
- **9** — only `[low]` polish notes.
- **6–8** — has `[med]` issues (drop a point or two each).
- **1–4** — broken or off-contract (`[high]`); fix before anything else ships.

## Rules of the judge (non-negotiable — they keep the loop converging)

- **Never prescribe a redesign or a new palette.** Name the `index.css` token or the
  `src/components/ui/` primitive. If the whole design language were wrong, say so in one
  line as `[high]` — but the default is: fix against the system, not against your taste.
- **Judge the static screenshot only.** Don't penalise missing animation or hover states.
  *Do* penalise an empty/loading/error state that looks broken — a state IS design.
- **Concrete beats general.** "The card feels cramped" is incomplete; "the order-summary
  card's internal padding is 20px while sibling cards use 16px (4px rhythm) — align it" is
  a finding.
- **Broken page = 1/10.** Blank canvas, unstyled HTML, visible error/crash text, or a
  horizontal scrollbar on mobile is a hard fail, reported first.
- **Accent is a spice.** If `primary` red appears on more than ~1–2 elements per viewport,
  or `accent` gold appears on non-highlight UI, flag `[med]`+.

## What this loop does NOT catch

- Real interaction bugs, keyboard flow, motion feel — run the app and click through; the
  judge sees one static frame.
- Precise contrast maths — spot-check suspicious pairs with a contrast checker.
- Whether a dish photo is *appetising* — the judge sees the layout, not the appetites.
- Taste. The judge is a consistency engine; the final "does this feel like a real
  restaurant's site?" call is a 10-second human look.
