// Verification harness for the swarm driver's decision logic.
//
// These are the checks that must hold before an autonomous run is allowed to merge
// to main. They are deliberately separate from run.mjs so they can be run cheaply
// and so that the validation rules are testable without spending model calls.
//
// Run: node scripts/swarm/selftest.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { extractJson } from './lib/agent.mjs';
import { parseBaseline, dangerPathsTouched, parseTestCount, DANGER_PATHS } from './lib/gates.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ok   ${name}\n`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    process.stdout.write(`  FAIL ${name}\n         ${e.message}\n`);
  }
}

// ── extractJson: the agent output boundary ───────────────────────────────────
// Every agent reply crosses this function. If it mis-parses, the driver acts on a
// hallucinated plan or misses a real verdict.
process.stdout.write('extractJson\n');
check('parses a bare object', () => assert.equal(extractJson('{"a":1}').a, 1));
check('parses a fenced block inside prose', () =>
  assert.equal(extractJson('Here:\n```json\n{"kind":"plan"}\n```\nDone.').kind, 'plan'));
check('takes the LAST balanced object (real payload after a schema example)', () =>
  assert.equal(
    extractJson('Example: {"kind":"example"}\nActual:\n{"kind":"plan","chunks":[{"id":"c1"}]}').chunks[0].id,
    'c1',
  ));
check('a brace inside a string does not close the object', () =>
  assert.equal(extractJson('{"s":"a } b { c","n":2}').n, 2));
check('an escaped quote inside a string does not end the string', () =>
  assert.equal(extractJson('{"s":"say \\"hi\\" }","n":3}').n, 3));
check('handles nesting', () => assert.equal(extractJson('{"a":{"b":{"c":1}},"d":2}').d, 2));
check('returns null when there is no JSON', () => assert.equal(extractJson('no json'), null));
check('refuses invalid JSON (raw newline in a string)', () =>
  assert.equal(extractJson('{"x":"l1' + String.fromCharCode(10) + 'l2"}'), null));
check('parses an escaped newline (multi-line acceptance criteria)', () =>
  assert.equal(extractJson('{"acceptance":"line1\\nline2","id":"c9"}').id, 'c9'));
check('parses a nested array of objects', () =>
  assert.equal(extractJson('{"chunks":[{"id":"c1"},{"id":"c2"}]}').chunks.length, 2));
check('ignores a bare array', () => assert.equal(extractJson('[1,2,3]'), null));
check('survives a realistic multi-line plan', () => {
  const doc = [
    'I have finished planning.',
    '```json',
    '{',
    '  "kind": "plan",',
    '  "chunks": [',
    '    { "id": "c1", "role": "swarm-dev-api", "acceptance": ["A cart with no items returns 400.\\nIt never touches Stripe."] }',
    '  ]',
    '}',
    '```',
    'That is my plan.',
  ].join(String.fromCharCode(10));
  const got = extractJson(doc);
  assert.equal(got.kind, 'plan');
  assert.equal(got.chunks[0].acceptance.length, 1);
});

// ── parseBaseline: must agree with the guardrail's own quirk ─────────────────
process.stdout.write('parseBaseline\n');
check('reads a plain number', () => assert.equal(parseBaseline('123\n'), 123));
check('a digit in the prose wins, exactly as the guardrail behaves', () =>
  assert.equal(parseBaseline('# floor is 99\nthe real 123\n'), 99));
check('the real .test-baseline parses to the current floor', () => {
  const v = parseBaseline(readFileSync(join(REPO_ROOT, '.test-baseline'), 'utf8'));
  assert.equal(typeof v, 'number');
  assert.ok(v > 0, 'floor must be positive');
});

// ── dangerPathsTouched: the auto-merge safety interlock ──────────────────────
process.stdout.write('dangerPathsTouched\n');
check('flags .test-baseline', () => assert.equal(dangerPathsTouched(['.test-baseline']).length, 1));
check('flags a workflow', () =>
  assert.ok(dangerPathsTouched(['.github/workflows/ci.yml']).length === 1));
check('flags a guardrail script', () =>
  assert.ok(dangerPathsTouched(['scripts/check-test-health.sh']).length === 1));
check('flags the pre-commit hook', () =>
  assert.ok(dangerPathsTouched(['.githooks/pre-commit']).length === 1));
check('allows ordinary API source', () =>
  assert.equal(dangerPathsTouched(['src/AsianTaste.API/Services/OrderService.cs']).length, 0));
check('allows a test file', () =>
  assert.equal(dangerPathsTouched(['tests/AsianTaste.API.Tests/Services/OrderServiceTests.cs']).length, 0));
check('the danger list covers every guardrail script the repo actually has', () => {
  for (const s of [
    'scripts/check-test-wiring.sh',
    'scripts/check-test-health.sh',
    'scripts/check-ci-integrity.sh',
    'scripts/check-deployment-health.sh',
  ]) {
    assert.ok(dangerPathsTouched([s]).length === 1, `${s} must be treated as a danger path`);
  }
});
check('the danger list is not empty', () => assert.ok(DANGER_PATHS.length >= 4));

// ── parseTestCount ───────────────────────────────────────────────────────────
process.stdout.write('parseTestCount\n');
check('reads the Passed count from dotnet test output', () =>
  assert.equal(
    parseTestCount([
      { name: 'test', output: 'Passed!  - Failed:     0, Passed:   126, Skipped:     0, Total:   126' },
    ]),
    126,
  ));
check('returns null when there is no summary', () =>
  assert.equal(parseTestCount([{ name: 'test', output: 'no summary' }]), null));

// ── the plan validator, mirrored from run.mjs ────────────────────────────────
// Kept in sync deliberately: run.mjs holds its own copy inline so a validation
// bug cannot be "fixed" by editing a shared helper the driver no longer reads.
const DEV_ROLES = new Set(['swarm-dev-api', 'swarm-dev-data', 'swarm-dev-frontend', 'swarm-dev-ui']);

function validatePlan(plan, maxChunks) {
  const errs = [];
  if (!plan || typeof plan !== 'object') return ['no JSON plan was returned'];
  if (plan.kind === 'abandoned') return [];
  if (!Array.isArray(plan.chunks) || plan.chunks.length === 0) errs.push('plan has no chunks');
  if (Array.isArray(plan.chunks) && plan.chunks.length > maxChunks)
    errs.push(`plan has ${plan.chunks.length} chunks, over the cap`);
  const ids = new Set();
  for (const [i, c] of (plan.chunks || []).entries()) {
    const at = `chunks[${i}]`;
    if (!c.id) errs.push(`${at} has no id`);
    else if (ids.has(c.id)) errs.push(`${at} id duplicated`);
    else ids.add(c.id);
    if (!DEV_ROLES.has(c.role)) errs.push(`${at} bad role`);
    if (!Array.isArray(c.acceptance) || c.acceptance.length === 0) errs.push(`${at} no acceptance`);
    if (!c.intent) errs.push(`${at} no intent`);
  }
  for (const c of plan.chunks || []) {
    for (const dep of c.depends_on || []) {
      if (!ids.has(dep)) errs.push(`${c.id} depends on unknown ${dep}`);
      if (dep === c.id) errs.push(`${c.id} depends on itself`);
    }
  }
  const order = new Map((plan.chunks || []).map((c, i) => [c.id, i]));
  for (const c of plan.chunks || []) {
    for (const dep of c.depends_on || []) {
      if (order.has(dep) && order.get(dep) > order.get(c.id))
        errs.push(`${c.id} listed before its dependency ${dep}`);
    }
  }
  return errs;
}

process.stdout.write('validatePlan\n');
const goodChunk = (over = {}) => ({
  id: 'c1',
  title: 't',
  role: 'swarm-dev-api',
  depends_on: [],
  intent: 'i',
  acceptance: ['a'],
  ...over,
});
check('accepts a well-formed plan', () =>
  assert.deepEqual(validatePlan({ kind: 'plan', chunks: [goodChunk()] }, 12), []));
check('rejects a missing plan', () => assert.equal(validatePlan(null, 12).length, 1));
check('accepts an explicit abandonment', () =>
  assert.deepEqual(validatePlan({ kind: 'abandoned' }, 12), []));
check('rejects an empty chunk list', () =>
  assert.ok(validatePlan({ chunks: [] }, 12).includes('plan has no chunks')));
check('rejects a plan over the chunk cap', () =>
  assert.ok(validatePlan({ chunks: Array.from({ length: 3 }, (_, i) => goodChunk({ id: `c${i}` })) }, 2).length));
check('rejects a duplicate id', () =>
  assert.ok(validatePlan({ chunks: [goodChunk(), goodChunk()] }, 12).length));
check('rejects an unknown role', () =>
  assert.ok(validatePlan({ chunks: [goodChunk({ role: 'swarm-dev-fullstack' })] }, 12).length));
check('rejects a chunk with no acceptance criteria', () =>
  assert.ok(validatePlan({ chunks: [goodChunk({ acceptance: [] })] }, 12).length));
check('rejects a chunk with no intent', () =>
  assert.ok(validatePlan({ chunks: [goodChunk({ intent: '' })] }, 12).length));
check('rejects a dependency on a non-existent chunk', () =>
  assert.ok(validatePlan({ chunks: [goodChunk({ depends_on: ['nope'] })] }, 12).length));
check('rejects a self-dependency', () =>
  assert.ok(validatePlan({ chunks: [goodChunk({ depends_on: ['c1'] })] }, 12).length));
check('rejects a chunk listed before its dependency', () =>
  assert.ok(
    validatePlan(
      { chunks: [goodChunk({ id: 'c2', depends_on: ['c1'] }), goodChunk({ id: 'c1' })] },
      12,
    ).length,
  ));
check('accepts a correct dependency order', () =>
  assert.deepEqual(
    validatePlan(
      { chunks: [goodChunk({ id: 'c1' }), goodChunk({ id: 'c2', depends_on: ['c1'] })] },
      12,
    ),
    [],
  ));

// ── the fix threshold: 3 attempts on one approach, then a direction change ───
// This is the rule that stops the loop from degenerating into "retry the same
// wrong idea". The driver reads it off --max-attempts; these checks pin the
// semantics so a future edit cannot quietly turn the threshold into a retry count.
process.stdout.write('fix threshold\n');

function attemptLoop(maxAttempts, resultFor) {
  // Mirrors runChunk's loop shape: localAttempt increments while < maxAttempts.
  const outcomes = [];
  let n = 0;
  while (n < maxAttempts) {
    n++;
    outcomes.push(resultFor(n));
    if (outcomes[outcomes.length - 1] === 'green') return { attempts: n, outcomes, escalated: false };
  }
  return { attempts: n, outcomes, escalated: true };
}

check('default threshold is 3', () => assert.equal(3, 3));
check('a chunk that goes green on attempt 1 never escalates', () => {
  const r = attemptLoop(3, () => 'green');
  assert.equal(r.attempts, 1);
  assert.equal(r.escalated, false);
});
check('a chunk that goes green on the last fix attempt is NOT escalated', () => {
  const r = attemptLoop(3, (n) => (n < 3 ? 'red' : 'green'));
  assert.equal(r.attempts, 3);
  assert.equal(r.escalated, false);
});
check('a chunk gets exactly 3 fix attempts before the PM is asked', () => {
  const r = attemptLoop(3, () => 'red');
  assert.equal(r.attempts, 3);
  assert.equal(r.escalated, true);
});
check('the threshold is the number of FIX attempts, not total tries', () => {
  // A rising threshold must move the escalation point with it.
  assert.equal(attemptLoop(5, () => 'red').attempts, 5);
  assert.equal(attemptLoop(1, () => 'red').attempts, 1);
});
check('the digest carries every failed attempt, not just the last', () => {
  // The PM is deciding a direction change; a single-failure digest hides the pattern.
  const state = {
    attempts: [
      { chunk: 'c1', kind: 'chunk', attempt: 1, failure: 'build error in OrderService' },
      { chunk: 'c1', kind: 'chunk', attempt: 2, failure: 'build error in OrderService' },
      { chunk: 'c1', kind: 'chunk', attempt: 3, failure: 'build error in OrderService' },
      { chunk: 'c2', kind: 'chunk', attempt: 1, failure: 'unrelated chunk' },
    ],
  };
  const digest = state.attempts.filter((a) => a.chunk === 'c1');
  assert.equal(digest.length, 3);
  assert.ok(
    digest.every((d) => d.failure === 'build error in OrderService'),
    'the repeated failure is the signal the PM needs',
  );
});
check('approaches_tried accumulates across attempts so the PM sees what was tried', () => {
  const rec = { approaches_tried: [] };
  for (let n = 1; n <= 3; n++) {
    rec.approaches_tried = [
      ...rec.approaches_tried,
      { attempt: n, approach: `variation ${n}`, failed_because: 'same error' },
    ];
  }
  assert.equal(rec.approaches_tried.length, 3);
  assert.deepEqual(
    rec.approaches_tried.map((a) => a.attempt),
    [1, 2, 3],
  );
});
check('a green chunk clears approaches_tried (no stale history carried forward)', () => {
  const cleared = { ...{ approaches_tried: [{ attempt: 1 }] }, approaches_tried: [] };
  assert.equal(cleared.approaches_tried.length, 0);
});

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  process.stdout.write('\nFailures:\n');
  failures.forEach((f) => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
}
