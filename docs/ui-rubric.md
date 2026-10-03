# Asian Taste — UI QA rubric (used by `npm run ui:judge`)

The judge (a vision LLM) grades screenshots against this rubric and reports
`[high]` / `[med]` / `[low]` issues plus an `**Overall: n/10**` score.
**This file is the executable spec.** Edit it when the design language changes and the
loop follows automatically.

> **This file had drifted from the app, and that made the loop useless.**
> Until 2026-10-02 it specified a palette and a typeface the shipped code does not use —
> 15 of its 23 colours were absent from both apps, and it demanded **Playfair Display** for
> headings, which `foundation.css` explicitly retires (*"retired for legibility — do not
> reintroduce a serif on headings"*). The judge therefore penalised correct code for using
> the right tokens, in the exact terms this rubric forbids ("never prescribe a new
> palette"). Every token below was read out of the `@theme` block that ships; see
> **Keeping this file true** at the bottom for the check that stops it drifting again.

## The anchor

**The `@theme` block in each app's CSS is the only source of truth**, plus the
component classes in the same file:

- admin — `src/asian-taste-admin/src/index.css`
- customer — `src/asian-taste-customer/src/styles/foundation.css`

The judge may **never** invent a palette or propose a redesign — only name the token or
class to use. If a colour on screen is not in the table below, **it is not a token**, and
that is the finding; if it IS in the table, it is correct and must not be reported.

### Both apps use ONE identical token set

Verified: the two `@theme` blocks agree on all 24 shared tokens. A colour is not
"customer-only" or "admin-only" — there is one system.

| Token (CSS variable) | Value | Role |
|---|---|---|
| `--color-bg` | `#F5F0E6` | Warm cream page background |
| `--color-surface` | `#FFFFFF` | Cards, panels, ticket bodies |
| `--color-fg` | `#3C2A21` | Deep brown — all body and heading text |
| `--color-muted` | `color-mix(fg 66%, bg)` | Secondary text, captions, `.meta` |
| `--color-border` | `#E8DCC8` | The tan hairlines on every card and table |
| `--color-accent` | `#8B3A3A` | Maroon — primary actions, active nav |
| `--color-gold` | `#D4AF37` | Gold — sparse highlight, `.eyebrow-gold` |
| `--color-deal` | `#C30139` | Loud red — promotions, warnings, money not taken |
| `--color-spicy` | `#FF5722` | Heat indicator |
| `--color-gf` | `#4CAF50` | Gluten-free / "done" green |

Derived tokens (do not report these as invented — they are `color-mix` of the above, and a
screenshot cannot distinguish them from their sources):
`--color-accent-soft`, `--color-accent-line`, `--color-fg-soft`, `--color-fg-line`,
`--color-gold-soft`, `--color-on-dark`, `--color-on-dark-dim`.

**Radii:** `--radius-sm: 8px`, `--radius: 10px`, `--radius-lg: 16px`. A value that is not
one of these three is a finding; anything else on the 4px scale is not.

### There are NO admin-only colour tokens

Earlier versions of this file listed a separate admin palette (`sidebar #1C1C1E`,
`background #F5F5F7`, `card #FFFFFF`, `border #E5E5E7`, and an iOS-style order-status scale
of `#FF9500 #007AFF #5856D6 #34C759 #8E8E93 #FF3B30`). **None of those exist in the
codebase.** The admin console is the same cream/brown/tan system as the storefront, and its
dense, calm character comes from layout and type — not from a dark chrome. Do not ask for a
sidebar colour, a `#F5F5F7` background, or an iOS status ramp.

### Typography

Exactly two families, both loaded in `index.html`:

- **`--font-display` = Plus Jakarta Sans** — headings (`h1`–`h6`), the wordmark, stat values.
- **`--font-body` = Manrope** — everything else, including all UI text and prices.

`--font-sans` maps to the body face and `--font-serif` to the display face, so Tailwind's
`font-sans`/`font-serif` resolve correctly.

**There is no serif in this product.** Playfair Display was retired for legibility; text
set in a serif face is a defect, not a missing token. More than 2–3 visible weights on one
screen is a `[med]`.

### Australian commerce rules (non-negotiable)

- Currency renders as **A$** or **$** with two decimals — never a bare integer like `$12`.
- **GST is included** in displayed prices. A checkout that *adds* a separate tax line to
  the total is a **`[high]`** defect: it double-charges and contradicts Australian
  consumer pricing convention.
- Prices are AUD. A `US$` or `£` anywhere is `[high]`.
- The restaurant is in **Adelaide, SA** — an address or phone that is not Australian is `[high]`.

## The two surfaces are not the same product

Judge each against its own job. This is the single biggest source of wrong findings.

**Customer app** (`asian-taste-customer`) — sells food. Warm cream surfaces, generous
imagery, appetite first, a red that reads as a Vietnamese restaurant rather than a bank.
Space spent on making food look good is correct, not waste.

**Staff console** (`asian-taste-admin`) — runs a shift. Dense, calm, glanceable, **no
imagery and no decoration**. It is used standing up, one-handed, with a customer waiting
and often on a tablet. Concretely:

- **Information density is a feature.** A packed ticket is not "cramped". Padding that
  would be stingy on a marketing page is *correct* here, because the alternative is
  scrolling during service — `KitchenPage`'s own comment measures a column at 417px and
  treats a narrower one as the bug.
- **Repeated, small, high-contrast controls are correct.** `.btn` at 38–46px with 13–15px
  text, `seg-sm` chips at 38px, one tick row per dish.
- **Density means the accent budget must be tighter, not looser.** One maroon action per
  ticket; gold only on an age/urgency signal.
- **A screen that shows nothing is not automatically broken.** `board-empty` ("Nothing
  here."), `items-empty` ("This order has no items recorded.") and `.state-block` are
  deliberate states. A quiet screen with a sentence is a pass; a *blank* one is a fail.

## Scoring (1–10)

Judge each screenshot on all seven axes, weighted by severity:

1. **Token discipline** — do colours, fonts, radii, shadows look like they come from one
   system, or are there invented values (a hex that is not in the table above, odd pixel
   padding, an ad-hoc glow)? The smell: one element that doesn't match its siblings.
2. **Readability** — size/weight for the role, contrast of every text-on-background pair,
   nothing clipped, overflowing, or colliding.
3. **Spacing & alignment** — rhythm on the 4px scale, consistent gutters, elements sharing
   edges where they should, no cramped or floating orphans. **For the console, judge
   rhythm against its siblings, not against a marketing page.**
4. **Hierarchy & focal action** — the page has ONE obvious primary action, findable within
   ~3 seconds. For the customer app that is almost always "browse the menu" or "add to cart";
   for a filled cart it is "checkout". On the console it is the stage advance on a ticket.
   Secondary actions visibly quieter.
5. **Consistency** — buttons/fields/cards look like the same component everywhere; borders
   and radii match; nothing hand-rolled next to a primitive twin.
6. **Mobile (390px) / responsive** — no horizontal scroll, no clipped text, tap targets
   ≈44px tall, a sane one-column reading flow. Ordering on a phone is the primary use case.
7. **Appetite & trust (product resonance)** — for the customer app: does the food look
   *appetising*? For the console: does it look like a tool a kitchen would trust at 7pm on a
   Friday — legible, unfussy, and honest about state? A console page that wastes space on
   decoration scores below its technical marks, and so does a customer page that feels clinical.

Fold them into the single `**Overall: n/10**` (severity-weighted):

- **10** — issue-free; ships as-is.
- **9** — only `[low]` polish notes.
- **6–8** — has `[med]` issues (drop a point or two each).
- **1–4** — broken or off-contract (`[high]`); fix before anything else ships.

## Rules of the judge (non-negotiable — they keep the loop converging)

- **Never prescribe a redesign or a new palette.** Name the token from the table above or
  the component class in `index.css`. If the whole design language were wrong, say so in one
  line as `[high]` — but the default is: fix against the system, not against your taste.
- **Before reporting a colour as invented, check it against the table.** If it matches a
  token, it is correct. Reporting `#8B3A3A` as "a raw red" is a false positive, not a finding.
- **Judge the static screenshot only.** Don't penalise missing animation or hover states.
  *Do* penalise an empty/loading/error state that looks broken — a state IS design.
- **Concrete beats general.** "The card feels cramped" is incomplete; "the order-summary
  card's internal padding is 20px while sibling cards use 16px (4px rhythm) — align it" is
  a finding.
- **Broken page = 1/10.** Blank canvas, unstyled HTML, visible error/crash text, or a
  horizontal scrollbar on mobile is a hard fail, reported first.
- **Accent is a spice.** If `--color-accent` appears on more than ~1–2 elements per viewport,
  or `--color-gold` appears on non-highlight UI, flag `[med]`+. Same for `--color-deal`,
  which is reserved for promotions and for money that has not been taken.
- **Distinguish "off-contract" from "not to my taste".** A finding must name the token or
  class that should be used instead. If you cannot name one, it is not a finding.

## Known false positives (verified against the DOM — do not "fix" these)

The judge is a vision model reading a static frame, and it has produced findings that are
demonstrably wrong. Each was checked with a DOM probe before being rejected:

| Reported | Reality |
|---|---|
| Item-detail modal "vertically clipped, Add to Cart cut off" | The button measured fully on-screen (bottom 773px in an 800px viewport); the modal's scroll container reported `canScroll: true`. Scrollable by design. |
| "View Menu" uses "a raw white border" | Computed style is `rgb(245, 240, 230)` — exactly `--color-bg`, via `.btn-outline-light`. |
| Super Deal card "raw gold… not the accent token" | The classes are `border-accent` / `bg-accent/10`, and `--color-accent` **is** #D4AF37. |
| Search page shows "only a grey spinner" with no empty state | No spinner exists; the empty state renders "Search Our Menu" copy plus a clear-filters action. |
| Menu prices "render as bare integers (`$15.5`)" | Every price renders with two decimals (`$15.50`); the API returns `15.50`. |
| Category row "clipped with no scroll affordance" (mobile) | Intentional horizontal scroll with a visible edge fade; verified present in the DOM. |
| **"ON THE LINE" stat card is a raw dark surface, not the `card` token** | `.stat-card.is-accent` is deliberate, documented in `index.css`: the first card marks the live number and the accent budget is one loud thing per screen. |
| **The revenue value "uses a serif font that is not Playfair Display"** | The app has **no serif at all** — `--font-display` is Plus Jakarta Sans, and Playfair was retired for legibility. This finding appears when the rubric lists the wrong font; it is always wrong. |
| **The "Reconnecting" cue "uses a raw red dot and gold text that do not match the warning token"** | `.live-dot` / `.live-dot.is-off` is the connection cue, styled from the same tokens as the rest of the chrome. The window it appears in is the WebSocket being genuinely disconnected in a headless capture. |
| **A board column split into three narrow cards is "squeezed"** | Three stage columns side by side IS the board. Its whole purpose is seeing every stage at once; a one-column stack would defeat it. |
| **"Mark ready" and "Open" of near-equal weight** | Deliberate and documented: the stage advance is primary, `Open` is `btn-secondary`. Two adjacent buttons is not a hierarchy failure when one is filled and one is outlined. |
| **The "How would you like it?" band is "a full-bleed dark brown bar that is not in the token table… a fourth dark value"** | It is `background: var(--color-fg)` — the listed token, at full strength, on purpose. A dark bar against a cream page is one value, not four. The model reads a large dark area as "an invented surface" even when it is the darkest token in the set. |
| **A gold eyebrow plus a gold star pushes "past the sparse-highlight role"** | `.eyebrow-gold` is a documented class and star ratings are gold by convention. Counting gold *appearances* per viewport is the wrong test — the rubric's budget is about gold on non-highlight UI, not about how many highlights a page has. |
| **The storefront hero is "a blue-lit photo of a window or glass with lens flare… a broken or placeholder asset"** | The hero is a genuine iPhone photo, but it **is** wrongly oriented — see [#7](https://github.com/monsieurkd/Asian_taste_Vietnamese_cuisine/issues/7): the file carries an EXIF rotation flag, so a landscape photo is cropped to half inside a 16:10 frame. The finding is real; the described cause ("watermark", "placeholder") is fiction. Recorded so nobody hunts for a watermark. |

**A note on acting on these.** A vision model can be right about *where* to look and wrong
about *why*. Both hero findings above pointed at a real defect while describing something
that does not exist. Check the DOM before changing code — and when the finding is real but
the reason is not, fix the defect and record the correction here.


**Before acting on a `[high]`, check the DOM.** If the computed style or geometry contradicts
the finding, record it here rather than changing working code.

## Keeping this file true

`scripts/check-rubric-drift.mjs` parses both `@theme` blocks and this file, and fails when:

- this file names a colour that is in neither app's tokens, or
- an app ships a token this file does not list, or
- this file names a font family the `@theme` blocks do not declare.

It runs as part of `check-ci-integrity.sh`, so a design-language change and this file move
in the same commit or CI goes red. That is the mechanism that stops the drift above from
recurring — it is not a promise to be careful.

## What this loop does NOT catch

- Real interaction bugs, keyboard flow, motion feel — run the app and click through; the
  judge sees one static frame.
- Precise contrast maths — spot-check suspicious pairs with a contrast checker.
- Whether a dish photo is *appetising* — the judge sees the layout, not the appetites.
- Taste. The judge is a consistency engine; the final "does this feel like a real
  restaurant's site?" call is a 10-second human look.
- **Anything about the console's density or the board's layout.** Those are product
  judgements with reasons recorded in `docs/TODO.md` §17 and §22; the judge should report
  only token and consistency defects there.
