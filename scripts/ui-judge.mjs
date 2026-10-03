#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ui-judge.mjs — score the captured screenshots with a VISION LLM against the
// design rubric in docs/ui-rubric.md.
//
//   npm run ui:judge                        # judge every shot in ui-shots/
//   npm run ui:judge -- --app=customer      # one app
//   npm run ui:judge -- --filter=home,menu  # selected screens
//   npm run ui:judge -- --fail-on-high      # exit 1 if any [high] issue or <6/10
//
// Config (env or .env.local — see .env.example):
//   LLM_VISION_API_KEY   required
//   LLM_VISION_BASE_URL  default https://api.deepseek.com/v1
//   LLM_VISION_MODEL     default deepseek-v4-flash-vision-exp
//     └ DeepSeek: this experimental model id is the ONLY one that accepts
//       images; deepseek-v4-flash / deepseek-v4-pro return 400 for image input.
//       Any OpenAI-compatible vision endpoint works — only the values change.
//
// Reads ui-shots/manifest.json (written by npm run ui:shots). Writes
// ui-shots/ui-qa-report.md. Exit 2 = config error, 1 = judge/API failure.
// ─────────────────────────────────────────────────────────────────────────────
import dotenv from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const OUT_DIR = path.join(ROOT, 'ui-shots')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')
const RUBRIC_PATH = path.join(ROOT, 'docs', 'ui-rubric.md')
const REPORT_PATH = path.join(OUT_DIR, 'ui-qa-report.md')

const API_KEY = process.env.LLM_VISION_API_KEY
const BASE_URL = (process.env.LLM_VISION_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, '')
const MODEL = process.env.LLM_VISION_MODEL ?? 'deepseek-v4-flash-vision-exp'

// One line per screen: the judge must know what the page IS to judge whether its
// primary action is obvious. Keep in sync with SHOTS in ui-shots.mjs.
const SCREEN_GUIDE = {
  'customer/home':
    'The customer ordering landing page: header with the Asian Taste wordmark, a hero ("Vietnamese cuisine, made fresh"), category navigation, and a menu grid of dishes with prices in AUD. Warm, appetising, and it must make "browse the menu and order" the obvious next step.',
  'customer/menu':
    'The full menu list: category navigation plus dish cards (name, description, price, dietary badges). Its job is scannable browsing — prices legible, add-to-cart obvious, categories easy to move between.',
  'customer/search':
    'The search page: a search input with filters and results for menu items. Must feel like a fast path to a specific dish, with a clear empty state when nothing matches.',
  'customer/cart-empty':
    'The shopping cart, captured EMPTY: an empty-state message pointing the customer back to the menu. The empty state IS design — it should look intentional and inviting, not broken or blank.',
  'customer/item-detail':
    'A dish detail modal opened over the menu: dish name, description, price, option/modifier groups, quantity selector, special instructions, and an add-to-cart action. This is the core ordering interaction — the price and the add action must be unmistakable.',
  'admin/login':
    'The admin dashboard login: a centred card with username/password fields and one primary sign-in button. Utilitarian, high-clarity, no marketing flourishes.',
}

/**
 * The design tokens, read from the app rather than typed into this file.
 *
 * THIS USED TO BE A HARDCODED BLOCK, and it was the worse half of a drift that made the
 * whole loop useless: it listed a palette no app ships (`primary/secondary/cream/tan`,
 * an "admin adds a sidebar #1C1C1E"), named Playfair Display for headings after the app
 * had retired it, and offered shadcn primitives (Button, Card, Badge, Tabs…) that do not
 * exist in this codebase. The model was told to enforce tokens that were not there, so it
 * reported correct code as defective — the one thing the rubric forbids.
 *
 * Reading them from the @theme blocks means the prompt cannot disagree with the app, and
 * `scripts/check-rubric-drift.mjs` fails the build if docs/ui-rubric.md drifts too.
 */
function designTokens() {
  const blocks = []
  for (const [label, rel] of Object.entries({
    customer: 'src/asian-taste-customer/src/styles/foundation.css',
    admin: 'src/asian-taste-admin/src/index.css',
  })) {
    const abs = path.join(ROOT, rel)
    if (!existsSync(abs)) continue
    const css = readFileSync(abs, 'utf8')
    const block = css.match(/@theme\s*\{([\s\S]*?)\n\}/)
    if (!block) continue
    const lines = []
    for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      lines.push(`  --${m[1]}: ${m[2].trim()}`)
    }
    blocks.push(`${label} (${rel}):\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}

const SYSTEM = `You are a strict senior product UI reviewer. You grade a screenshot of
"Asian Taste Vietnamese Cuisine", an online ordering site for a real restaurant in
Adelaide, South Australia (two surfaces: a customer ordering app and a staff console).
against a written rubric.

The apps have a LOCKED design system. The @theme blocks below are the ONLY source of
truth, read from the app at the moment this ran. Both surfaces share ONE token set — there
is no separate admin palette, and a colour used on one is valid on the other:

${designTokens()}

There is NO serif in this product. Playfair Display was retired for legibility. Text set
in a serif face is a defect, not a missing token.

The console is styled with plain CSS component classes in src/asian-taste-admin/src/index.css
(.btn, .panel, .stat-card, .pill, .status-pill, .seg-sm, .ticket, .col, .boh-*, .counter-*).
There is no shadcn/ui and no component library in this repo — do NOT tell anyone to swap in
a Button, Card, Badge or Tabs primitive, they do not exist.

Rules of the job:
1. Judge ONLY what is visible in the static screenshot. Do not infer interactivity,
   animation quality or hover states. If the page looks broken (blank, unstyled,
   overlapping, a visible error/crash message, horizontal scroll on mobile), score it
   1/10 and say exactly what is broken.
2. Fixes must be token-level, never raw invented values: name the token from the @theme
   blocks above, or the CSS class to use. Do NOT propose a redesign, and do NOT propose a
   new palette. Before calling a colour invented, check it against the list — if it is
   there, it is correct and reporting it is a false positive.
3. Be concrete and specific to this screenshot. Generic advice ("improve the layout")
   is a failed answer; name the element, the spacing, the colour.
4. Prices are Australian dollars and must render as A$ / $ with two decimals, and GST
   is INCLUDED in displayed prices (never added on top). An order total that adds a
   separate tax line is [high].
5. The console is a DENSE WORKING TOOL, not a marketing page. A packed ticket, small
   repeated controls and a three-column board are correct and must not be reported as
   cramped or crowded. Judge its rhythm against its own siblings, not against the
   storefront.
6. Severity: [high] = breaks the page or the promise (unreadable text, off-token
   colour, no obvious action, overflow, wrong currency/total). [med] = noticeably off
   (inconsistent rhythm, weak hierarchy, slightly low contrast). [low] = polish.
   You may return zero issues. Prefer few, certain findings over many speculative ones.
7. Output EXACTLY this shape, nothing before or after:
   **Overall: <n>/10**
   ## Issues
   - [severity] <what is wrong and where, 1-2 sentences>
   ## Top fix
   <exactly one concrete, token-level fix that moves the score most>`

function fail(code, message) {
  console.error(`ui-judge: ${message}`)
  process.exit(code)
}

function parseArg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) {
    const value = eq.slice(`--${name}=`.length)
    return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null
  }
  const flag = process.argv.indexOf(`--${name}`)
  if (flag === -1) return null
  const value = process.argv[flag + 1]
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null
}

async function judge(shot, rubric) {
  const filePath = path.join(OUT_DIR, shot.app, shot.file)
  const imageB64 = readFileSync(filePath).toString('base64')
  const guide = SCREEN_GUIDE[`${shot.app}/${shot.name}`] ?? `A page at ${shot.path} in the ${shot.app} app.`
  const viewport = `${shot.width}px viewport (${shot.width < 600 ? 'mobile' : 'desktop'})`

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Rubric:\n${rubric}\n\nApp: ${shot.app}\nScreen: ${guide}\nViewport: ${viewport}\n\nGrade this screenshot now.`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 1400,
    // Disable chain-of-thought: DeepSeek's thinking models count reasoning tokens
    // against max_tokens and can burn the whole budget, returning content="".
    thinking: { type: 'disabled' },
  }

  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, attempt * 3_000))
          continue
        }
        break
      }
      const data = await res.json()
      const verdict = data.choices?.[0]?.message?.content?.trim()
      if (!verdict) {
        lastError = 'empty completion (choices[0].message.content missing)'
        continue
      }
      return verdict
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      await new Promise((r) => setTimeout(r, attempt * 2_000))
    }
  }
  throw new Error(`judge API failed after 2 attempts: ${lastError}`)
}

// Severity-weighted score per docs/ui-rubric.md. The model's free-text `Overall`
// can contradict its own issue list (it prints 8 while listing [high] findings),
// so resolve any contradiction deterministically from the counted severities —
// the rubric's number is the one the loop commits to.
//
//   high       -> <=4
//   meds       -> <=8 ; more meds drop further
//   only paint -> >=9
function resolveScore(raw, high, med, low) {
  const base = Number.isFinite(raw) ? raw : 8
  if (high > 0) return Math.min(base, 4)
  if (med > 0) {
    const cap = Math.max(6, 8 - (med - 1))
    return Math.max(6, Math.min(base, cap))
  }
  return Math.max(9, Math.min(base, 9 + (low === 0 ? 1 : 0)))
}

function summarize(verdict) {
  const parsed = Number(/Overall:\s*(\d+)\s*\/\s*10/i.exec(verdict)?.[1])
  const raw = Number.isFinite(parsed) ? parsed : null
  const count = (re) => (verdict.match(re) ?? []).length
  const high = count(/\[high\]/gi)
  const med = count(/\[med\]/gi)
  const low = count(/\[low\]/gi)
  return { raw, score: resolveScore(raw, high, med, low), high, med, low }
}

async function main() {
  if (!API_KEY) {
    fail(
      2,
      `LLM_VISION_API_KEY is not set.\n  Add it to .env.local (see .env.example) — e.g. a DeepSeek key for the\n  ${MODEL} vision model. Any OpenAI-compatible vision endpoint works.`,
    )
  }
  if (!existsSync(MANIFEST_PATH)) {
    fail(2, `no ${path.relative(ROOT, MANIFEST_PATH)} — run "npm run ui:shots" first (needs the dev servers on).`)
  }

  const rubric = existsSync(RUBRIC_PATH)
    ? readFileSync(RUBRIC_PATH, 'utf8')
    : '(rubric file missing — judge on general product-UI quality)'
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

  const appFilter = parseArg('app')
  const screenFilter = parseArg('filter')
  const shots = manifest.filter(
    (s) => (!appFilter || appFilter.includes(s.app)) && (!screenFilter || screenFilter.includes(s.name)),
  )
  if (shots.length === 0) {
    fail(2, `filters matched nothing in the manifest (${manifest.length} shot(s) available).`)
  }

  console.log(`Judging ${shots.length} shot(s) with ${MODEL}…`)
  const rows = []
  const blocks = []
  for (const shot of shots) {
    process.stdout.write(`  ${shot.app}/${shot.file} … `)
    try {
      const verdict = await judge(shot, rubric)
      const s = summarize(verdict)
      rows.push({ ...shot, ...s })
      blocks.push({ shot, verdict, ...s })
      console.log(`score ${s.score ?? '?'}/10, ${s.high} high / ${s.med} med / ${s.low} low`)
    } catch (err) {
      rows.push({ ...shot, score: null, error: err.message })
      console.error(`FAILED: ${err.message}`)
    }
  }

  const md = [
    `# Asian Taste — UI QA report`,
    '',
    `Run: ${new Date().toISOString()}`,
    '',
    `Judge: ${MODEL} — rubric: docs/ui-rubric.md`,
    '',
    '| App | Screen | Viewport | Score | high | med | low |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      r.error
        ? `| ${r.app} | ${r.name} | ${r.width}px | **error** | — | — | — |\n  \`${r.error}\``
        : `| ${r.app} | ${r.name} | ${r.width}px | ${r.score ?? '?'}/10 | ${r.high} | ${r.med} | ${r.low} |`,
    ),
    '',
    '> Fix `[high]` first, against the tokens in `src/index.css` and the primitives in',
    '> `src/asian-taste-admin/src/components/ui/`. Re-run and compare — a good screen sits at 7+.',
    '',
    '## Not covered by this run',
    '',
    'These screens need state the capture cannot create headlessly, so they are **not**',
    'judged. Their absence is a known gap, not a pass:',
    '',
    '- customer/checkout — redirects to /menu with an empty cart',
    '- customer/account — redirects to /menu when signed out',
    '- customer/cart-filled — needs items in the cart',
    '- customer/confirmation — needs a real order number',
    '- admin/dashboard, orders, menu, reports, settings — need an admin JWT',
    '',
    'To close this, extend `SHOTS` in `scripts/ui-shots.mjs` to drive a real login',
    '(and add items to the cart) before capturing — see the `--filter` flow.',
    '',
    '---',
    '',
    ...blocks.flatMap(({ shot, verdict }) => [`## ${shot.app} / ${shot.name} — ${shot.width}px`, '', verdict, '']),
  ]
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, md.join('\n'))
  console.log(`\nReport → ${path.relative(ROOT, REPORT_PATH)}`)

  const errors = rows.filter((r) => r.error)
  const highs = rows.filter((r) => !r.error && (r.high > 0 || (r.score ?? 0) < 6))
  if (errors.length > 0) {
    console.error(`ui-judge: ${errors.length} shot(s) could not be judged (see report).`)
    process.exit(1)
  }
  if (process.argv.includes('--fail-on-high') && highs.length > 0) {
    console.error(`ui-judge: --fail-on-high — ${highs.length} shot(s) have [high] issues or score <6/10.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('ui-judge:', err)
  process.exit(1)
})
