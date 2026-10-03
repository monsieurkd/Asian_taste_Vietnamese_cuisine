#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ui-shots.mjs — capture Asian Taste's key screens for the UI-QA judge.
//
//   npm run ui:shots                          # needs both dev servers running
//   npm run ui:shots -- --app=customer        # one app only
//   npm run ui:shots -- --filter=home,cart    # one or more screens
//   UI_CUSTOMER_URL=http://localhost:5173 npm run ui:shots
//
// Writes ui-shots/<app>/<name>-<width>.png + manifest.json (gitignored).
// Uses the system Google Chrome via playwright-core — no browser download.
// Exit code 1 if a screen can't load or times out, so CI can gate on it.
//
// Why screen waits are text/selector based: a screenshot taken before the menu
// API resolves captures a skeleton loader, which the judge would then grade as
// a broken page. Each `wait` proves the page reached its real state first.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'ui-shots')

const CHROME_PATH =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome')

// The two frontends, each on its own dev port (see vite.config.ts).
const APPS = {
  customer: {
    base: process.env.UI_CUSTOMER_URL ?? 'http://localhost:5173',
    outDir: path.join(OUT_DIR, 'customer'),
  },
  admin: {
    base: process.env.UI_ADMIN_URL ?? 'http://localhost:5174',
    outDir: path.join(OUT_DIR, 'admin'),
  },
}

const text = (t, { exact = false } = {}) => (page) =>
  page.getByText(t, { exact }).first().waitFor({ state: 'visible', timeout: 20_000 })

const visible = (selector) => (page) =>
  page.locator(selector).first().waitFor({ state: 'visible', timeout: 20_000 })

// Screens the loop owns. `wait` must prove the page reached its intended state
// (data loaded, not a skeleton). Keep in sync with SCREEN_GUIDE in ui-judge.mjs.
const SHOTS = {
  customer: [
    {
      name: 'home',
      path: '/',
      // Landing: hero + category nav. The menu grid loads from the API, so wait
      // for a real menu item rather than the hero alone.
      wait: async (page) => {
        await visible('header')(page)
      },
    },
    {
      name: 'menu',
      path: '/menu',
      // The menu list — proves API data rendered, not a skeleton.
      wait: async (page) => {
        await page.locator('[class*="grid"]').first().waitFor({ state: 'visible', timeout: 20_000 })
        await page.waitForTimeout(800)
      },
    },
    {
      name: 'search',
      path: '/search',
      wait: visible('main'),
    },
    {
      name: 'cart-empty',
      // A cart with nothing in it — the empty state IS design.
      path: '/cart',
      wait: visible('main'),
    },
    {
      name: 'item-detail',
      // A dish detail modal, reached by clicking a dish on the menu — the route
      // alone does not open it. This is the core ordering interaction.
      // The modal has no role="dialog"; it is a fixed overlay panel, so wait on
      // its "Add to Cart" action instead.
      path: '/menu',
      wait: async (page) => {
        await page.locator('[class*="grid"]').first().waitFor({ state: 'visible', timeout: 20_000 })
        await page.waitForTimeout(800)
        await page.locator('a[href*="/menu/item/"]').first().click({ timeout: 10_000 })
        await page
          .getByRole('button', { name: /add to (cart|order)/i })
          .first()
          .waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForTimeout(600)
      },
    },
  ],
  admin: [
    {
      name: 'login',
      path: '/login',
      wait: visible('form'),
    },
  ],
}

// Screens that require state we can't create headlessly (a signed-in session, a
// non-empty cart). Their routes REDIRECT when that state is missing, so capturing
// them would silently produce a duplicate of the redirect target and the judge
// would score the wrong page. Listed here so the gap is explicit, not hidden.
const AUTHED_SCREENS_NOT_CAPTURED = [
  'customer/checkout (redirects to /menu with an empty cart)',
  'customer/account (redirects to /menu when signed out)',
  'customer/cart-filled (needs items in the cart)',
  'customer/confirmation (needs a real order number)',
  'admin/orders, menu, reports, settings (need an admin JWT)',
]

/**
 * Admin screens behind auth, captured by signing in first.
 *
 * Credentials come from the environment rather than the file: this script is committed, and
 * a password in it would be a password in git history permanently. Without them the admin
 * shots are simply skipped rather than silently producing a screenshot of the login page —
 * which is what happens today if you forget, and it scores as a broken board.
 *
 *   ADMIN_USER=admin ADMIN_PASS=... npm run ui:shots -- --app=admin
 *
 * The dev default lives in `src/AsianTaste.API/Data/Migrations/03_create_admin_user.sql`.
 * It is NOT the production password, and production deliberately rejects it (docs/TODO.md §18).
 */
const ADMIN_USER = process.env.ADMIN_USER
const ADMIN_PASS = process.env.ADMIN_PASS

async function signIn(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input').first().waitFor({ state: 'visible', timeout: 20_000 })
  const fields = page.locator('input')
  await fields.nth(0).fill(ADMIN_USER)
  await fields.nth(1).fill(ADMIN_PASS)
  await page.getByRole('button', { name: /sign in|log in|login/i }).first().click()
  await page.waitForURL(/\/kitchen/, { timeout: 20_000 })
}

const ADMIN_AUTHED_SHOTS = [
  {
    name: 'board',
    // The one working screen. It is the merge of the old /dashboard and /kitchen, so it is
    // also the screen most likely to regress into showing half a job — which is the whole
    // reason this shot exists.
    path: '/kitchen',
    authenticated: true,
    wait: async (page) => {
      // A ticket, not the column headers: the columns render before the orders arrive, so
      // waiting on `.board` would capture an empty board and the judge would score it as
      // "nothing to cook".
      await page.locator('.board-ticket, .board-empty').first().waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(800)
    },
  },
]

const VIEWPORTS = [
  { width: 1280, height: 800, label: 'desktop' },
  { width: 390, height: 844, label: 'mobile' },
]

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

async function main() {
  if (!existsSync(CHROME_PATH)) {
    console.error(`ui-shots: Chrome not found at ${CHROME_PATH}`)
    console.error('  Set CHROME_PATH, or install playwright chromium and switch this script to chromium.launch().')
    process.exit(1)
  }

  const appFilter = parseArg('app')
  const screenFilter = parseArg('filter')
  const apps = Object.keys(APPS).filter((a) => !appFilter || appFilter.includes(a))

  if (apps.length === 0) {
    console.error(`ui-shots: --app matched nothing. Known apps: ${Object.keys(APPS).join(', ')}`)
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
  const manifest = []
  let failed = false

  for (const appName of apps) {
    const app = APPS[appName]
    const shots = [
      ...(SHOTS[appName] ?? []),
      // Authed admin screens join the same list, so the filter, the viewports and the
      // manifest all treat them identically. Skipped only when credentials are absent.
      ...(appName === 'admin' && ADMIN_USER && ADMIN_PASS ? ADMIN_AUTHED_SHOTS : []),
    ].filter((s) => !screenFilter || screenFilter.includes(s.name))

    if (shots.length === 0) {
      console.error(`ui-shots: no screens selected for ${appName}${screenFilter ? ` (--filter matched nothing)` : ''}`)
      continue
    }

    // Fresh directory per run so a stale shot from a deleted screen can't be
    // judged as if it were current.
    rmSync(app.outDir, { recursive: true, force: true })
    mkdirSync(app.outDir, { recursive: true })

    for (const screen of shots) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
        const page = await context.newPage()
        const consoleErrors = []
        page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
        page.on('pageerror', (e) => consoleErrors.push(String(e)))

        const file = `${screen.name}-${vp.width}.png`
        const filePath = path.join(app.outDir, file)
        const url = `${app.base}${screen.path}`
        try {
          // `domcontentloaded` rather than `networkidle`: the app keeps a live
          // connection (WebSocket/React Query polling), so networkidle can hang
          // until timeout. The per-screen `wait` below is what proves the page
          // reached its real state.
          if (screen.authenticated) await signIn(page, app.base)
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await screen.wait(page)
          await page.waitForTimeout(600) // let fonts + entry animations settle
          await page.screenshot({ path: filePath, fullPage: false })
          manifest.push({ app: appName, name: screen.name, width: vp.width, file, path: screen.path })
          const errors = consoleErrors.length > 0 ? ` — ${consoleErrors.length} console error(s)` : ''
          console.log(`✓ ${appName}/${file} (${vp.width}x${vp.height})${errors}`)
        } catch (err) {
          failed = true
          console.error(`✗ ${appName}/${file} FAILED: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          await context.close()
        }
      }
    }
  }

  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await browser.close()
  console.log(`\nShots → ${OUT_DIR}/ (${manifest.length} captured)`)
  if (failed) {
    console.error('ui-shots: one or more screens failed — is the dev server running? Fix before judging.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('ui-shots:', err)
  process.exit(1)
})
