# The agent swarm — unattended builds

An orchestrator-workers loop with an evaluator-optimizer inner cycle. You give it a goal; it
reconnoitres, decomposes, builds, tests, integrates, and — if you ask it to — merges to `main`
and watches the release, with no human in the loop.

```
node scripts/swarm/run.mjs --goal "..." [--merge] [--deploy-watch] [--resume]
```

**Start without `--merge`.** That runs the whole thing, leaves a green branch, and stops. You get
the report and the diff before anything reaches production. That is the intended first run.

## The eight roles

Each role is a skill under `.reasonix/skills/<name>/SKILL.md`, which makes it a subagent — so it
is reviewable markdown, editable without touching the driver, and `reasonix subagent list` is the
source of truth for what exists.

| Role | Owns | Why it exists |
|---|---|---|
| `swarm-pm` | The goal. Decomposes it into chunks, routes each to one specialist, re-plans on failure. | The brain. It is the only agent that sees the system whole. |
| `swarm-pm-assistant` | Reconnaissance: repo state, what already exists, current test floor, collision risks. | Keeps the PM's context spent on judgement instead of searching. |
| `swarm-dev-api` | `Controllers/`, `Services/`, `Program.cs` DI, DTOs, middleware. | C# / HTTP contract. |
| `swarm-dev-data` | `Repositories/`, Dapper SQL, `Data/Migrations/`, POS sync. | The layer whose hand-written snake_case→PascalCase mapping is a repeat offender. |
| `swarm-dev-frontend` | `api/`, stores, React Query, routing, types. | Data flow and behaviour, not appearance. |
| `swarm-dev-ui` | Components, layout, tokens, states, a11y, responsive. | Appearance and interaction, deliberately blind to business logic. |
| `swarm-test-unit` | Tests for a chunk's acceptance criteria. | Proves each new test can **fail** before accepting it. |
| `swarm-merger` | Cross-chunk integration tests, and the merge/block verdict. | Owns what no single chunk can prove. |

The four dev roles have **disjoint seams**. When a chunk needs to cross one, the agent reports
`blocked` with `needs: <role>` rather than reaching across — because two agents editing the same
file blind to each other is the failure mode the seams exist to prevent.

## What actually happens

```
preflight   roles installed? tree clean? baseline snapshotted?
brief       swarm-pm-assistant surveys the repo into brief.md
plan        swarm-pm emits plan.json  (validated: unique ids, known roles,
            non-empty acceptance criteria, acyclic and topologically ordered deps)
            ── per chunk, in order ──────────────────────────────────────────
            swarm-dev-*      implements in its seam, builds
            swarm-test-unit  authors tests, proves each can fail, raises .test-baseline
            driver gate      dotnet restore/build/test + all three guardrails
                             + the touched frontend's build/lint/test
            commit           one commit per green chunk = one revert unit
            ── on failure ─────────────────────────────────────────────────
            revert to the last green commit, digest the failure, retry
            after --max-attempts, hand the digest to swarm-pm to re-plan
integrate   swarm-merger writes the integration tests no chunk could write
pre-merge   driver re-runs CI + guardrails, checks diff size, checks the test
            floor did not drop, checks no danger path was touched
review      built-in `review` + `security-review` on the branch diff
merge       only with --merge. Executed by the driver, never by a model.
release     CI → deploy → production health check, then auto-revert on failure
```

Verification is never performed by the agent that produced the work: the tester checks the dev,
the guardrails check the tester, the merger checks them all, and the driver checks the merger.

## Why it can be trusted with `main`

The whole design assumes agents will sometimes be confidently wrong. Six things make an unattended
run survivable:

1. **Machine-readable contracts.** Every role ends with a JSON block. `swarm-pm` yields `plan.json`,
   devs yield `chunk-result`, the tester `test-result`, the merger `merge-verdict`. A role cannot
   claim success in prose — the driver reads `status`, not adjectives.
2. **The test floor is snapshotted and enforced.** The driver reads `.test-baseline` before any
   agent runs and refuses to merge if it went down. The cheapest way for a stuck agent to go green
   is to delete a failing test or lower the floor; this makes that structurally unable to land.
3. **Danger paths are never auto-merged.** A run that touches `.github/workflows/**`,
   `scripts/check-*.sh`, `.githooks/**` or `.test-baseline` is halted, not merged — the guardrail
   cannot audit its own removal, so a human reads that diff.
4. **Danger chunks halt and report.** A chunk the PM flags as `danger` (migration order,
   `Payment__UseMockGateway`, a guardrail script) stops the run for a human. Those have caused
   production incidents here and no automated check fully judges them.
5. **Irreversible actions are driver-only.** `git merge`, `git push` and `git revert` are executed
   by `run.mjs` with a fixed shape, and only when `--merge` was passed. No model decides to land
   code on `main`. Nothing force-pushes, resets `--hard`, or rewrites history.
6. **The loop is bounded.** `--max-attempts` (3), `--max-replans` (3), `--deadline-min` (240), a
   chunk cap, and a kill switch. An unattended system with no ceiling is not autonomous, it is
   unsupervised.

Bounded retries are not stinginess. A failure is **classified** before it is retried —
`defect` (code wrong), `test_bug` (test wrong), `pre-existing` (already broken on the base
commit), `infra`, `unavailable` (needs real Stripe / a registered Apple Pay domain), `scope` (the
chunk was carved wrong). Retrying an `infra` or `unavailable` failure just burns budget at a fixed
probability of nonsense, so those go back to the PM as a re-plan or an honest abandonment.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--goal <text>` | — | Required (unless `--resume`). |
| `--merge` | off | Execute the merge once the merger approves. Without it the run stops with a green branch. |
| `--deploy-watch` | off | After merging, watch CI → deploy → production health, and revert the merge if any fails. Implies `--merge`. |
| `--resume` | off | Continue the most recent run from `.swarm/runs/<id>/run-state.json`. |
| `--branch <name>` | `swarm/<slug>-<ts>` | Branch to build on. |
| `--base <branch>` | `main` | Branch to fork from and merge back into. |
| `--max-chunks <n>` | 12 | Reject a plan larger than this. A 30-chunk plan is a sign the goal is too big. |
| `--max-attempts <n>` | 3 | Attempts per chunk before the PM re-plans. |
| `--max-replans <n>` | 3 | Re-plan cycles before the run halts. |
| `--deadline-min <n>` | 240 | Wall-clock ceiling for the whole run. |
| `--model <name>` | Reasonix default | Model for every agent. |
| `--skip-frontend-gate` | off | Skip the frontend gate. Only when the run provably cannot touch a frontend. |
| `--dry-run` | off | Brief + plan + validation only. Cheap, and the best way to see whether the PM carves your goal sensibly. |

## Kill switch

```bash
touch .swarm/HALT     # the loop stops at the next checkpoint
rm .swarm/HALT        # and resumes where it left off
```

There is no `kill -9` for a half-finished chunk: attempts revert to the last green commit, so an
interrupted run leaves the branch at a state that passed CI.

## Where everything goes

`.swarm/runs/<timestamp>-<slug>/` (gitignored — it is an audit trail, not source):

| File | What it is |
|---|---|
| `report.md` | The run report. Read this first. |
| `run-state.json` | Machine-readable, resumable ledger: every chunk, attempt, verdict, commit. |
| `plan.json` | The PM's plan, including the integration criteria. |
| `brief.md` | The PM assistant's reconnaissance. |
| `merge-verdict.json` | The merger's verdict, open defects, integration gaps. |
| `review.txt` | The independent review + security review output. |
| `driver.log` | Every step and every command's outcome. |
| `agents.log` | Each agent's raw output. |
| `gates.log` | Full CI/guardrail output. |

**Read `report.md`, then `merge-verdict.json`.** The report has an *Open defects* section and an
*Integration gaps* section that deliberately list what the run did **not** fix and did **not**
prove. A run that reports no gaps is usually one that did not look.

## `--deploy-watch` and the rollback caveat

Merging to `main` here is a production release: `deploy.yml` waits for CI on the commit, deploys
the API to Fly, runs `check-deployment-health.sh`, and waits for Vercel to report `READY`.

With `--deploy-watch` the driver watches that pipeline and then runs the health check **itself** —
"the deploy job passed" and "the site works" are different claims. On failure it reverts the merge
commit and pushes the revert.

**The revert is not instant.** It re-runs the pipeline on the reverted state, so a bad commit can
serve traffic for a few minutes. This shortens the window; it does not eliminate it. If `gh` is
unavailable the driver says so and does **not** pretend it is watching. Treat the first few
`--deploy-watch` runs as an experiment, not as a guarantee.

## Verification

```bash
node scripts/swarm/selftest.mjs
```

38 checks over the logic that must be right before an unattended merge is allowed: the agent-output
boundary (`extractJson`), the guardrail's unusual baseline parser (mirrored deliberately, including
its first-digit-anywhere quirk), the danger-path interlock, and every plan-validation rule.

## Known limits — read these before trusting a run

- **Chunks run sequentially, not concurrently.** Deliberate: the coordination tax of parallel
  agents (conflicting edits, stale state, duplicated work) is what makes multi-agent systems fail,
  and most of this project's work is not parallelisable anyway. It is slower and it is correct.
- **Frontend behaviour is thinly tested.** `npm run build` is a real typecheck and the strongest
  frontend check that exists; the unit suites are small and there is no blocking browser run. A
  component can render wrong and still be green.
- **The visual layer is barely verified automatically.** The vision judge has ~±2 points of
  run-to-run variance and runs nightly, off the blocking path. Anything `swarm-dev-ui` reports is
  mostly unverified, and its skill requires it to say so.
- **`Repositories/*` need a live Postgres**, and there is no integration-test strategy for them.
  The merger is told to name this as an explicit gap rather than fake it. Until that changes,
  data-layer changes are the least verified part of any run.
- **Apple Pay cannot be verified here** — it needs a registered domain and is not testable in
  Chrome or on localhost. No green run says anything about it.
- **`--merge` on a repo without branch protection means the swarm lands code on `main` directly.**
  CI catches what CI catches. The interlocks above are real, but they are not a substitute for
  reading `report.md` after a run.
- **The first run of anything is untested.** This swarm has been verified against its own selftest
  and a dry run, not against a full end-to-end merge. Run it without `--merge` first.

## Adapting it to another repo

The driver is written to be copied. To move it:

1. Change `DEV_ROLES` in `run.mjs` and add matching `SKILL.md` files with disjoint seams.
2. Update `scripts/swarm/lib/gates.mjs` — replace `runCiGate` and `frontendGate` with that repo's
   CI sequence, and set `DANGER_PATHS` to that repo's own guardrails.
3. Keep the shape: bounded attempts, per-attempt revert, machine-readable contracts, a
   driver-only merge path, and a test floor you refuse to let drop.
