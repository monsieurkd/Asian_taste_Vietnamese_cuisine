#!/usr/bin/env node
// Render docs/schema.svg to PNG so a human can confirm it actually looks right.
//
// Why this exists: `check-schema-diagram.py` proves the SVG is well-formed and
// contains every table. It cannot prove the diagram is *readable* — boxes
// overlapping, text clipped, edges drawn through labels. Rendering is the only
// way to see that, and a diagram nobody has looked at is a diagram that might be
// a mess.
//
//     node scripts/schema-render.mjs [out.png]
//
// Uses playwright-core, which the repo already depends on for the UI quality loop
// (scripts/ui-shots.mjs), so it adds nothing. It reuses that script's browser
// resolution rather than hard-coding a path.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'docs', 'schema.svg');
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'docs', 'schema.png');

/** Candidate browsers, in the order ui-shots.mjs probes them. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function main() {
  if (!existsSync(SVG)) {
    console.error(`missing ${SVG} — run: python3 scripts/schema-diagram.py`);
    process.exit(1);
  }

  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) {
    console.error('no Chrome/Chromium found. Set CHROME_PATH to a browser binary.');
    process.exit(1);
  }

  const svg = readFileSync(SVG, 'utf8');
  const vb = /viewBox="([\d.\s]+)"/.exec(svg);
  const [w, h] = vb ? [Number(vb[1].split(/\s+/)[2]), Number(vb[1].split(/\s+/)[3])] : [1200, 1400];

  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({
    viewport: { width: Math.ceil(w), height: Math.ceil(h) },
    // 2x, so the image stays sharp on a retina display — the README is where
    // people will actually look at this.
    deviceScaleFactor: 2,
  });

  await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`, {
    waitUntil: 'load',
  });

  const box = await page.locator('svg').boundingBox();
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();

  const size = statSync(OUT).size;
  if (size < 5000) {
    console.error(`rendered ${OUT} but it looks empty (${size} bytes)`);
    process.exit(1);
  }
  console.log(`wrote ${OUT} (${size} bytes)`);
  if (box) console.log(`svg measured ${box.width.toFixed(0)}x${box.height.toFixed(0)} CSS px`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
