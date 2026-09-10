# Guardrails — every build must prove it did not fail quietly

This repo runs three guardrails on every push and pull request. They exist because the
project has already shipped two failures that a normal green build did not catch:

1. **Fake coverage** — `src/asian-taste-customer/tests/e2e/checkout.spec.ts` was a tracked
   Playwright suite with no runner installed and no matching selectors. It read as "checkout
   is e2e tested" and tested nothing.
2. **Silent status-update failure** — `UpdateOrderStatusAsync` assigned text to a PostgreSQL
   enum column. The webhook reported `"Invalid signature"` while the real cause was a SQL
   type error, so the symptom pointed at the wrong subsystem.

Each guardrail targets one of those failure modes.

## The three guardrails

| Script | Question it answers | Fails when |
|---|---|---|
| `scripts/check-test-wiring.sh` | Can every tracked test file actually **run**? | A test file has no runner, imports an undeclared dependency, or its project is missing from the solution |
| `scripts/check-test-health.sh` | Did the suite really run, and did it **mean** something? | Any test is skipped, a test file has zero assertions, 0 tests ran, tests failed, or the count dropped below `.test-baseline` |
| `scripts/check-ci-integrity.sh` | Are the guardrails still **armed**, and is the change reviewable? | A guardrail step is wrapped in `continue-on-error`, a guardrail script is deleted, the workflow stops triggering, or the diff exceeds the size thresholds |

Run all three locally:

```bash
./scripts/check-test-wiring.sh
./scripts/check-test-health.sh
./scripts/check-ci-integrity.sh
```

## Anti-vacuity

A guardrail that silently passes is worse than none. All three:

- **assert their own preconditions** (expected paths must exist), so a moved file fails loudly
  instead of printing a false "all clear";
- **have been proven RED on a real violation**, and GREEN after the fix — see the negative
  controls in `CI_TEST_REPORT.md`.

Every guardrail has also been tested against a synthetic violation:

| Guardrail | Negative control | Observed |
|---|---|---|
| test-wiring | re-added a Playwright spec with no runner | exit 1, named the file and both root causes |
| test-health | raised `.test-baseline` above the real count | exit 1, "test count regressed" |
| test-health | marked one test `[Fact(Skip = ...)]` | exit 1, caught **both** statically and at runtime |
| ci-integrity | removed a guardrail step from CI | exit 1, "CI no longer runs …" |
| ci-integrity | lowered size thresholds | exit 1, flagged files/lines/single-file |

## `.test-baseline` — the shrinking-suite floor

`.test-baseline` holds the minimum number of tests the API suite must run.

- **Adding tests:** raise the number in the same commit. The suite growing is fine; the floor
  must not drift silently.
- **Removing a test:** lower it in a **separate, explained** commit. Otherwise the guardrail
  cannot distinguish a deliberate refactor from sabotage.

## Tuning the thresholds

`check-ci-integrity.sh` reads environment variables so thresholds can be adjusted without
editing the script:

| Variable | Default | Meaning |
|---|---|---|
| `MAX_FILES_CHANGED` | 60 | Max files touched in one change |
| `MAX_LINES_CHANGED` | 2500 | Max added+removed lines in one change |
| `MAX_SINGLE_FILE_LINES` | 600 | Max lines changed in a single file |

Defaults are deliberately generous — these are tripwires for "this cannot be reviewed",
not style rules. Raise them only with a reason.

## What is still NOT guarded

Being explicit about the gaps matters as much as the coverage:

- **Frontend behaviour is untested.** Neither app has a `test` script or a test runner
  installed. `npm run build` (typecheck) is the strongest frontend check that exists.
  Adding Vitest is the durable fix.
- **Lint is non-blocking by design** (`continue-on-error: true`) because of pre-existing debt
  (admin 6 errors, customer 11 problems) tracked as item A8 in `MAJOR_UPDATE_PLAN.md`. The
  CI-integrity guardrail allows this specific case but would fail if a *guardrail* step were
  made non-blocking.
- **Guardrail scripts have not run on Linux in CI yet.** They avoid bash-4+ features, but the
  first GitHub Actions run is the real test.
- **No integration tests.** `Repositories/*.cs` (including the 1000-line `OrderRepository`)
  need a database; no strategy exists yet.

## Agents

- **`.reasonix/skills/test-author/`** — authors new test cases and *proves each can fail* via a
  mandatory mutation check.
- **`.reasonix/skills/ci-test-guardian/`** — reproduces the CI sequence locally and keeps it green.
