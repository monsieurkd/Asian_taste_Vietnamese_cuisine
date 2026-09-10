# The UI quality loop (`ui:shots` → `ui:judge` → fix → repeat)

Backend features get tests and CI; UI usually gets "vibes". This is the frontend
equivalent — a repeatable, measurable loop you run on every UI change, exactly like a test
suite. Ported from the `voice-debrief` project's UI-QA loop.

```
apps running  →  npm run ui:shots   (Playwright screenshots the key screens)
              →  npm run ui:judge   (a vision LLM scores them against docs/ui-rubric.md)
              →  fix the [high] issues against the tokens → re-run until clean
```

The rubric is the contract, the judge is the CI, and **the tokens in each app's
`src/index.css` are the anchor** that keeps the loop converging instead of drifting. The
judge may never propose a new palette or a redesign.

## Prerequisites (one-time)

```bash
npm install            # repo root: playwright-core + dotenv
```

1. **Both dev servers running** — the API, the customer app, and (for the admin screen) the
   admin app:

   ```bash
   cd src/AsianTaste.API         && dotnet run        # :5070
   cd src/asian-taste-customer   && npm run dev       # :5173
   cd src/asian-taste-admin      && npm run dev       # :5174
   ```

2. **Chrome** — used via `playwright-core` with no browser download. Override with
   `CHROME_PATH=/path/to/chrome`.

3. **A vision API key** in `.env.local` (gitignored — copy the block from `.env.example`):

   ```
   LLM_VISION_API_KEY=sk-…
   LLM_VISION_BASE_URL=https://api.deepseek.com/v1
   LLM_VISION_MODEL=deepseek-v4-flash-vision-exp
   ```

   **DeepSeek note:** `deepseek-v4-flash-vision-exp` is the *only* DeepSeek model id that
   accepts images — sending a screenshot to `deepseek-v4-flash` or `deepseek-v4-pro` returns
   HTTP 400. It is OpenAI-compatible, so any vision provider works by changing these values.

## Run the loop

```bash
npm run ui:shots                       # capture ui-shots/**/*.png (needs the servers)
npm run ui:judge                       # score them -> ui-shots/ui-qa-report.md
npm run ui:qa                          # both, in one command
```

Useful variants:

```bash
npm run ui:shots -- --app=customer          # one app
npm run ui:shots -- --filter=home,menu      # selected screens
npm run ui:judge  -- --filter=home          # judge one screen
npm run ui:judge  -- --fail-on-high         # exit 1 on any [high] or <6/10 → CI gate
```

Covered screens — each at desktop **1280px** and mobile **390px**:

| App | Screens |
|---|---|
| customer | `home`, `menu`, `search`, `cart-empty`, `item-detail` |
| admin | `login` |

## Overriding the base URLs

```bash
UI_CUSTOMER_URL=http://localhost:5173 UI_ADMIN_URL=http://localhost:5174 npm run ui:shots
```

## The discipline (this is where the value is)

1. **Fix `[high]` only.** High = broken, off-token, unreadable, no obvious action. Do those,
   re-run, then look at `[med]`.
2. **Fix against the system.** Change a class to use the right `index.css` token or a
   `src/components/ui/` primitive — never "make it look nicer". Inventing a hex code or an
   odd padding *is* the bug.
3. **Converge, don't drift.** Re-run after fixing. A good screen sits at 7+. If a run
   suggests a redesign, reject it: your job is consistency, the judge's job is catching
   inconsistency.
4. **Treat the report as a diff.** `ui-qa-report.md` is overwritten each run; compare runs to
   see whether a change moved a screen up or down.
5. **Run it before calling a UI change done**, not after the app has drifted for a week.

## Adding screens

Add an entry to `SHOTS` in `scripts/ui-shots.mjs` (name, path, and a `wait` that proves the
page reached its real state — not a skeleton), plus a one-line description in `SCREEN_GUIDE`
in `scripts/ui-judge.mjs`. Keep the two in sync.

**Screens that redirect when state is missing are deliberately not captured** — capturing
them would silently produce a duplicate of the redirect target and the judge would score the
wrong page. `AUTHED_SCREENS_NOT_CAPTURED` in `ui-shots.mjs` lists them, and the report
repeats the list. To close that gap, drive a real login in the script before capturing.

## The judge is noisy — read it as a trend, not a number

**Measured run-to-run variance: ±2 points on identical code.** The same `menu-1280` capture
scored 6, 6, 4 across three consecutive runs with no card changes; `home-390` flipped 6 → 4
just the same. Treat the score as a smoke alarm, not a measurement:

- **Act on the `[high]` findings**, which are far more stable than the score — they name a
  concrete element and a concrete token fix.
- **Ignore small score moves** between runs; they are usually the model, not your change.
- **Some findings are wrong.** Two examples from real runs: it reported the item-detail
  modal as "vertically clipped" when the Add-to-Cart button measured fully on-screen
  (bottom 773px in an 800px viewport), and it flagged `border-accent` as "a raw gold value"
  when `accent` *is* the `#D4AF37` token. Verify a `[high]` against the DOM before acting on it.
- Prefer **fixing against the rubric** (tokens, primitives, real states) over chasing a score.

## CI

`.github/workflows/ci.yml` has a `ui-quality` job that captures, judges, writes the report to
the job summary, and uploads `ui-shots/` as an artifact.

- It **skips itself** when `LLM_VISION_API_KEY` is not configured, so forks and local runs
  are never blocked by a missing secret. Add the secret to enable it.
- The **hard gate is off by default** (`UI_QA_FAIL_ON_HIGH: '0'`). A `--fail-on-high` gate
  would fail unrelated PRs because of the ±2-point variance above and the outstanding
  `[high]` findings. Flip it to `'1'` once those are cleared.

## What this loop caught on its first runs

- **A real API-prefix regression** — `VITE_API_BASE_URL` was set to a bare origin
  (`http://localhost:5070`), dropping the `/api` segment, so every data-loading screen made
  requests to `/menu/...` and got 404s while still rendering. Fixed in
  `src/asian-taste-customer/src/api/client.ts`, which now normalises the value and warns.
- Console errors on 8 of 12 screens (now 0).
- **A systemic font bug** — `--font-family-serif` is not a Tailwind v4 token name (the
  utilities come from `--font-serif`), *and* the base layer forced every heading to the sans
  family, so all headings rendered in the body face. Both fixed in `index.css`.
- **Off-token colours** — the Super Deal upsell used raw `amber-*`/`orange-*`, and the
  "Popular" badge used `bg-yellow-500`; both now use the `accent` token.
- **Duplicate search controls** — the header search auto-opened on `/search` while the page
  also rendered its own field, with no way to tell which was authoritative.
- **A missing search field** — the search page told users to "use the search bar in the
  header" when the header showed only an icon; it now renders a real input.
- **Sub-44px tap target** — the dish card "Add +" button was ~36px tall.

## What this loop does NOT catch (be honest about it)

- Real interaction bugs, keyboard flow, motion feel — run the app and click through; the
  judge sees one static frame.
- Precise contrast maths — spot-check suspicious pairs with a contrast checker.
- Whether a dish photo is *appetising* — the judge grades layout, not appetites.
- Authenticated screens (admin dashboard/orders/menu/reports/settings) — not captured yet.
- Taste. The judge is a consistency engine; the final "does this feel like a real
  restaurant's site?" call is still a 10-second human look.

