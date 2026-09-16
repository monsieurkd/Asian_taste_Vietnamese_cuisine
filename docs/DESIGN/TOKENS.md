# Tokens

One system, two apps. This file is the contract; `src/**/index.css` implements it.

## The bug that proves why this file exists

`asian-taste-admin/src/index.css:37` defines:

```css
--font-family-sans: 'Manrope', 'Inter', system-ui, sans-serif;
```

**`--font-family-sans` is not a Tailwind v4 token.** v4 maps `font-sans` to
`--font-sans`. So in the admin app, `font-sans` resolves to Tailwind's default
`ui-sans-serif, system-ui, …` — the admin dashboard has **never rendered in
Manrope**. The customer app already carries a comment explaining this exact
trap (`asian-taste-customer/src/index.css:17-19`), and the admin app still has it.

An independent vision judge found it from a screenshot alone: *"the 'Asian
Taste' wordmark and 'Admin Login' heading render in a bold sans (Manrope/Inter),
not the Playfair Display serif the system reserves for headings"*
(`ui-shots/ui-qa-report.md`). See defect **D-06**.

Fix: rename to `--font-sans` / `--font-serif`, and add the serif to the admin
heading treatment.

---

## Layer model

Three layers, and a rule about which layer code may name:

```
primitive   --at-maroon-700: #6B2A2A        ← raw values. Screens never name these
semantic    --color-primary: var(--at-maroon-600)   ← screens name these
component   --dish-card-bg: var(--color-surface)    ← components name these
```

**Rule:** application code uses **semantic or component** tokens only. A raw hex
in a `.tsx` is a defect. Today: 15 raw hexes outside token definitions, mostly
justified (payment-brand logos) and a few not (`RevenueChart.tsx:42-53`,
`StripeCardPaymentForm.tsx:198-200`).

## Colour

Keep the existing palette — it is fine and it is on-brand. What is missing is
**discipline and parity**, not new hues.

| Token | Value | Change |
|---|---|---|
| `--color-primary` | `#8B3A3A` | keep |
| `--color-primary-dark` | `#6B2A2A` | keep |
| `--color-secondary` | `#3C2A21` | keep |
| `--color-accent` | `#D4AF37` | keep — but restrict to **one** use per screen |
| `--color-cream` | `#F5F0E6` | keep |
| `--color-tan` | `#E8DCC8` | keep |
| `--color-brown-light` | `#D2B48C` | keep |
| `--color-brown-medium` | `#8B4513` | keep |
| `--color-success/warning/error` | `#4CAF50` / `#F57C00` / `#C62828` | keep |
| `--color-status-*` | 6 values | **customer app is missing these** — it has no status scale |
| `--color-sidebar` `--color-background` `--color-card` `--color-border` | admin values | admin-only; **needs a `--color-surface` alias** so a shared component can name a surface in both apps |
| `--color-info` | `#2196F3` | admin-only, undocumented, unused in the guide — confirm or remove |

**Two palette gaps to close:**

1. **The customer app has no status colours** (pending/confirmed/preparing/ready/
   completed/cancelled), which is why the order-tracking screen has nothing to
   design with. Add the same scale.
2. **No neutral ramp.** Both apps fall back to Tailwind `gray-*` for borders,
   muted text and disabled states — that is where the 65/40/30 `gray-*` counts in
   `AccountPage` / `ConfirmationPage` / `ItemDetailModal` come from (defect
   D-15). Define semantic neutrals instead of banning grey:

```css
--color-border:        #E5E5E7;   /* already in admin, promote to shared */
--color-text-muted:    #6B6461;   /* warm-tinted, derived from secondary */
--color-text-subtle:   #8E8884;
--color-surface:       #FFFFFF;
--color-surface-sunken: #F5F0E6;  /* = cream */
```

Then `gray-500` becomes `text-muted`, and the drift has nowhere to come from.

**Never:** `#FF0000` ("vibrant red") and `#FF6B35` ("flame orange") appear in
`docs/DESIGN/source/DESIGN_SYSTEM_STYLE_GUIDE.md` but not in the code. They are unused. Either
adopt them with a defined purpose or delete them from the guide — an unused token
in a style guide is an invitation to drift.

## Typography

**Faces.** Manrope (body/UI), Playfair Display (display headings), Inter as the
documented fallback. All three are loaded in `index.html` for both apps now —
verify the `<link>` survives any change to `index.html`.

**Fix the admin token names** (D-06) and give the admin app a heading treatment:

```css
/* asian-taste-admin/src/index.css */
--font-sans: 'Manrope', 'Inter', system-ui, sans-serif;
--font-serif: 'Playfair Display', Georgia, serif;
```

**Remove the element-level scale — this is a real defect.**

`asian-taste-customer/src/index.css:44-64` sets:

```css
h1 { font-size: 3rem; }   /* 48px — on EVERY h1 in the app */
h2 { font-size: 2.25rem; }
```

That binds **visual size to HTML semantics**. An `<h1>` inside a modal, a card,
or the footer renders at 48px because it is an `h1`. Heading *level* is about
document structure and accessibility; heading *size* is a design decision. They
must be decoupled.

Replace with a named scale used via utilities:

```css
@theme {
  --text-display:  3rem;      /* 48px / 1.05 — hero only */
  --text-h1:       2.25rem;   /* 36px */
  --text-h2:       1.75rem;   /* 28px */
  --text-h3:       1.375rem;  /* 22px */
  --text-body:     1rem;
  --text-caption:  0.8125rem;
}
```

Rule: `font-serif` marks a display heading; the `text-*` utility sets its size.
Neither is implied by the tag.

## Spacing

The style guide says "8-pt grid"; the code uses Tailwind's 4px base. Both are
defensible and they are currently mixed at random. **Adopt this rule:**

- **4px** for intra-component spacing (icon ↔ label, input padding, stack gaps).
- **8px multiples** for layout (between cards, sections, page gutters).

Then the judged defect "the Search button sits flush against the input with no
gap, breaking the 4px rhythm" and "the footer copyright sits very close to the
card's bottom edge" are both violations of a stated rule rather than matters of
opinion — which is what makes them fixable and reviewable.

## Radii

Currently `rounded` (4px) / `rounded-lg` (8px) / `rounded-2xl` (16px) are mixed
with no rule. The guide specifies 8–16px. Define three:

| Token | Value | Use |
|---|---|---|
| `--radius-control` | 8px | buttons, inputs, chips |
| `--radius-card` | 16px | cards, panels, modals |
| `--radius-pill` | 9999px | badges, count pills, status chips |

## Elevation

6 `shadow-xl` uses and no system. Define three levels and stop:

| Token | Use |
|---|---|
| `--shadow-card` | resting cards |
| `--shadow-raised` | dropdowns, popovers |
| `--shadow-overlay` | modals, slide-over cart |

No `shadow-xl` directly in a component.

---

## Parity between the two apps

Both `@theme` blocks are near-duplicates and have already diverged (the customer
app gained a status-free palette and a font fix the admin app never got).

Two options:

1. **Shared file (better).** Move tokens to one CSS file both apps import,
   with the admin-only surface tokens in a second file.
2. **Enforced duplication (cheaper, fits this repo).** Keep two `@theme` blocks
   and add `scripts/check-token-parity.sh` — normalise and diff the shared
   subset, exit non-zero on drift — alongside the existing tiered guardrails in
   `docs/GUARDRAILS.md`.

Given the repo already runs tiered guardrails on commit (`.githooks/pre-commit`),
**option 2 is the pragmatic choice** and it is what I would ship first. It costs
one script and it makes drift a build failure instead of a screenshot finding.
Revisit option 1 if a third surface ever appears.

## Checklist for ratifying this file

- [ ] Admin `--font-family-*` → `--font-sans` / `--font-serif` (D-06)
- [ ] Element-level `h1`–`h6` sizing removed from the customer app
- [ ] Neutral ramp defined; `gray-*` replaced in the three worst files (D-15)
- [ ] Status scale added to the customer app
- [ ] Radii collapsed to three tokens (kills the 6 `rounded-2xl`)
- [ ] Elevation collapsed to three tokens (kills the 6 `shadow-xl`)
- [ ] Unused `#FF0000` / `#FF6B35` either adopted or dropped from the guide
- [ ] `check-token-parity.sh` written and wired into the fast tier
- [ ] Raw hexes in `RevenueChart` / `StripeCardPaymentForm` routed through tokens
