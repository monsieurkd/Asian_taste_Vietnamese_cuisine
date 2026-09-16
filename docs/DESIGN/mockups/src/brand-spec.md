# Asian Taste — Brand Spec

Source: `DESIGN_SYSTEM_STYLE_GUIDE.md` (user-provided). Values below are read from that
document, not invented. Warm, family-oriented Vietnamese kitchen in Brooklyn Park, Adelaide.

**One sentence:** A warm cream-and-maroon Vietnamese kitchen — cream paper, deep-brown
panels, gold highlight, and one deep maroon accent reserved for action and price.

## Core tokens

| Token | Hex (source) | OKLch | Role |
|---|---|---|---|
| `--bg` | `#F5F0E6` | `oklch(0.955 0.012 85)` | Page background (cream paper) |
| `--surface` | `#FFFFFF` | `oklch(1 0 0)` | Cards, drawer, raised areas |
| `--fg` | `#3C2A21` | `oklch(0.301 0.027 45)` | Primary text, dark panels |
| `--muted` | derived | `oklch(0.53 0.022 65)` | Secondary text — `color-mix(in oklch, var(--fg) 65%, var(--bg))`; the guide's neutral `#666666` warmed toward the brand brown |
| `--border` | `#E8DCC8` | `oklch(0.897 0.030 85)` | Hairlines, card borders — and the recessed fill for photo wells and quiet bands |
| `--accent` | `#8B3A3A` | `oklch(0.446 0.086 25)` | Deep maroon — primary CTA fill, price, active indicator |

### Supporting brand colors (observed in the guide, kept as semantic tokens)

| Token | Hex | Role |
|---|---|---|
| `--gold` | `#D4AF37` | Highlights, eyebrows on dark, deal numerals |
| `--deal` | `#C30139` | Urgent deal red (badges) |
| `--spicy` | `#FF5722` | Spicy dot indicator |
| `--gf` | `#4CAF50` | Gluten-free / vegan dot indicator |

Two creams only — `--bg` paper and `--border` hairline/well. The earlier `--tan`
(`#E8DCC8`, an exact duplicate of `--border`) and `--brown-light` (`#D2B48C`,
a third near-cream on the secondary button) were folded into those two so the
palette reads as warm paper rather than a gradient of beiges.

## Type

- **Display:** `'Plus Jakarta Sans', -apple-system, 'Segoe UI', system-ui, sans-serif` — headings only.
- **Body:** `'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`.
- **Mono/numerics:** none in brand — numerics render in Manrope with tabular figures.

## Observed rules

1. Cream (`--bg`) never pure white; white is reserved for cards and the drawer.
2. Deep-brown (`--fg`) fills anchor dark bands — menu header, order bar, footer, deals.
3. Gold is the highlight on dark only; it never carries body text on light.
4. Maroon `--accent` marks action and price; it is never a background wash.
5. Dietary marks are colored **dots** on neutral outline pills, not saturated fills —
   keeps text contrast at AA while staying readable.
6. Corner radius 10–16px, soft warm shadows, generous 8-pt spacing.
