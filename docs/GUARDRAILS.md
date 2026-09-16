# Guardrails — every build must prove it did not fail quietly

This repo runs three guardrails on every push and pull request. They exist because the
project has already shipped two failures that a normal green build did not catch:

1. **Fake coverage** — a tracked Playwright suite at
   `src/asian-taste-customer/tests/e2e/checkout.spec.ts` with no runner installed and no
   matching selectors. It read as "checkout is e2e tested" and tested nothing. *The spec
   was later deleted, not repaired; the guardrail is what remains of it.*
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

## Checks are tiered by cost, and each check lives in exactly one tier

The slow part of a guardrail set is almost never the guardrail. Of the two above that
are static, one takes 0.09s and the other 0.06s; the third runs the whole suite. So the
tiers are:

| Tier | Where it runs | What is in it | Budget |
|---|---|---|---|
| Fast | `.githooks/pre-commit`, on every commit | `check-test-wiring.sh`, `check-ci-integrity.sh --static-only` | ~0.7s wall |
| Mid | CI, on every push and PR | the full suite (`dotnet test`) once, `check-test-health.sh` judging that run, frontend lint + test + build | minutes |
| Slow | `ui-quality.yml`, nightly at 18:00 UTC or on dispatch | the UI quality loop: PostgreSQL, the API, two dev servers, screenshots, the vision judge | tens of minutes |

Three rules keep it that way:

1. **Judge the run, do not repeat it.** `check-test-health.sh` reads the TRX that CI's
   `Test` step already wrote when `TEST_RESULTS_DIR` is set. Unset, it runs the suite
   itself, which is the local workflow. The guardrail used to re-run `dotnet test` after
   the `Test` step had just done so — the same signal, paid for twice, and rebuilding
   because it had no `--no-build`.
2. **Nondeterministic and expensive checks stay off the blocking path.** The vision
   judge has roughly ±2 points of run-to-run variance, so a hard gate would fail
   unrelated PRs. It reports on a schedule; a human reads it.
3. **A check that only ever runs in CI gets bypassed.** That is the argument for the
   fast tier existing at all — see below.

## The fast tier (opt-in)

```bash
git config core.hooksPath .githooks
```

This is per-clone configuration, which is why it is a documented command rather than
something the repository sets for you. Note that `core.hooksPath` means *only*
`.githooks` is consulted: the hook calls `scripts/check-*.sh` by absolute repo path so
one clone cannot poison it, and `git commit --no-verify` skips the tier entirely.

`check-test-health.sh` is deliberately **not** in the hook. It runs the suite, and a hook
slow enough to interrupt work is one people learn to bypass — which is worse than not
having the hook. It runs in CI, where waiting is expected.

`--static-only` exists for this tier: the diff-size tripwire measures a committed change
against its base, which is not a claim a pre-commit hook can make, so the hook validates
the working tree instead. It still refuses to let a guardrail script be deleted.

## Where the time actually went (before this was tiered)

Measured on the API job:

| | Before | After |
|---|---|---|
| Suite runs per CI run | 2 (`Test`, then `check-test-health.sh`) | 1 |
| `check-test-health.sh` local cost | 7.55s (rebuild + run) | ~0.05s (reads TRX) |
| UI quality loop | every push **and** every PR | nightly + manual |
| NuGet restore | cold, every job | cached, keyed on the project files |
| A `ui-shots/`-only push | full API + frontend build | no run at all |

## Anti-vacuity

A guardrail that silently passes is worse than none. All three:

- **assert their own preconditions** (expected paths must exist), so a moved file fails loudly
  instead of printing a false "all clear";
- **have been proven RED on a real violation**, and GREEN after the fix — see the negative
  controls in `docs/archive/CI_TEST_REPORT_artifact.md`.

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

- **Frontend behaviour is mostly untested.** Both apps now have a `test` script and a runner
  (see `src/asian-taste-admin/src/**/*.test.ts` and the customer app), and CI runs `npm test`,
  but the suites are thin — three test files across both apps. `npm run build` (typecheck) is
  still the strongest frontend check that exists.
- **Lint is blocking in CI.** The earlier `continue-on-error` and the debt behind it (item A8)
  were cleared when the UI work landed, so a lint error now fails the build. The CI-integrity
  guardrail rejects `continue-on-error` on any guardrail step; lint is a normal blocking step.
- **The pre-commit tier can be bypassed** with `git commit --no-verify`, and it only runs for
  clones that opted in via `core.hooksPath`. It is a fast-feedback convenience, not a control —
  CI is the control, and it runs on everything that reaches the remote.
- **Guardrail scripts have not run on Linux in CI yet.** They avoid bash-4+ features, but the
  first GitHub Actions run is the real test. `--static-only` and the TRX-reading path in
  `check-test-health.sh` are both new and are the parts most worth watching on that run.
- **No integration tests.** `Repositories/*.cs` (including the 1000-line `OrderRepository`)
  need a database; no strategy exists yet.
- **Nothing runs the UI loop before a merge.** It is nightly, so a UI regression introduced
  today is reported tomorrow unless someone dispatches the workflow by hand. That is the
  deliberate trade for taking tens of minutes off every PR.

## Agents

- **`.reasonix/skills/test-author/`** — authors new test cases and *proves each can fail* via a
  mandatory mutation check.
- **`.reasonix/skills/ci-test-guardian/`** — reproduces the CI sequence locally and keeps it green.
