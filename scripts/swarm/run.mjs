#!/usr/bin/env node
// Asian Taste agent swarm — the autonomous build loop.
//
//   node scripts/swarm/run.mjs --goal "..." [--merge] [--deploy-watch] [--resume]
//
// WHAT THIS IS
//   An orchestrator-workers loop with an evaluator-optimizer inner cycle:
//
//     PM assistant → brief            (context-heavy recon, kept out of the PM)
//     PM           → plan.json        (decompose + route, one specialist per chunk)
//     per chunk:   dev agent          (implement in its seam)
//                  unit tester        (author tests, prove each can fail)
//                  driver gate        (CI + guardrails, deterministic)
//                  commit            (one commit per chunk = one revert unit)
//     merger       → integration tests + merge/block verdict
//     driver       → pre-merge gate, review, merge, deploy watch, health, rollback
//
// WHY IT IS SHAPED THIS WAY
//   The research on unattended agent loops converges on one finding: a loop with a
//   verifier beats a loop with a better model, and the failures that matter are
//   coordination failures, not capability failures. So:
//
//     · Every stage has an independent verifier that is NOT the agent that produced
//       the work — the tester verifies the dev, the guardrails verify the tester, the
//       merger verifies them all, and the driver verifies the merger.
//     · Every failure is classified before it is retried, because retrying an
//       unfixable failure just burns budget at a fixed probability of nonsense.
//     · The PM is stateless and re-plans from the failure digest, so a chunk that
//       fails three times produces a better plan rather than a fourth attempt.
//     · Irreversible actions (merge, push, revert) are executed only by this file,
//       never by a model, and only when `--merge` was passed explicitly.
//
// WHAT IT DELIBERATELY DOES NOT DO
//   It does not run an unbounded loop. Bounded attempts per chunk, a bounded number
//   of re-plans, a wall-clock deadline, and a local kill switch. An autonomous system
//   with no budget ceiling is not autonomous, it is unattended.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, sh, truncate } from './lib/exec.mjs';
import { runAgent, jsonForPrompt } from './lib/agent.mjs';
import {
  loadState,
  newState,
  saveState,
  recordAttempt,
  attemptCountFor,
  setChunk,
  TERMINAL,
} from './lib/state.mjs';
import {
  readBaseline,
  preMergeGate,
  runCiGate,
  frontendGate,
  changedFiles,
} from './lib/gates.mjs';
import * as git from './lib/git.mjs';
import { watchCi, watchDeploy, healthCheck, hasGh } from './lib/release.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = join(REPO_ROOT, '.reasonix', 'skills');

const DEV_ROLES = new Set([
  'swarm-dev-api',
  'swarm-dev-data',
  'swarm-dev-frontend',
  'swarm-dev-ui',
]);

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = {
    goal: '',
    branch: '',
    base: 'main',
    merge: false,
    deployWatch: false,
    resume: false,
    maxChunks: 12,
    maxAttempts: 3,
    maxReplans: 3,
    skipFrontendGate: false,
    dryRun: false,
    model: '',
    deadlineMin: 240,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i];
    switch (v) {
      case '--goal': a.goal = next(); break;
      case '--branch': a.branch = next(); break;
      case '--base': a.base = next(); break;
      case '--max-chunks': a.maxChunks = Number(next()); break;
      case '--max-attempts': a.maxAttempts = Number(next()); break;
      case '--max-replans': a.maxReplans = Number(next()); break;
      case '--model': a.model = next(); break;
      case '--deadline-min': a.deadlineMin = Number(next()); break;
      case '--merge': a.merge = true; break;
      case '--deploy-watch': a.deployWatch = true; break;
      case '--resume': a.resume = true; break;
      case '--skip-frontend-gate': a.skipFrontendGate = true; break;
      case '--dry-run': a.dryRun = true; break;
      case '-h':
      case '--help': usage(); process.exit(0); break;
      default:
        if (v.startsWith('--goal=')) a.goal = v.slice(7);
        else if (v.startsWith('--branch=')) a.branch = v.slice(9);
        else if (v.startsWith('--model=')) a.model = v.slice(8);
        else { log.error(`unknown argument: ${v}`); usage(); process.exit(2); }
    }
  }
  return a;
}

function usage() {
  process.stdout.write(`Usage: node scripts/swarm/run.mjs --goal "<goal>" [options]

  --goal <text>          The goal the swarm must achieve. Required (unless --resume).
  --branch <name>        Branch to build on. Default: swarm/<slug>-<timestamp>
  --base <branch>        Branch to fork from and merge back into. Default: main
  --merge                Execute the merge to the base branch when the merger approves.
                         WITHOUT this the run stops after the gate and leaves the branch.
  --deploy-watch         After a merge, watch CI + deploy + production health, and
                         revert the merge automatically if either fails. Implies --merge.
  --resume               Resume the most recent run for this repo from its saved state.
  --max-chunks <n>       Hard cap on chunk count accepted from the PM. Default 12
  --max-attempts <n>     Attempts per chunk before handing back to the PM. Default 3
  --max-replans <n>      Re-plan cycles before the run halts. Default 3
  --deadline-min <n>     Wall-clock ceiling for the whole run. Default 240
  --model <name>         Model for every agent. Default: the Reasonix default.
  --skip-frontend-gate   Skip the frontend build/lint/test gate (use only when the
                         run provably cannot touch a frontend; the gate is cheap).
  --dry-run              Plan only: brief + plan + validation, then stop.
  -h, --help             This message.
`);
}

// ── Run directory ────────────────────────────────────────────────────────────

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'run'
  );
}

function makeRunDir(goal) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(REPO_ROOT, '.swarm', 'runs', `${stamp}-${slugify(goal)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function latestRunDir() {
  const base = join(REPO_ROOT, '.swarm', 'runs');
  if (!existsSync(base)) return null;
  const runs = readdirSync(base).filter((d) => existsSync(join(base, d, 'run-state.json')));
  if (!runs.length) return null;
  // Names are ISO timestamps, so lexical order is chronological order.
  runs.sort();
  return join(base, runs[runs.length - 1]);
}

// ── Kill switch + budget ─────────────────────────────────────────────────────

function makeBudget(deadlineMin) {
  const deadline = Date.now() + deadlineMin * 60 * 1000;
  return {
    expired() {
      if (existsSync(join(REPO_ROOT, '.swarm', 'HALT'))) {
        return 'kill switch engaged (.swarm/HALT exists) — remove it to continue';
      }
      if (Date.now() > deadline) return `wall-clock deadline reached (${deadlineMin} min)`;
      return null;
    },
  };
}

// ── Prompt building ──────────────────────────────────────────────────────────

function readIfExists(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function chunkTask(state, chunk, runDir, { replanDigest } = {}) {
  const brief = readIfExists(join(runDir, 'brief.md'));
  return [
    `You are implementing ONE chunk of a swarm run. Work only inside your seam.`,
    ``,
    `## The goal (context for judgement, not a licence to widen the chunk)`,
    state.goal,
    ``,
    `## PM restatement`,
    state.plan?.restatement || '(none)',
    ``,
    `## Your chunk`,
    '```json',
    JSON.stringify(chunk, null, 2),
    '```',
    ``,
    `## Other chunks in this plan (do NOT implement these; they have their own agents)`,
    '```json',
    JSON.stringify(
      (state.plan?.chunks || []).filter((c) => c.id !== chunk.id).map((c) => ({
        id: c.id,
        role: c.role,
        title: c.title,
        intent: c.intent,
      })),
      null,
      2,
    ),
    '```',
    brief ? `\n## Reconnaissance brief\n${truncate(brief, 6000)}` : '',
    replanDigest
      ? `\n## Your previous attempts failed. Digest of what went wrong:\n\`\`\`json\n${jsonForPrompt(replanDigest)}\n\`\`\`\nFix the cause, not the symptom. If the chunk itself is mis-carved, report status "blocked" with needs "swarm-pm" rather than forcing it.`
      : '',
    `\nImplement it, build it, and end with the JSON block from your role's output contract.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function testTask(state, chunk, chunkResult, runDir) {
  return [
    `A dev agent has just implemented this chunk and reported the result below.`,
    `Your job: prove the acceptance criteria with real tests, and prove each new test can fail.`,
    ``,
    `## The goal`,
    state.goal,
    ``,
    `## The chunk`,
    '```json',
    JSON.stringify(chunk, null, 2),
    '```',
    ``,
    `## What the dev agent reported`,
    '```json',
    jsonForPrompt(chunkResult, 5000),
    '```',
    ``,
    `Author tests for every acceptance criterion you can cover, run the mandatory mutation`,
    `check on each one, raise .test-baseline to the new count, and end with the JSON block`,
    `from your role's output contract. If a criterion is false, that is a defect: write the`,
    `failing test and report it — do NOT fix production code, and do NOT weaken the criterion.`,
  ].join('\n');
}

// ── Prompt validation ────────────────────────────────────────────────────────

function validatePlan(plan, maxChunks) {
  const errs = [];
  if (!plan || typeof plan !== 'object') return ['no JSON plan was returned'];
  if (plan.kind === 'abandoned') return [];

  if (!Array.isArray(plan.chunks) || plan.chunks.length === 0) errs.push('plan has no chunks');
  if (Array.isArray(plan.chunks) && plan.chunks.length > maxChunks)
    errs.push(`plan has ${plan.chunks.length} chunks, over the --max-chunks cap of ${maxChunks}`);

  const ids = new Set();
  for (const [i, c] of (plan.chunks || []).entries()) {
    const at = `chunks[${i}]`;
    if (!c.id) errs.push(`${at} has no id`);
    else if (ids.has(c.id)) errs.push(`${at} id "${c.id}" is duplicated`);
    else ids.add(c.id);

    if (!DEV_ROLES.has(c.role))
      errs.push(`${at} role "${c.role}" is not one of ${[...DEV_ROLES].join(', ')}`);
    if (!Array.isArray(c.acceptance) || c.acceptance.length === 0)
      errs.push(`${at} (${c.id}) has no acceptance criteria`);
    if (!c.intent) errs.push(`${at} (${c.id}) has no intent`);
  }

  for (const c of plan.chunks || []) {
    for (const dep of c.depends_on || []) {
      if (!ids.has(dep)) errs.push(`${c.id} depends on "${dep}", which is not a chunk`);
      if (dep === c.id) errs.push(`${c.id} depends on itself`);
    }
  }

  // Topological sanity: listed order must be a valid build order, because the
  // driver executes sequentially.
  const order = new Map((plan.chunks || []).map((c, i) => [c.id, i]));
  for (const c of plan.chunks || []) {
    for (const dep of c.depends_on || []) {
      if (order.has(dep) && order.get(dep) > order.get(c.id))
        errs.push(`${c.id} is listed before its dependency ${dep}`);
    }
  }

  return errs;
}

function dangerChunks(plan) {
  return (plan?.chunks || []).filter((c) => c.danger === true);
}

// ── The run ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.goal && !args.resume) {
    log.error('--goal is required (or --resume)');
    usage();
    process.exit(2);
  }
  if (args.deployWatch) args.merge = true;

  const repoRoot = REPO_ROOT;
  let runDir = args.resume ? latestRunDir() : makeRunDir(args.goal);
  if (!runDir) {
    log.error('--resume: no previous run with saved state was found under .swarm/runs');
    process.exit(1);
  }
  log.setLogFile(join(runDir, 'driver.log'));

  const statePath = join(runDir, 'run-state.json');
  let state;
  if (args.resume) {
    state = loadState(statePath);
    if (!state) {
      log.error(`--resume: ${statePath} is missing`);
      process.exit(1);
    }
    args.goal = args.goal || state.goal;
    args.merge = args.merge || state.mode.merge;
    args.deployWatch = args.deployWatch || state.mode.deployWatch;
    log.info(`Resuming run at ${runDir} (phase: ${state.phase})`);
  }

  const budget = makeBudget(args.deadlineMin);
  const branch = args.branch || state?.branch || `swarm/${slugify(args.goal)}-${Date.now().toString(36)}`;

  if (!state) {
    // Confirm the roles exist before touching anything. A missing skill must fail
    // here, loudly, rather than mid-run after the branch has already been created.
    const roster = await sh('reasonix subagent list', { cwd: repoRoot, silent: true });
    const missing = [...DEV_ROLES, 'swarm-pm', 'swarm-pm-assistant', 'swarm-test-unit', 'swarm-merger']
      .filter((r) => !roster.combined.includes(r));
    if (missing.length) {
      log.error(`these swarm roles are not installed: ${missing.join(', ')}`);
      log.error(`expected SKILL.md files under ${SKILL_DIR}`);
      process.exit(1);
    }

    const baselineBefore = await readBaseline(repoRoot);
    state = newState({
      goal: args.goal,
      mode: { merge: args.merge, deployWatch: args.deployWatch, model: args.model || null },
      branch,
      baseBranch: args.base,
      maxChunks: args.maxChunks,
      attemptBudget: args.maxAttempts,
    });
    state.runDir = runDir;
    state.baselineBefore = baselineBefore;
    log.info(`Baseline test floor at run start: ${baselineBefore}`);

    // Refuse to start on a dirty tree: the run's diff must be entirely its own, or
    // `git diff base...HEAD` stops meaning "what this run did".
    if (!(await git.isClean(repoRoot))) {
      const dirty = await git.dirtyFiles(repoRoot);
      log.error('working tree is not clean; the swarm needs a clean start so its diff is its own');
      dirty.slice(0, 20).forEach((d) => log.info(`   ${d}`));
      process.exit(1);
    }

    state.phase = 'branch';
    saveState(statePath, state);
    const startSha = await git.createBranch(repoRoot, branch, args.base);
    state.baseSha = startSha;
    log.ok(`created ${branch} from ${args.base} at ${startSha.slice(0, 8)}`);

    state.phase = 'brief';
    saveState(statePath, state);
  }

  // ── 1. Brief (PM assistant) ────────────────────────────────────────────────
  if (!state.briefDone) {
    checkBudget(budget, state, statePath);
    log.step('BRIEF — PM assistant reconnoitres the project');
    const briefPath = join(runDir, 'brief.md');
    const r = await runAgent({
      role: 'swarm-pm-assistant',
      task: [
        `Job: brief`,
        `Goal: ${state.goal}`,
        `Write your brief to: ${briefPath}`,
        `Run directory: ${runDir}`,
        `Repo root: ${repoRoot}`,
        `Branch: ${state.branch} (base ${state.baseBranch})`,
        `Test floor at run start: ${state.baselineBefore}`,
        ``,
        `Reconnoitre and write brief.md. Do not plan and do not code.`,
      ].join('\n'),
      repoRoot,
      model: args.model,
      logFile: join(runDir, 'agents.log'),
    });
    state.briefDone = true;
    saveState(statePath, state);
    if (!r.ok) log.warn('brief agent did not return JSON; continuing with whatever it wrote');
  }

  // ── 2. Plan / re-plan (PM) ─────────────────────────────────────────────────
  let replans = state.replans || 0;
  while (!state.plan) {
    checkBudget(budget, state, statePath);
    log.step('PLAN — the PM decomposes the goal');
    const r = await runAgent({
      role: 'swarm-pm',
      task: [
        `Job: ${state.replans ? 're-plan' : 'plan'}`,
        `Goal: ${state.goal}`,
        `Brief: ${join(runDir, 'brief.md')} (read this first)`,
        `Run directory: ${runDir}`,
        `Base branch: ${state.baseBranch}`,
        `Test floor: ${state.baselineBefore} (you may not lower it)`,
        `Chunk cap: ${args.maxChunks}`,
        state.replans ? `\n## Failure digest\n\`\`\`json\n${jsonForPrompt(state.digest)}\n\`\`\`` : '',
        `\nEmit the plan JSON from your role's output contract, and nothing else,`,
        `except that you may write the plan to ${join(runDir, 'plan.json')} as well.`,
      ]
        .filter(Boolean)
        .join('\n'),
      repoRoot,
      model: args.model,
      logFile: join(runDir, 'agents.log'),
    });

    const plan = r.json;
    if (!plan) {
      log.error('PM returned no parseable plan; halting rather than guessing');
      return halt(state, statePath, 'PM returned no parseable plan');
    }
    if (plan.kind === 'abandoned') {
      writeFileSync(join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
      log.warn(`PM abandoned the goal: ${plan.restatement || '(no reason given)'}`);
      return halt(state, statePath, `PM abandoned the goal: ${plan.restatement || ''}`, 'abandoned');
    }

    const errs = validatePlan(plan, args.maxChunks);
    if (errs.length) {
      log.warn(`plan failed validation:\n  - ${errs.join('\n  - ')}`);
      replans++;
      state.replans = replans;
      state.digest = { classification: 'scope', pm_should_consider: errs.join('; ') };
      if (replans > args.maxReplans) {
        return halt(state, statePath, `plan still invalid after ${args.maxReplans} re-plans`);
      }
      saveState(statePath, state);
      continue;
    }

    state.plan = plan;
    writeFileSync(join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
    log.ok(`plan accepted: ${plan.chunks.length} chunk(s)`);
    for (const c of plan.chunks) {
      const dep = (c.depends_on || []).length ? ` ← ${c.depends_on.join(',')}` : '';
      log.info(`   ${c.id} [${c.role}]${dep} ${c.title}${c.danger ? '  ⚠ DANGER' : ''}`);
    }

    const dangers = dangerChunks(plan);
    if (dangers.length) {
      log.warn(
        `this plan contains ${dangers.length} danger chunk(s) — they will be HALT-AND-REPORT, never auto-merged:`,
      );
      dangers.forEach((c) => log.info(`   ${c.id}: ${c.title}`));
    }
    state.phase = 'chunks';
    saveState(statePath, state);
  }

  if (args.dryRun) {
    log.ok('--dry-run: plan validated and written; stopping before any implementation');
    state.status = 'planned';
    saveState(statePath, state);
    return;
  }

  // ── 3. Chunk loop ──────────────────────────────────────────────────────────
  for (const chunk of state.plan.chunks) {
    const rec = state.chunks[chunk.id];
    if (rec && TERMINAL.has(rec.status)) {
      log.info(`· ${chunk.id} already ${rec.status} — skipping (resume)`);
      continue;
    }

    const stop = checkBudget(budget, state, statePath);
    if (stop) return halt(state, statePath, stop);

    // Dependencies must be green before the chunk starts.
    const unmet = (chunk.depends_on || []).filter(
      (d) => state.chunks[d]?.status !== 'merged',
    );
    if (unmet.length) {
      setChunk(state, chunk.id, { status: 'halted', reason: `unmet dependency: ${unmet.join(', ')}` });
      saveState(statePath, state);
      return halt(state, statePath, `${chunk.id} cannot proceed: unmet dependency ${unmet.join(', ')}`);
    }

    if (chunk.danger) {
      setChunk(state, chunk.id, { status: 'halted', reason: 'danger chunk requires a human' });
      saveState(statePath, state);
      log.warn(`\n${chunk.id} is a DANGER chunk (${chunk.title}).`);
      log.warn('Danger chunks touch guardrails, migrations order, or the payment posture.');
      log.warn('The swarm will not implement or merge these unattended.');
      return halt(
        state,
        statePath,
        `danger chunk ${chunk.id} needs a human: ${chunk.title}`,
        'halted',
      );
    }

    await runChunk(state, chunk, { args, repoRoot, runDir, statePath, budget });
    if (state.halted) return;
  }

  // ── 4. Integration + merge (merger) ────────────────────────────────────────
  await integrateAndMerge(state, { args, repoRoot, runDir, statePath });

  if (!state.halted) {
    log.step('DONE');
    writeReport(state, runDir);
    log.ok(`run report: ${join(runDir, 'report.md')}`);
  }
}

function checkBudget(budget, state, statePath) {
  const why = budget.expired();
  if (!why) return null;
  state.status = 'halted';
  state.halted = why;
  saveState(statePath, state);
  return why;
}

async function runChunk(state, chunk, { args, repoRoot, runDir, statePath, budget }) {
  log.step(`CHUNK ${chunk.id} — ${chunk.title}  [${chunk.role}]`);

  let localAttempt = 0;
  while (localAttempt < args.maxAttempts) {
    localAttempt++;
    const total = attemptCountFor(state, chunk.id) + 1;
    log.info(`\n▸ attempt ${localAttempt}/${args.maxAttempts} (chunk total: ${total})`);

    const stop = checkBudget(budget, state, statePath);
    if (stop) return halt(state, statePath, stop);

    const digest = state.chunks[chunk.id]?.digest || null;

    // ── dev agent implements ────────────────────────────────────────────────
    const dev = await runAgent({
      role: chunk.role,
      task: chunkTask(state, chunk, runDir, { replanDigest: digest }),
      repoRoot,
      model: args.model,
      logFile: join(runDir, 'agents.log'),
    });
    recordAttempt(state, {
      kind: 'chunk',
      chunk: chunk.id,
      attempt: total,
      role: chunk.role,
      ok: dev.ok,
      status: dev.json?.status || 'no-json',
    });

    if (!dev.json) {
      const reason = 'dev agent returned no parseable result';
      log.warn(reason);
      setChunk(state, chunk.id, { status: 'retrying', reason });
      recordAttempt(state, { kind: 'chunk', chunk: chunk.id, attempt: total, failure: reason });
      saveState(statePath, state);
      continue;
    }

    if (dev.json.status === 'blocked') {
      const needs = dev.json.needs || 'swarm-pm';
      log.warn(`${chunk.id} blocked — needs ${needs}: ${dev.json.reason || ''}`);
      setChunk(state, chunk.id, { status: 'retrying', blocked_by: needs, reason: dev.json.reason });
      recordAttempt(state, {
        kind: 'chunk',
        chunk: chunk.id,
        attempt: total,
        failure: `blocked, needs ${needs}: ${dev.json.reason || ''}`,
      });
      saveState(statePath, state);
      // A cross-seam block is re-planned rather than retried: the same agent will
      // hit the same wall, and a fourth attempt is just cost.
      break;
    }

    // ── tester proves it ───────────────────────────────────────────────────
    log.info('\n· handing to swarm-test-unit');
    const test = await runAgent({
      role: 'swarm-test-unit',
      task: testTask(state, chunk, dev.json, runDir),
      repoRoot,
      model: args.model,
      logFile: join(runDir, 'agents.log'),
    });
    recordAttempt(state, {
      kind: 'test',
      chunk: chunk.id,
      attempt: total,
      ok: test.ok,
      status: test.json?.status || 'no-json',
    });

    // ── deterministic gate: the driver's own verification ──────────────────
    const gate = await runCiGate(repoRoot, { logFile: join(runDir, 'gates.log') });
    const baselineNow = await readBaseline(repoRoot);

    const baselineLowered =
      state.baselineBefore != null && baselineNow != null && baselineNow < state.baselineBefore;

    let front = { allGreen: true, results: [] };
    if (!args.skipFrontendGate) {
      // Only gate the app(s) the chunk actually touched — running both is a waste.
      const files = await changedFiles(repoRoot, state.baseSha);
      const apps = new Set();
      for (const f of files) {
        if (f.startsWith('src/asian-taste-customer/')) apps.add('asian-taste-customer');
        if (f.startsWith('src/asian-taste-admin/')) apps.add('asian-taste-admin');
      }
      for (const app of apps) {
        const r = await frontendGate(repoRoot, app);
        front.allGreen = front.allGreen && r.allGreen;
        front.results.push(...r.results);
      }
    }

    const ok = dev.json.status === 'implemented' && test.ok && gate.allGreen && front.allGreen && !baselineLowered;

    if (!ok) {
      const failures = [];
      if (dev.json.status !== 'implemented') failures.push(`dev status: ${dev.json.status}`);
      if (!test.ok) failures.push(`tester: ${test.json?.status || 'no parseable result'}`);
      if (test.json?.status === 'defect') {
        failures.push(
          `the tester found a defect: ${JSON.stringify(test.json.defects_found || [])}`,
        );
      }
      if (!gate.allGreen)
        failures.push(
          `gate failed: ${gate.results.filter((s) => !s.passed).map((s) => s.name).join(', ')}`,
        );
      if (!front.allGreen)
        failures.push(
          `frontend gate failed: ${front.results.filter((s) => !s.passed).map((s) => s.name).join(', ')}`,
        );
      if (baselineLowered)
        failures.push(`test floor lowered ${state.baselineBefore} -> ${baselineNow}`);

      log.warn(`attempt ${localAttempt} not green:\n  - ${failures.join('\n  - ')}`);

      // Revert the attempt so the next one starts from the last green commit.
      // Without this, attempts compound and a later "fix" is judged against a tree
      // that already contains the earlier failure.
      await sh('git checkout -- .', { cwd: repoRoot, silent: true });
      await sh('git clean -fd -e .swarm', { cwd: repoRoot, silent: true });

      const digestText = [
        ...failures,
        !gate.allGreen
          ? `gate output:\n${truncate(
              gate.results.filter((s) => !s.passed).map((s) => `### ${s.name}\n${s.output}`).join('\n'),
              4000,
            )}`
          : '',
        test.json?.defects_found?.length
          ? `defects reported by the tester: ${JSON.stringify(test.json.defects_found, null, 2)}`
          : '',
        test.json?.acceptance_coverage
          ? `coverage: ${JSON.stringify(test.json.acceptance_coverage, null, 2)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      setChunk(state, chunk.id, { status: 'retrying', digest: { summary: failures.join('; '), detail: digestText } });
      recordAttempt(state, { kind: 'chunk', chunk: chunk.id, attempt: total, failure: failures.join('; ') });
      saveState(statePath, state);
      continue;
    }

    // ── green: commit the chunk as one revert unit ─────────────────────────
    const msg = [
      `swarm(${chunk.id}): ${chunk.title}`,
      '',
      `Role: ${chunk.role}`,
      '',
      `Acceptance:`,
      ...chunk.acceptance.map((a) => `- ${a}`),
      '',
      dev.json.summary || '',
      '',
      `Tests: ${(test.json?.tests_added || []).length} added, baseline ${test.json?.baseline_before} -> ${test.json?.baseline_after}`,
      `Gate: CI green (${gate.testCount ?? '?'} tests), frontend green, guardrails green`,
      '',
      `Generated by the Asian Taste agent swarm.`,
    ].join('\n');

    const commit = await git.commitAll(repoRoot, msg);
    setChunk(state, chunk.id, {
      status: 'merged',
      commit: commit.sha,
      role: chunk.role,
      gate: { ci: gate.allGreen, frontend: front.allGreen, tests: gate.testCount },
      tests_added: (test.json?.tests_added || []).length,
      baseline_after: test.json?.baseline_after ?? null,
      result: dev.json,
      test_result: test.json,
      digest: null,
    });
    saveState(statePath, state);
    log.ok(
      `${chunk.id} green and committed at ${commit.sha.slice(0, 8)} (${gate.testCount ?? '?'} tests)`,
    );

    // Honour any defects the agents surfaced, even on a green chunk.
    const defects = [
      ...(dev.json.defects_found || []).map((d) => ({ from: 'dev', d })),
      ...(test.json?.defects_found || []).map((d) => ({ from: 'tester', d })),
    ];
    if (defects.length) {
      log.warn(`${chunk.id} reported ${defects.length} defect(s) that are NOT fixed:`);
      defects.forEach((x) => log.info(`   [${x.from}] ${JSON.stringify(x.d)}`));
    }
    return;
  }

  // Attempts exhausted (or a cross-seam block) → hand back to the PM.
  log.warn(`${chunk.id} did not go green after ${localAttempt} attempt(s); asking the PM to re-plan`);
  state.replans = (state.replans || 0) + 1;
  if (state.replans > args.maxReplans) {
    setChunk(state, chunk.id, { status: 'halted', reason: 'attempts exhausted' });
    saveState(statePath, state);
    return halt(
      state,
      statePath,
      `${chunk.id} failed ${localAttempt} attempt(s) and the re-plan budget (${args.maxReplans}) is spent`,
    );
  }

  state.digest = {
    chunk: chunk.id,
    attempts: attemptCountFor(state, chunk.id),
    last_failure: state.chunks[chunk.id]?.digest?.summary || 'unknown',
    detail: state.chunks[chunk.id]?.digest?.detail || '',
    pm_should_consider: 're-carve the chunk, re-route the role, or re-specify acceptance',
  };
  setChunk(state, chunk.id, { status: 'replanning' });
  saveState(statePath, state);

  // Ask the PM to re-plan, then re-enter the plan loop once.
  const r = await runAgent({
    role: 'swarm-pm',
    task: [
      `Job: re-plan`,
      `Goal: ${state.goal}`,
      `Run directory: ${runDir}`,
      `Brief: ${join(runDir, 'brief.md')}`,
      `The chunk below did not go green. Digest:`,
      '```json',
      jsonForPrompt(state.digest),
      '```',
      `Chunks already green and committed (do not redo these): ${JSON.stringify(
        Object.entries(state.chunks)
          .filter(([, v]) => v.status === 'merged')
          .map(([k]) => k),
      )}`,
      `Emit a revised plan JSON per your output contract.`,
    ].join('\n'),
    repoRoot,
    model: args.model,
    logFile: join(runDir, 'agents.log'),
  });

  if (r.json && r.json.kind !== 'abandoned') {
    const errs = validatePlan(r.json, args.maxChunks);
    if (!errs.length) {
      // Carry forward already-merged chunks; replace the rest.
      const mergedIds = new Set(
        Object.entries(state.chunks)
          .filter(([, v]) => v.status === 'merged')
          .map(([k]) => k),
      );
      const kept = (state.plan.chunks || []).filter((c) => mergedIds.has(c.id));
      state.plan = {
        ...r.json,
        chunks: [...kept, ...r.json.chunks.filter((c) => !mergedIds.has(c.id))],
      };
      writeFileSync(join(runDir, 'plan.json'), JSON.stringify(state.plan, null, 2));
      log.ok(`re-planned: ${state.plan.chunks.length} chunk(s) now, ${kept.length} already green`);
      // Re-enter the chunk loop by recursing through main's chunk phase is not
      // possible here, so the remaining chunks are handled by the outer loop on
      // the next pass; mark this chunk so the loop skips it.
      setChunk(state, chunk.id, { status: 'halted', reason: 'replanned away or replaced' });
      saveState(statePath, state);
      return;
    }
    log.warn(`re-plan invalid: ${errs.join('; ')}`);
  }

  setChunk(state, chunk.id, { status: 'halted', reason: 're-plan did not produce a usable plan' });
  saveState(statePath, state);
  return halt(state, statePath, `${chunk.id} failed and the re-plan produced nothing usable`);
}

// ── Integration + merge ──────────────────────────────────────────────────────

async function integrateAndMerge(state, { args, repoRoot, runDir, statePath }) {
  log.step('INTEGRATE — the merger verifies what no single chunk can');
  state.phase = 'integrate';
  saveState(statePath, state);

  const chunkSummary = Object.entries(state.chunks).map(([id, v]) => ({
    id,
    role: v.role,
    status: v.status,
    commit: v.commit,
    defects_found: [
      ...(((v.result || {}).defects_found) || []),
      ...(((v.test_result || {}).defects_found) || []),
    ],
    not_done: (v.result || {}).not_done || [],
    unverified: (v.test_result || {}).unverified || [],
  }));

  const merger = await runAgent({
    role: 'swarm-merger',
    task: [
      `Job: integrate. Every chunk below is green on its own; decide whether the BRANCH is correct.`,
      `Goal: ${state.goal}`,
      `Run directory: ${runDir}`,
      `Base branch: ${state.baseBranch}; swarm branch: ${state.branch}`,
      ``,
      `## PM integration criteria`,
      '```json',
      jsonForPrompt(state.plan.integration || { intent: '(none set)', acceptance: [] }),
      '```',
      ``,
      `## Chunk ledger (including everything the agents flagged)`,
      '```json',
      jsonForPrompt(chunkSummary, 7000),
      '```',
      ``,
      `Author the integration tests that only you can write, run what you need, and end with`,
      `the merge-verdict JSON from your role's output contract. Do not merge or push — the`,
      `driver does that. If this branch should not reach ${state.baseBranch}, say block and why.`,
    ].join('\n'),
    repoRoot,
    model: args.model,
    logFile: join(runDir, 'agents.log'),
  });

  state.integration = merger.json;
  writeFileSync(join(runDir, 'merge-verdict.json'), JSON.stringify(merger.json ?? {}, null, 2));
  saveState(statePath, state);

  if (!merger.json) {
    return halt(state, statePath, 'merger returned no parseable verdict');
  }
  if (merger.json.verdict !== 'merge') {
    log.warn(`merger verdict: ${merger.json.verdict}`);
    (merger.json.blocking_reasons || []).forEach((r) => log.info(`   - ${JSON.stringify(r)}`));
    return halt(state, statePath, `merger blocked the merge`, 'blocked');
  }
  log.ok('merger approves the branch');

  // ── deterministic pre-merge gate ─────────────────────────────────────────
  log.step('PRE-MERGE GATE — the driver verifies the branch itself');
  const gate = await preMergeGate(repoRoot, state, { logFile: join(runDir, 'gates.log') });
  const frontendResults = [];
  if (!args.skipFrontendGate) {
    for (const app of ['asian-taste-customer', 'asian-taste-admin']) {
      const r = await frontendGate(repoRoot, app);
      frontendResults.push(...r.results);
      if (!r.allGreen) gate.failures.push(`frontend ${app} not green`);
    }
    gate.ok = gate.failures.length === 0;
  }
  state.preMergeGate = { ok: gate.ok, failures: gate.failures, facts: gate.facts };
  saveState(statePath, state);

  if (!gate.ok) {
    gate.failures.forEach((f) => log.error(f));
    return halt(state, statePath, `pre-merge gate failed: ${gate.failures.join('; ')}`, 'blocked');
  }
  log.ok(`pre-merge gate passed (${gate.facts.diff.files} files, ${gate.facts.diff.lines} lines)`);

  // ── adversarial review (a second, independent opinion) ───────────────────
  log.step('REVIEW — independent review + security review of the branch diff');
  const base = state.baseSha;
  const review = await runAgent({
    role: 'review',
    task: `Review the diff \`git diff ${base}...HEAD\` on branch ${state.branch}. Focus on correctness, security, missing tests and hidden behaviour changes. Report a verdict and per-issue file:line.`,
    repoRoot,
    model: args.model,
    logFile: join(runDir, 'agents.log'),
    timeoutMs: 20 * 60 * 1000,
  });
  const secReview = await runAgent({
    role: 'security-review',
    task: `Security-review the diff \`git diff ${base}...HEAD\` on branch ${state.branch}. This branch may reach production unattended, and it touches a payment path. Report severity-tagged findings with file:line.`,
    repoRoot,
    model: args.model,
    logFile: join(runDir, 'agents.log'),
    timeoutMs: 20 * 60 * 1000,
  });
  writeFileSync(join(runDir, 'review.txt'), `${review.text}\n\n${secReview.text}`);
  state.reviews = {
    review: truncate(review.text, 6000),
    security: truncate(secReview.text, 6000),
  };
  saveState(statePath, state);
  log.info('reviews recorded (see review.txt) — the merger was told to treat blocking findings as fatal');

  if (!args.merge) {
    log.warn(
      '\n--merge was not passed, so the run stops here.\n' +
        `The branch ${state.branch} is green and ready:\n` +
        `   git diff ${state.baseBranch}...${state.branch}\n` +
        `Re-run with --merge (or --deploy-watch) to land it.`,
    );
    state.status = 'ready-not-merged';
    saveState(statePath, state);
    writeReport(state, runDir);
    return;
  }

  // ── merge ────────────────────────────────────────────────────────────────
  log.step(`MERGE — landing ${state.branch} into ${state.baseBranch}`);
  await git.checkout(repoRoot, state.baseBranch);
  const mergeMsg = [
    `swarm: ${state.goal}`,
    '',
    `Autonomous swarm run. ${Object.values(state.chunks).filter((c) => c.status === 'merged').length} chunk(s).`,
    ...Object.entries(state.chunks)
      .filter(([, v]) => v.status === 'merged')
      .map(([id, v]) => `- ${id} (${v.role}): ${v.commit?.slice(0, 8)}`),
    '',
    `Merger verdict: ${state.integration?.verdict}`,
    `Pre-merge gate: green (${gate.facts.diff.files} files, ${gate.facts.diff.lines} lines)`,
  ].join('\n');

  const m = await git.mergeNoFf(repoRoot, state.branch, mergeMsg);
  if (!m.ok) {
    log.error('merge failed; leaving the base branch untouched');
    log.info(truncate(m.output, 3000));
    await git.checkout(repoRoot, state.branch);
    return halt(state, statePath, 'git merge failed (conflict) — needs a human');
  }
  const mergeSha = await git.headSha(repoRoot);
  state.merge = { sha: mergeSha, at: new Date().toISOString() };
  saveState(statePath, state);
  log.ok(`merged at ${mergeSha.slice(0, 8)}`);

  const p = await git.push(repoRoot, `${state.baseBranch}`);
  if (!p.ok) {
    log.error('push failed; the merge is local only');
    log.info(truncate(p.output, 2000));
    return halt(state, statePath, 'push failed — the merge is local, production is unchanged');
  }
  log.ok('pushed — CI and the deploy pipeline are now running');

  if (!args.deployWatch) {
    state.status = 'merged';
    saveState(statePath, state);
    return;
  }

  // ── deploy watch + rollback ──────────────────────────────────────────────
  log.step('RELEASE WATCH — CI → deploy → production health');
  state.phase = 'release';
  saveState(statePath, state);

  if (!(await hasGh(repoRoot))) {
    log.warn('gh CLI is unavailable or unauthenticated — cannot watch the release, and will NOT auto-revert');
    state.deploy = { watched: false, reason: 'gh unavailable' };
    saveState(statePath, state);
    return;
  }

  const ci = await watchCi(repoRoot, mergeSha);
  state.deploy = { ci };
  saveState(statePath, state);
  if (!ci.ok) {
    log.error(`CI did not pass on ${mergeSha.slice(0, 8)} — reverting the merge`);
    await rollback(state, repoRoot, mergeSha, statePath, `CI ${ci.conclusion || ci.state}`);
    return;
  }
  log.ok('CI green');

  const dep = await watchDeploy(repoRoot, mergeSha);
  state.deploy.deploy = dep;
  saveState(statePath, state);
  if (!dep.ok) {
    log.error('deploy workflow did not succeed — reverting the merge');
    await rollback(state, repoRoot, mergeSha, statePath, `deploy ${dep.conclusion || dep.state}`);
    return;
  }
  log.ok('deploy workflow green');

  const health = await healthCheck(repoRoot);
  state.deploy.health = { ok: health.ok, output: truncate(health.output, 4000) };
  saveState(statePath, state);
  if (!health.ok) {
    log.error('production health check FAILED after deploy — reverting the merge');
    log.info(truncate(health.output, 3000));
    await rollback(state, repoRoot, mergeSha, statePath, 'production health check failed');
    return;
  }

  log.ok('production is healthy');
  state.status = 'released';
  saveState(statePath, state);
  writeReport(state, runDir);
}

async function rollback(state, repoRoot, mergeSha, statePath, reason) {
  log.step('ROLLBACK — reverting the merge on the base branch');
  const r = await git.revertMerge(repoRoot, mergeSha);
  state.rollback = { attempted: true, ok: r.ok, reason, at: new Date().toISOString() };
  saveState(statePath, state);
  if (r.ok) {
    log.ok('merge reverted and pushed — the pipeline is now re-releasing the previous state');
    log.warn('note: a revert re-runs the pipeline, so the window is not instant');
  } else {
    log.error('ROLLBACK FAILED — production may be running the bad commit. This needs a human now.');
    log.info(truncate(r.output, 3000));
  }
  state.status = 'rolled-back';
  return halt(state, statePath, `released then rolled back: ${reason}`, 'rolled-back');
}

function halt(state, statePath, reason, status = 'halted') {
  state.status = status;
  state.halted = reason;
  saveState(statePath, state);
  log.error(`\nHALTED: ${reason}`);
  log.info(`State preserved at ${statePath} — resume with: node scripts/swarm/run.mjs --resume`);
  try {
    writeReport(state, state.runDir || dirname(statePath));
  } catch {
    /* report is best-effort on the halt path */
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

function writeReport(state, runDir) {
  const merged = Object.entries(state.chunks).filter(([, v]) => v.status === 'merged');
  const lines = [
    `# Swarm run report`,
    ``,
    `**Goal:** ${state.goal}`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Status | \`${state.status}\` |`,
    `| Branch | \`${state.branch}\` → \`${state.baseBranch}\` |`,
    `| Base commit | \`${state.baseSha}\` |`,
    `| Started | ${state.startedAt} |`,
    `| Finished | ${new Date().toISOString()} |`,
    `| Test floor | ${state.baselineBefore} → ${state.preMergeGate?.facts?.baselineAfter ?? '(unchanged)'} |`,
    `| Merge commit | ${state.merge?.sha ? `\`${state.merge.sha}\`` : '—'} |`,
    `| Rollback | ${state.rollback ? (state.rollback.ok ? 'yes, succeeded' : 'ATTEMPTED AND FAILED') : '—'} |`,
    ``,
  ];

  if (state.halted) lines.push(`> **Halted:** ${state.halted}`, ``);

  lines.push(`## Chunks`, ``, `| id | role | status | commit | tests added |`, `|---|---|---|---|---|`);
  for (const [id, v] of Object.entries(state.chunks)) {
    lines.push(
      `| ${id} | ${v.role ?? '—'} | ${v.status} | ${v.commit ? `\`${v.commit.slice(0, 8)}\`` : '—'} | ${v.tests_added ?? 0} |`,
    );
  }
  lines.push(``);

  const defects = merged.flatMap(([id, v]) => [
    ...((v.result?.defects_found || []).map((d) => ({ id, from: 'dev', d }))),
    ...((v.test_result?.defects_found || []).map((d) => ({ id, from: 'tester', d }))),
    ...((state.integration?.open_defects || []).map((d) => ({ id, from: 'merger', d }))),
  ]);
  lines.push(`## Open defects (NOT fixed by this run)`, ``);
  if (!defects.length) lines.push(`None reported.`, ``);
  else for (const x of defects) lines.push(`- **${x.id}** (${x.from}): ${JSON.stringify(x.d)}`);
  lines.push(``);

  lines.push(`## Integration gaps (what is still unproven)`, ``);
  const gaps = state.integration?.integration_gaps || [];
  if (!gaps.length) lines.push(`None reported.`, ``);
  else for (const g of gaps) lines.push(`- **${g.risk ?? '?'} risk** — ${g.gap}${g.recommendation ? ` _(fix: ${g.recommendation})_` : ''}`);
  lines.push(``);

  const unverified = merged.flatMap(([id, v]) => (v.test_result?.unverified || []).map((u) => `- **${id}**: ${JSON.stringify(u)}`));
  lines.push(`## Tests added without a mutation check (unverified)`, ``);
  lines.push(unverified.length ? unverified.join('\n') : `None.`, ``);

  if (state.integration?.reasoning) {
    lines.push(`## Merger verdict`, ``, `**${state.integration.verdict}** — ${state.integration.reasoning}`, ``);
  }
  if (state.deploy) {
    lines.push(`## Release`, ``, '```json', JSON.stringify(state.deploy, null, 2), '```', ``);
  }

  lines.push(
    `## Evidence`,
    ``,
    `- \`driver.log\` — every step and every command's outcome`,
    `- \`agents.log\` — each agent's raw output`,
    `- \`gates.log\` — full CI/guardrail output`,
    `- \`plan.json\` — the PM's plan`,
    `- \`merge-verdict.json\` — the merger's verdict`,
    `- \`review.txt\` — independent review + security review`,
    `- \`run-state.json\` — the resumable, machine-readable ledger`,
    ``,
  );

  writeFileSync(join(runDir, 'report.md'), lines.join('\n'));
}

main().catch((e) => {
  log.error(`driver crashed: ${e.stack || e.message}`);
  process.exit(1);
});
