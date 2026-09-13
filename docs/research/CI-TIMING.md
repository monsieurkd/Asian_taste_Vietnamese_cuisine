# CI timing: measured, not assumed

Written 2026-09-13, after you mentioned "each test takes like 30 mins".

## The 30 minutes is not the test suite

Measured per-job durations from real runs:

| Job | Duration |
|---|---|
| Guardrails (CI integrity) | **4s** |
| API (build + test) | **41s** |
| Frontend (asian-taste-customer) | **42s** |
| Frontend (asian-taste-admin) | **41s** |
| **Whole CI run (jobs in parallel)** | **~50s** |

Locally, the 104-test suite runs in **0.65s** (`dotnet test` reports
`Duration: 647 ms`; wall clock 3.0s including startup).

So the test suite is measured in **milliseconds**, and CI in **under a minute**.
Nothing here takes 30 minutes.

## Where 30 minutes comes from

Two real things, neither of them the test suite:

### 1. The UI quality loop

The genuine slow check. It starts PostgreSQL, the API and both frontends, captures
screenshots via Playwright, then asks a vision model to score them. Tens of
minutes, and its own header says so. It is the only thing in the repo that costs
this much.

It was **moved out of CI and into a nightly schedule** (`ui-quality.yml`,
`schedule:` + `workflow_dispatch:` only). That is the right call: its verdict is
advisory — the judge has roughly ±2 points of run-to-run variance — so making every
push pay tens of minutes for a non-gating check was pure cost.

### 2. GitHub runner queueing

Observed twice in this session:

- A run reported **17m35s** wall clock. Its jobs did not start until 16 minutes
  in — created 04:40:55, first job started 04:56:20 — and then each ran about a
  minute (`Wait for CI` 65s, `Deploy API` 61s, `Verify customer app` 4s). The
  16 minutes was queue time; the work was ~2 minutes.
- A separate run: 16 minutes wall clock, ~50s of actual jobs.

Evidence for the first, reproducible:

```bash
gh api repos/OWNER/REPO/actions/runs/34738457261/jobs \
  --jq '.jobs[] | "\(.name): started=\(.started_at) completed=\(.completed_at)"'
```

So a run can *report* 16–17 minutes while doing one minute of work. This is
runner availability on GitHub's side, not anything in the repo. Worth knowing
before optimising further: it is the difference between "our CI is slow" and
"our CI waited".

## What the other agent changed

Commits `0f1c199` .. `7367f31` (authored by the CI-optimisation agent):

| Change | Effect |
|---|---|
| Moved the UI loop out of `ci.yml` into the nightly workflow | Removes the only tens-of-minutes job from every push |
| Consolidated the two frontend jobs | 5 jobs → 4 |
| `check-test-health.sh` now reads the TRX from the test step instead of re-running `dotnet test` | Removes a second full suite run; saves ~40s and a rebuild |
| Added `.githooks/pre-commit` | Fast static guardrails before a commit lands |
| Documented check tiers in `docs/GUARDRAILS.md` | Makes "which check runs where" explicit |

**Reviewed and sound.** Specifically checked for the failure this kind of change
usually introduces:

- `check-test-health.sh` still fails on a shrunken, empty or corrupt suite. It has
  not been reduced to "the tests ran, therefore pass" — reading the TRX rather than
  re-running is a genuine saving with the teeth intact.
- The one `if: always()` is on the **artifact upload**, not a guardrail step, so
  results still upload after a failure and nothing is hidden by it.
- No guardrail was wrapped in `continue-on-error`, confirmed by
  `check-ci-integrity.sh` passing (that is the exact thing it exists to catch).
- `ci.yml` 239 → 136 lines, `ui-quality.yml` → schedule-only, with no `push` trigger.

All three guardrails pass, 104 tests pass, latest CI is green in 45s.

## So: is there anything left to cut?

**Not much, and further cutting is now a risk.** The remaining ~50s is:

- ~40s: `dotnet build` + `dotnet test` — mostly restore and compile, not test
  execution (the tests themselves are 0.65s)
- ~40s: two frontend installs and builds, in parallel with the API job
- ~4s: guardrails

The only meaningful lever left is **caching** (NuGet packages, npm store). That
would shave seconds, not minutes, and adds cache-invalidation failure modes that
show up as mysterious red builds. Given CI is already under a minute and jobs run
in parallel, the honest answer is that this is done.

**If a run looks slow, check whether it was queued before changing anything.**

## The measurement trap to avoid

A single slow run is not evidence. Two runs in this session looked like 16–17
minute CI, and both were runner queueing. Measure per-job durations via the API
rather than the run's wall clock:

```bash
gh api "repos/OWNER/REPO/actions/runs/RUN_ID/jobs" \
  --jq '.jobs[] | "\(.name): \((((.completed_at|fromdate) - (.started_at|fromdate))))s"'
```

That reports time actually spent on the job, which is the number worth optimising.
