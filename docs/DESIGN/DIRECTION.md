# Art direction

Three directions, one recommendation. **The choice is the owner's** (BRIEF.md
O11) — this document exists so the choice is between three considered options
rather than a blank page.

---

## First, the brand truth

What we actually know, and nothing more:

| Known | Source |
|---|---|
| Vietnamese cuisine, family-run, one shop at 329 Henley Beach Rd, Brooklyn Park | `docs/archive/ASIAN_TASTE_PRD_superseded.md:12` |
| **82 items across 14 categories** — a broad suburban Vietnamese menu, not a phở specialist | live API `[V]` |
| Prices A$5.80–A$25.00, GST included, pickup-first | `docs/DESIGN/source/Menu.md` |
| The venue's POS is Lightspeed K-Series | `docs/archive/ASIAN_TASTE_PRD_superseded.md:26` |
| On Uber Eats, so the owner has already photographed some dishes | `REFERENCES.md` |
| Manrope + Playfair Display are the intended faces | `docs/DESIGN/source/DESIGN_SYSTEM_STYLE_GUIDE.md:55-68` |

What we **don't** know, and must not invent: the story, the family, the tagline,
whether the food is northern/southern/Central Vietnamese, what neighbourhood
regulars call it. **Everything below is provisional until O7 is answered.**

### The name problem, stated once

**"Asian Taste" is generic.** It is not Vietnamese, it does not say *what* the
food is, and it could belong to any of a thousand places. That is a large part
of why the UI feels unowned — the design is working with a name that gives it
nothing to hold onto. "Asian Taste Vietnamese Cuisine" is doing the work that a
name should do.

This is not a demand to rename a trading shop. But it means the **dish names,
the Vietnamese language and the address must carry the identity instead.** That
is not a workaround; it is the strongest asset this shop has, and all three
directions below lean on it.

**The single highest-value idea in this whole folder:** set the Vietnamese dish
name on the dish card, next to the English one. `Cold rolls` / `Gỏi cuốn`.
`Noodle Soup` / `Phở`. It costs nothing, needs no photography, and it is exactly
what the customer says at the counter. Phở Nguyễn does this and it is the reason
their photo-less menu works.

---

## Direction A — **Bảng hiệu** (*signboard*)

**Premise.** Vietnamese street signage and shop menu-boards: dense, confident,
type-led, unafraid of a bold condensed headline and a loud accent colour. The
menu *is* the design. No apology for the absence of photography.

| | |
|---|---|
| **Type** | One high-contrast display face for dish names + Vietnamese, one clean sans for prices/meta. Playfair can survive as the display face but it is currently doing generic-restaurant duty; a condensed grotesque would say *sharper* |
| **Colour** | Keep `#8B3A3A` as the anchor, but use it as a **block** — a solid header, a solid category ticker — not as scattered buttons. Cream `#F5F0E6` as the page. Gold `#D4AF37` almost eliminated, reserved for one thing |
| **Hierarchy** | Dish name is the largest element on the card. Price is second. Vietnamese name third, in the accent colour |
| **Photography** | **Not required.** Optional later |
| **Signature move** | The category rail as a horizontal "ticker" band in solid primary with the 14 categories readable one-thumbed |
| **Risk** | Low execution risk, medium taste risk — type-led menus fail if the type is timid. This direction lives or dies on the display face |
| **Cost** | Lowest. Zero photography. One display font |
| **Blocked on** | O5 (logo) only |

**This is the one I would build**, because it is the only direction that is
**not blocked on assets we do not have**.

---

## Direction B — **Bàn ăn** (*the dining table*)

**Premise.** Warm, generous, appetite-first. Large photography, food as hero,
the "gather around" feeling of a family Vietnamese table. The conventional
restaurant direction, done properly.

| | |
|---|---|
| **Type** | Playfair Display for headings (it fits here), Manrope for everything else |
| **Colour** | The existing warm palette finally justified — cream, tan, gold as a genuine warm light |
| **Photography** | **Essential and blocking.** Minimum ~12–15 dish photos, ideally 25, shot consistently (same light, same angle, same background) |
| **Signature move** | Oversized hero with a real dish, and a dish card that leads with the photo |
| **Risk** | **High if photos are bad or inconsistent.** One grainy iPhone photo among six studio shots is worse than none. This direction makes the asset list the critical path |
| **Cost** | Highest. A$150–400 photographer, or the owner's Uber Eats assets as a free starting point — with the consistency caveat |
| **Blocked on** | **O1** (Uber assets) or **O8** (budget). Cannot start until photos exist |

---

## Direction C — **Quán** (*the eatery*)

**Premise.** Efficiency over expression. Closest to the Uber Eats mechanics: dense
cards, fast scanning, minimal ornament, everything optimised for one-thumbed
ordering. Utilitarian and honest.

| | |
|---|---|
| **Type** | Single sans, tight scale, no display face |
| **Colour** | Near-monochrome with one accent for the primary action |
| **Photography** | Optional |
| **Risk** | Lowest risk, **least distinctive** — it is the direction that looks most like a template, which is the criticism we are trying to answer |
| **Blocked on** | Nothing |

**Useful as a fallback**, and its information density is worth stealing into
either other direction. Not recommended as the identity.

---

## Recommendation — sequence, don't choose once

**Build A now, earn B later.**

1. **Now:** Direction A. It is not blocked, it is cheap, and it turns the shop's
   real asset — Vietnamese dish names — into the identity. This is the direction
   that fixes "it looks like a template" without a photography budget.
2. **In parallel:** request O1 (the owner's Uber Eats assets). Free.
3. **Later:** when a consistent, decent photo set exists, layer **B's** warmth on
   top of **A's** structure — swap the dish card's type-only layout for a photo
   layout. That is a component swap, not a redesign, because A and B share the
   token layer.

This ordering matters because B is where the friend's criticism really lands
("AI slop" is largely "generic stock photo + generic warm palette"), and B is
the only thing blocked on the owner. Don't let the blocker stall the fix.

## How to choose

| Criterion | A · Bảng hiệu | B · Bàn ăn | C · Quán |
|---|---|---|---|
| Not blocked on assets | ✅ | ❌ | ✅ |
| Answers "looks like a template" | ✅ | ✅ | ❌ |
| Works with the Uber photos when they arrive | ✅ | ✅ | ⚠️ |
| Cost | Lowest | Highest | Lowest |
| Risk of looking worse than today | Low | **High** if photos are inconsistent | Low |
| Distinctly *Vietnamese* | ✅✅ | ✅ | ❌ |

## What still needs the owner before mockups are final

- **O7 — the story.** If the owner says "my mother's recipe from Bến Tre", the
  hero copy and the accent detail change. Do not write copy before asking.
- **O5 — the logo.** The only logo artifact the repo ever held was a 6-byte file
  containing the text `-logo` (since deleted). The wordmark design
  cannot be settled without it.
- **O1 — the photos.** Determines whether B is achievable at all.
