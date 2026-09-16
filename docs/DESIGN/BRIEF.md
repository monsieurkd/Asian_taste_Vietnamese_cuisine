# Design brief

## The problem, stated plainly

The apps look like what they are: a competent engineering system wearing a
default theme. The defects are not "the wrong hex code" — they are the absence
of a point of view, and a set of concrete correctness bugs that make the shop
look careless to a paying customer.

Two facts frame the whole brief:

1. **This is a real shop taking real money.** 329 Henley Beach Rd, Brooklyn
   Park, Adelaide SA 5032. It is live, it takes Stripe payments, and it is
   currently offering Klarna, Zip and Link to customers by accident
   (`docs/TODO.md` item 2).
2. **The customer never compares us to a design portfolio.** They compare us to
   the Uber Eats tab already open in the next tab. That is the bar, and it is
   the right bar.

## Audience

**Primary — the customer, mid-evening, on a phone, new to the site.** Probably
arriving from the shop's Instagram or a Google search, possibly standing in
traffic, definitely not reading. Their only question is *"can I see food I want
and buy it in under two minutes?"* They are ordering **pickup**, for a family on
Henley Beach Rd.

What they actually need from us:
- To see what a dish *is* — and for a Vietnamese menu, what it is *called in
  Vietnamese*, because that is what they will say at the counter.
- To know the price without arithmetic (GST is included; never add a tax line).
- To trust it. A fake phone number in the footer destroys that instantly.

**Secondary — the owner.** Working from a tablet in the kitchen during service,
glancing at a screen. Needs: what just came in, is it paid, what do I make.
Not a data tool. Not a chart wall.

**Out of scope for this pass — no delivery riders, no driver app, no
multi-location.** Delivery is out of scope for v1 (`docs/archive/MAJOR_UPDATE_PLAN_superseded.md:212`).
Pastagogo runs six Adelaide sites and outsources ordering to Bopple; we do not
need to build for that shape. Build for one shop on Henley Beach Rd.

## Goals

| # | Goal | How we will know |
|---|---|---|
| G1 | A first-time visitor can identify a dish and reach "Add to cart" without hesitation | 5-person test; the primary action is found without prompting |
| G2 | The menu is scannable at 14 categories without hunting | Category navigation usable one-thumbed on 390px |
| G3 | The shop looks like *itself*, not like a themed template | Vietnamese dish names on the surface; real photography or a deliberate type-led alternative |
| G4 | Nothing on screen is untrue | Zero placeholder business data; every rendered price is the real price |
| G5 | Both apps read as one product | One token source; the admin app renders in the brand font |

## Non-goals

- Not a redesign of the ordering *logic*. The browse → item → cart → checkout →
  confirmation path is working and well tested (117 tests). We restyle it; we do
  not re-architect it.
- Not a delivery experience, rider tracking, or dine-in table ordering.
- Not a marketing site. `/about`, `/order` — see §Dead surfaces below.
- Not a component library exercise. We reuse what exists; we stop *inventing*
  what does not.

## Constraints

- **Both apps in one pass**, one token source. A shared system is the whole
  point; the admin app's broken font token is proof of what happens otherwise.
- **Prices are GST-inclusive** (Australian convention). Never a tax line.
- **Currency renders as `$` or `A$` with two decimals.** `Price Range ($)` in
  `SearchFilters` violates this — a judged defect.
- **Timezone `Australia/Adelaide`.** "Open now" must be computed in Adelaide,
  not from the browser, and must survive a customer in another timezone.
- **The kitchen device is an unknown.** Assume a ~10" tablet, portrait and
  landscape, glanceable at arm's length in a bright kitchen.
- **Photography may not exist.** Assume we may ship a photo-less menu. Pho
  Nguyen does exactly this and it works — see `REFERENCES.md`.

## Dead and untrue surfaces (fix or delete — do not design around them)

| Surface | Problem | Evidence |
|---|---|---|
| Footer location | `123 Main Street / Suburb, State 1234` | `App.tsx:70-73` |
| Footer hours | Invented: `Mon-Fri: 11am - 9pm` | `App.tsx:79-82` |
| Footer phone | `(02) 1234 5678` — an **02 Sydney** number for an Adelaide shop | `App.tsx:89` |
| Footer email | `info@asiantaste.com` — a domain the shop does not own | `App.tsx:90` |
| Footer copyright | `© 2026` | `App.tsx:96` |
| `/privacy`, `/terms`, `/accessibility` | Rendered as links; **no such routes exist** | `App.tsx:98-102` |
| `/order`, `/about`, `/contact` | Render `"… - Coming Soon"` | `App.tsx:47-49` |
| Hero imagery | A random Unsplash photo of a different restaurant, loaded at 1920px remotely | `Hero.tsx:10-11` |
| Tagline | `"Taste of Happiness"`, `"made fresh daily with love"` — invented | `Hero.tsx:23-26`, `App.tsx:63` |
| `menu/design-review.md` (deleted) | 6-byte file containing `-logo`, removed in the repo cleanup | repo history |

The real address is in `docs/archive/ASIAN_TASTE_PRD_superseded.md:12` and `docs/DESIGN/source/Menu.md:3`. **The real
phone and opening hours are not recorded anywhere in the repo** — they are owner
input, below.

## What we need from the owner

Everything below is blocking. None of it is guessable.

| # | Ask | Blocks | Why |
|---|---|---|---|
| O1 | **Uber Eats merchant portal access** (or the original photo files) | G3, photography | The shop is on Uber Eats: `ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA`. The owner uploaded their own dish photos there. Those are **their own assets** — the legitimate, free, 10-minute route to real photography. |
| O2 | **Opening hours**, real, per day | Footer, "open now", order cutoff | Nothing recorded in the repo; the shipped values are invented |
| O3 | **Phone number** | Footer, contact | Shipped value is a Sydney number |
| O4 | **Email address they actually read** | Footer, order receipts | `info@asiantaste.com` is not theirs |
| O5 | **The logo** | Every screen | The repo's only logo artifact was a 6-byte file containing `-logo`, now deleted |
| O6 | **Domain** | Trust, Apple Pay, email | Apple Pay is gated on a registrable domain (`docs/TODO.md` item 3) |
| O7 | **The real tagline**, in the owner's voice | Hero | "Taste of Happiness" is invented. Ask what the shop means to them — a family recipe, a street in Vietnam, a grandmother |
| O8 | **Photo permission/budget**, if O1 fails | G3 | ~15–25 dishes, A$150–400 for a local photographer |
| O9 | **Which dishes are actually popular** | "Customer Favorites" | Must be true. Currently whatever the seed says |
| O10 | **The kitchen device** (iPad? Android? size?) | Admin layout | Determines the admin breakpoints |
| O11 | **Who approves design decisions — one person** | Everything | Design by committee is how you get 65 `gray-*` classes on one page |

## Success measures

The real measure is orders. Until there is traffic, measure the proxies:

1. **Zero `[high]` findings with zero untrue content** — the existing judge loop,
   plus a manual check that every rendered fact is real.
2. **A 5-person unmoderated test**: find a dish, add it, reach checkout. Target
   4 of 5 unaided.
3. **The loop's scores rise *and* its rubric is replaced** — a conformance score
   against a system we just replaced is meaningless. See `README.md`.
