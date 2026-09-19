// The deterministic gates.
//
// These are the driver's own checks, and they exist because an agent's claim is
// not evidence. `swarm-dev-api` saying "0 errors, 9 warnings" is a claim; this
// module is what turns it into a fact, or catches it as a false one.
//
// The sharp edge here is guardrail integrity. An autonomous agent that can't make
// the suite pass has an obvious shortcut: lower `.test-baseline`, delete the
// failing test, or wrap a guardrail in `continue-on-error`. `check-ci-integrity.sh`
// catches the workflow cases, but it cannot know whether *this run* was the thing
// that removed a test — so the driver snapshots the baseline before any agent
// touches the tree and refuses to merge if it went down. That check is the reason
// a human can afford to let this thing merge on its own.

import { sh, log, truncate } from './exec.mjs';

const BASELINE_FILE = '.test-baseline';

/**
 * The parser the guardrail itself uses: the first run of digits anywhere in the
 * file wins, including inside the prose comments. Mirroring that quirk exactly is
 * the point — if this driver parsed it "correctly" it would disagree with the
 * guardrail that actually gates the build.
 */
export function parseBaseline(text) {
  const m = String(text ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

export async function readBaseline(repoRoot) {
  const r = await sh(`cat ${BASELINE_FILE}`, { cwd: repoRoot, silent: true, timeoutMs: 30000 });
  if (r.code !== 0) return null;
  return parseBaseline(r.out);
}

/** Files whose modification means the run must not auto-merge. */
export const DANGER_PATHS = [
  '.github/workflows/',
  'scripts/check-',
  '.test-baseline',
  '.githooks/',
];

export function dangerPathsTouched(changedFiles) {
  return changedFiles.filter((f) => DANGER_PATHS.some((d) => f.startsWith(d)));
}

/**
 * Compare the tree against the run's base commit.
 * Returns { files, lines, maxSingleFile } plus the raw numstat.
 */
export async function diffStats(repoRoot, baseSha) {
  const r = await sh(`git diff --numstat ${baseSha}...HEAD`, {
    cwd: repoRoot,
    silent: true,
    timeoutMs: 60000,
  });
  if (r.code !== 0) return { files: 0, lines: 0, maxSingleFile: 0, list: [], raw: '' };

  const list = [];
  let lines = 0;
  let maxSingleFile = 0;
  for (const line of r.out.split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]) || 0;
    const removed = parts[1] === '-' ? 0 : Number(parts[1]) || 0;
    const total = added + removed;
    lines += total;
    maxSingleFile = Math.max(maxSingleFile, total);
    list.push(parts[2]);
  }
  return { files: list.length, lines, maxSingleFile, list, raw: r.out };
}

export async function changedFiles(repoRoot, baseSha) {
  const r = await sh(`git diff --name-only ${baseSha}...HEAD`, {
    cwd: repoRoot,
    silent: true,
    timeoutMs: 60000,
  });
  return r.code === 0 ? r.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Run the full CI equivalent, exactly as `.github/workflows/ci.yml` does.
 *
 * `TEST_RESULTS_DIR` is set so that `check-test-health.sh` judges this run's TRX
 * instead of paying for a second `dotnet test` — that is the repo's documented
 * rule ("judge the run, do not repeat it") and following it keeps this gate inside
 * a sane time budget.
 */
export async function runCiGate(repoRoot, { logFile } = {}) {
  const steps = [
    { name: 'restore', cmd: 'dotnet restore AsianTaste.sln', timeoutMs: 10 * 60 * 1000 },
    {
      name: 'build',
      cmd: 'dotnet build AsianTaste.sln --no-restore --configuration Release',
      timeoutMs: 15 * 60 * 1000,
    },
    {
      name: 'test',
      cmd:
        'dotnet test AsianTaste.sln --no-build --configuration Release --verbosity normal ' +
        '--logger "trx;LogFileName=api-tests.trx" --results-directory "$TEST_RESULTS_DIR"',
      timeoutMs: 25 * 60 * 1000,
    },
    { name: 'guardrail:test-wiring', cmd: './scripts/check-test-wiring.sh', timeoutMs: 5 * 60 * 1000 },
    { name: 'guardrail:test-health', cmd: './scripts/check-test-health.sh', timeoutMs: 10 * 60 * 1000 },
    { name: 'guardrail:ci-integrity', cmd: './scripts/check-ci-integrity.sh', timeoutMs: 5 * 60 * 1000 },
  ];

  const env = { TEST_RESULTS_DIR: 'TestResults' };
  const results = [];
  let allGreen = true;

  for (const s of steps) {
    log.info(`\n· CI step: ${s.name}`);
    const r = await sh(s.cmd, { cwd: repoRoot, env, timeoutMs: s.timeoutMs });
    const passed = r.code === 0;
    if (!passed) allGreen = false;
    results.push({
      name: s.name,
      cmd: s.cmd,
      code: r.code,
      passed,
      output: truncate(r.combined ?? '', 4000),
    });
    log.info(`  ${passed ? '✔' : '✖'} ${s.name} (exit ${r.code})`);

    if (logFile) {
      try {
        const { appendFileSync, mkdirSync } = await import('node:fs');
        const { dirname } = await import('node:path');
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(
          logFile,
          `\n===== CI ${s.name} (exit ${r.code}) =====\n${truncate(r.combined ?? '', 20000)}\n`,
        );
      } catch {
        /* never fatal */
      }
    }
  }

  return { allGreen, results, testCount: parseTestCount(results) };
}

/** Pull "Passed!  - Failed: 0, Passed: 126, Skipped: 0" out of the test step. */
export function parseTestCount(results) {
  const testStep = results.find((r) => r.name === 'test');
  if (!testStep) return null;
  const m = testStep.output.match(/Passed:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export async function frontendGate(repoRoot, app, { lint = true } = {}) {
  const dir = `src/${app}`;
  const steps = [
    { name: `${app}:build`, cmd: `npm run build`, cwd: `${repoRoot}/${dir}` },
    ...(lint
      ? [{ name: `${app}:lint`, cmd: `npm run lint`, cwd: `${repoRoot}/${dir}` }]
      : []),
    { name: `${app}:test`, cmd: `npm test`, cwd: `${repoRoot}/${dir}` },
  ];

  const results = [];
  let allGreen = true;
  for (const s of steps) {
    log.info(`· frontend step: ${s.name}`);
    const r = await sh(s.cmd, { cwd: s.cwd, timeoutMs: 12 * 60 * 1000 });
    const passed = r.code === 0;
    if (!passed) allGreen = false;
    results.push({ name: s.name, cmd: s.cmd, code: r.code, passed, output: truncate(r.combined ?? '', 3000) });
    log.info(`  ${passed ? '✔' : '✖'} ${s.name} (exit ${r.code})`);
  }
  return { allGreen, results };
}

/**
 * Everything that must be true before a merge, in one place, with the reason
 * recorded for each failure. Returns { ok, failures[], facts{} }.
 */
export async function preMergeGate(repoRoot, state, opts = {}) {
  const failures = [];
  const facts = {};

  const ci = await runCiGate(repoRoot, opts);
  facts.ci = ci;

  if (!ci.allGreen) {
    const failed = ci.results.filter((r) => !r.passed).map((r) => r.name);
    failures.push(`CI not green: ${failed.join(', ')}`);
  }

  const stats = await diffStats(repoRoot, state.baseSha);
  facts.diff = stats;

  const files = stats.list;
  const touchedDanger = dangerPathsTouched(files);
  facts.dangerPaths = touchedDanger;
  if (touchedDanger.length) {
    failures.push(
      `run touched guardrail/danger paths, which this swarm never auto-merges: ${touchedDanger.join(', ')}`,
    );
  }

  const baselineAfter = await readBaseline(repoRoot);
  facts.baselineBefore = state.baselineBefore;
  facts.baselineAfter = baselineAfter;
  if (state.baselineBefore != null && baselineAfter != null && baselineAfter < state.baselineBefore) {
    failures.push(
      `test floor was lowered (.test-baseline ${state.baselineBefore} -> ${baselineAfter}); that is a guardrail bypass, not a change`,
    );
  }
  if (ci.testCount != null && baselineAfter != null && ci.testCount < baselineAfter) {
    failures.push(`suite ran ${ci.testCount} tests, below the declared floor ${baselineAfter}`);
  }

  const maxFiles = Number(process.env.MAX_FILES_CHANGED || 60);
  const maxLines = Number(process.env.MAX_LINES_CHANGED || 2500);
  const maxSingle = Number(process.env.MAX_SINGLE_FILE_LINES || 600);
  facts.thresholds = { maxFiles, maxLines, maxSingle };
  if (stats.files > maxFiles) failures.push(`diff touches ${stats.files} files (limit ${maxFiles})`);
  if (stats.lines > maxLines) failures.push(`diff is ${stats.lines} lines (limit ${maxLines})`);
  if (stats.maxSingleFile > maxSingle)
    failures.push(`one file changed ${stats.maxSingleFile} lines (limit ${maxSingle})`);

  return { ok: failures.length === 0, failures, facts };
}
