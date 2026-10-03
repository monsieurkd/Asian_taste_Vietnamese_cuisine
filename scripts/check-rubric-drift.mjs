#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-rubric-drift.mjs — the guard that stops docs/ui-rubric.md going stale.
//
// WHY THIS EXISTS. The rubric is the executable spec for the vision judge, and it had
// silently drifted from the app: it named 15 colours that exist in neither front-end and
// demanded Playfair Display for headings, which foundation.css explicitly retires
// ("retired for legibility — do not reintroduce a serif on headings"). The judge then
// penalised CORRECT code for using the right tokens — precisely the behaviour the rubric
// forbids — and nobody noticed, because a judge scoring a good screen 4/10 looks like the
// screen's fault.
//
// The rubric itself now says "this file is the executable spec; edit it when the design
// language changes and the loop follows automatically". That only holds if something
// checks. This is that something.
//
// Read-only: parses the two @theme blocks and the rubric, and compares.
//
//   node scripts/check-rubric-drift.mjs        # exit 1 on drift
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const APPS = {
  admin: 'src/asian-taste-admin/src/index.css',
  customer: 'src/asian-taste-customer/src/styles/foundation.css',
}
const RUBRIC = 'docs/ui-rubric.md'

/**
 * The derived tokens: `color-mix(...)` of the primitives above them.
 *
 * A hex either is or is not in the palette, but a colour-mix is not distinguishable from
 * its sources in a screenshot, so the rubric documents them separately and the check does
 * not demand they appear as hex.
 */
const DERIVED_PREFIXES = [
  '--color-accent-soft',
  '--color-accent-line',
  '--color-fg-soft',
  '--color-fg-line',
  '--color-gold-soft',
  '--color-on-dark',
  '--color-on-dark-dim',
]

/** `--name: value;` pairs inside a file's single @theme block. */
function themeTokens(css) {
  const block = css.match(/@theme\s*\{([\s\S]*?)\n\}/)
  if (!block) return null
  const out = {}
  for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const problems = []
const notes = []

// ── 1. Read what the apps ship ───────────────────────────────────────────────
const shipped = {}
for (const [app, rel] of Object.entries(APPS)) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) {
    problems.push(`${app}: ${rel} not found — has the app moved?`)
    continue
  }
  const tokens = themeTokens(readFileSync(abs, 'utf8'))
  if (!tokens) {
    problems.push(`${app}: no @theme block in ${rel}. The rubric anchors on it, so it must exist.`)
    continue
  }
  shipped[app] = tokens
}

if (problems.length) {
  console.error(problems.map((p) => `FAIL: ${p}`).join('\n'))
  process.exit(1)
}

// ── 2. The two apps must agree ───────────────────────────────────────────────
// One design system, two surfaces. A token that only one app has is how the rubric grew
// an "admin-only" palette that did not exist.
const [appA, appB] = Object.keys(shipped)
for (const key of Object.keys(shipped[appA])) {
  const b = shipped[appB][key]
  if (b === undefined) {
    problems.push(`--${key} exists in ${appA} but not ${appB} — the two apps must share one token set.`)
  } else if (b !== shipped[appA][key]) {
    problems.push(`--${key} differs between the apps: ${appA}="${shipped[appA][key]}" ${appB}="${b}"`)
  }
}

// ── 3. Read the rubric ───────────────────────────────────────────────────────
const rubricAbs = path.join(ROOT, RUBRIC)
if (!existsSync(rubricAbs)) {
  console.error(`FAIL: ${RUBRIC} not found — the judge would fall back to "general UI quality".`)
  process.exit(1)
}
const rubric = readFileSync(rubricAbs, 'utf8')

/** Strip the explanatory prose so historical mentions are not read as claims. */
const claimable = rubric
  .split('\n')
  .filter((line) => !/^\s*>/.test(line)) // blockquote = historical note
  .join('\n')

// Colours only in the token table, not everywhere the file mentions a hex.
const tableSection = claimable.slice(0, claimable.indexOf('### There are NO admin-only'))
const claimedColours = [...new Set([...tableSection.matchAll(/#[0-9A-F]{6}/gi)].map((m) => m[0].toLowerCase()))]

const palette = new Set(
  Object.values(shipped[appA])
    .filter((v) => /^#[0-9a-f]{6}$/i.test(v))
    .map((v) => v.toLowerCase()),
)

for (const c of claimedColours) {
  if (!palette.has(c)) {
    problems.push(
      `${RUBRIC} names ${c} in its token table, but no app ships it. A judge told to enforce ` +
        `this will report correct code as a defect.`,
    )
  }
}

// ── 4. Every shipped colour must be documented ───────────────────────────────
for (const c of palette) {
  if (!claimedColours.includes(c)) {
    problems.push(`${c} is a shipped token but is missing from the ${RUBRIC} table — the judge cannot name it.`)
  }
}

// ── 5. Fonts ─────────────────────────────────────────────────────────────────
// Only the Typography section's claims count. A grep over the whole file would match the
// "Playing Display was retired" note and produce a false positive — which is exactly the
// bug this script was written to avoid making.
const typography = claimable.slice(
  claimable.indexOf('### Typography'),
  claimable.indexOf('### Australian commerce'),
)
const declaredFonts = Object.entries(shipped[appA])
  .filter(([k]) => k.startsWith('font-'))
  .map(([, v]) => (v.match(/'([^']+)'/) ?? [, null])[1])
  .filter(Boolean)

for (const family of ['Plus Jakarta Sans', 'Manrope']) {
  if (!typography.includes(family)) {
    problems.push(
      `${RUBRIC} does not name "${family}" in its Typography section, but that is what the app ` +
        `ships. The judge will call the correct face a defect.`,
    )
  }
}

// A serif must NOT be prescribed: foundation.css retires it for legibility.
const serifClaim = /\bserif\b(?![^.]*retired)/i.test(typography)
if (serifClaim && !typography.includes('no serif')) {
  problems.push(
    `${RUBRIC} still appears to prescribe a serif face. foundation.css: "Playfair Display was ` +
      `retired for legibility — do not reintroduce a serif on headings".`,
  )
}

// ── 6. The derived tokens should be acknowledged ─────────────────────────────
const missingDerived = DERIVED_PREFIXES.filter((d) => !rubric.includes(d))
if (missingDerived.length) {
  notes.push(
    `${missingDerived.length} derived token(s) not mentioned in ${RUBRIC}: ` +
      `${missingDerived.join(', ')}. They are color-mix() of the primitives, so a screenshot ` +
      `cannot distinguish them — worth listing so the judge does not call them invented.`,
  )
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`rubric drift check`)
console.log(`  apps          ${Object.keys(shipped).join(', ')}`)
console.log(`  palette       ${palette.size} colour token(s)`)
console.log(`  fonts         ${declaredFonts.join(', ')}`)
console.log(`  rubric claims ${claimedColours.length} colour(s)`)

for (const n of notes) console.log(`  note          ${n}`)

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} rubric drift problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(
    `\nThe judge grades against ${RUBRIC}, so a stale entry makes it penalise correct code. ` +
      `Update the file, or the design language, so the two agree.`,
  )
  process.exit(1)
}

console.log('\nPASS: the rubric matches the tokens both apps ship.')
