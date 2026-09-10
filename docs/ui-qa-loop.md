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

## What this loop caught on its first run

- **A real API-prefix regression** — `VITE_API_BASE_URL` was set to a bare origin
  (`http://localhost:5070`), dropping the `/api` segment, so every data-loading screen made
  requests to `/menu/...` and got 404s while still rendering. Fixed in
  `src/asian-taste-customer/src/api/client.ts`, which now normalises the value and warns.
- Console errors on 8 of 12 screens (now 0).
- 5 screens carrying `[high]` UI findings — an off-token hero CTA, illegible text over a
  photo, and a clipped category row on mobile. Those are real work items, listed in
  `ui-shots/ui-qa-report.md`.

## What this loop does NOT catch (be honest about it)

- Real interaction bugs, keyboard flow, motion feel — run the app and click through; the
  judge sees one static frame.
- Precise contrast maths — spot-check suspicious pairs with a contrast checker.
- Whether a dish photo is *appetising* — the judge grades layout, not appetites.
- Authenticated screens (admin dashboard/orders/menu/reports/settings) — not captured yet.
- Taste. The judge is a consistency engine; the final "does this feel like a real
  restaurant's site?" call is still a 10-second human look.
