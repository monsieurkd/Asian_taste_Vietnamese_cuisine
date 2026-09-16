# Paseo workflow plan

Status: **partly enacted.** Written 2026-09-13; setup performed 2026-09-16 — see
"Setup as performed" at the end.

## What Paseo is here

A wrapper that lets coding tasks be driven from a phone, so nobody has to sit at
the machine. It is not another agent — it is a *remote control* for agents. That
distinction shapes everything below: the risk is not two agents disagreeing, it is
**work being merged while unattended, against a repo whose safety net assumes
someone is watching.**

## The actual problem to solve

Three failure modes, in order of how much they cost:

1. **A remote session commits something broken**, and nobody notices until the
   next time someone is at the computer.
2. **A remote session runs something destructive** — a migration, a seed, a
   `git reset` — against the production database, which is reachable from this
   repo via a Fly secret.
3. **Two sessions edit the same files** and produce a merge that passes CI while
   containing neither change intact.

Everything below is about these three.

## What is already in place

This is a better starting position than it looks:

| Control | State | Why it helps remotely |
|---|---|---|
| `.githooks/pre-commit` | active (`core.hooksPath=.githooks`) | Runs the two static guardrails (~0.4s). A broken commit cannot be created from a phone. |
| CI on push | 4 jobs, ~1 min | Real tests + frontends + guardrails on every push. |
| `check-test-health.sh` | reads TRX, fails on a shrunken or empty suite | A remote session cannot quietly delete tests to make CI pass. |
| `check-ci-integrity.sh` | blocks disarming guardrails, size-caps diffs | A remote session cannot weaken its own safety net unnoticed. |
| Deploy gate | waits for CI green before deploying | A red build does not reach production. |
| UI loop | nightly, advisory | Deliberately not gating, so a flaky judge cannot block remote work. |

The pre-commit hook is the important one. Its comment already states the principle
that makes remote work safe: **one check, one tier** — fast checks locally, slow
checks in CI. Keep that.

## What to change

### 1. Make the hook install automatic (highest value)

`core.hooksPath` is per-clone and cannot be committed, so a fresh clone — or a
remote sandbox — silently has **no** pre-commit guard while looking identical.
A safety net that is absent is worse than none, because it is trusted.

Add to the repo an install step that is impossible to skip. Two options:

- A `make setup` / `npm run setup` that every documented workflow starts with.
- Better: have the CI integrity check **fail** when `core.hooksPath` is unset in a
  developer context, so the gap is loud rather than silent.

### 2. Decide who owns `main`

Two agents pushing to `main` is how the third failure mode happens. Pick one:

- **Preferred: remote sessions work on branches.** Paseo opens a branch, pushes it,
  CI runs, and a human merges. Costs one tap and removes the whole class.
- **Acceptable: one session at a time.** Simple, but relies on discipline that
  fails exactly when you are busy — which is when remote sessions get used.

Do not leave it implicit. The current setup assumes `main` is pushed directly,
which is fine when one person is watching and not when nobody is.

### 3. Separate "needs a human" from "safe remotely"

Write the list down and make it enforceable, not remembered. Safe from a phone:

- reading code, running `dotnet test`, editing frontend/API source
- opening a PR, reading CI results

Needs a person, because these are irreversible or externally visible:

- `fly secrets set` (changes production behaviour)
- `fly deploy`, `git push --force`
- anything touching the Neon production database
- rotating credentials
- DNS changes

The first two are already gated by deploy.yml waiting for CI, but the secrets
command is not gated by anything. Consider a wrapper or at least a documented rule.

### 4. Pin the toolchain so a remote sandbox matches

`net10.0`, Node 24, Dapper, Stripe 2.7.5. A remote environment that resolves
different versions produces failures that look like code bugs. A `global.json` for
the .NET SDK and an `.nvmrc` (or `engines` field) for Node make the mismatch
impossible rather than mysterious.

### 5. Keep the nightly UI loop as the remote safety net

It is already right: advisory, scheduled, and it exercises the full stack. For
phone-driven work it is the only check that catches "the page renders but is
wrong". Do not promote it to gating — its own comments note the judge varies by
±2 points, and a flaky gate on unattended work is how people learn to bypass gates.

## What I would not do

- **Do not add more gates.** The suite already fails closed and runs in a minute.
  More gates on unattended work produce `--no-verify` habits.
- **Do not give a remote session the Fly token.** Every production secret in this
  repo lives behind that one credential.
- **Do not let a remote session run migrations.** `DatabaseInitializationService`
  runs on startup, so a *deploy* can migrate production. That is intended, but it
  means a remote deploy is a database change, not just a code change.

## Suggested order

1. Make the hook install unskippable (item 1) — protects everything else.
2. Decide the branch policy (item 2) — removes the worst failure mode.
3. Write the "needs a human" list where it will be read (item 3).
4. Pin the toolchain (item 4) — only matters once remote sessions are frequent.
5. Leave the rest alone.

## Verified: the credentials are reachable

Not a hypothetical. The agent allow-list in `reasonix.toml` includes:

```
${HOME}/.fly                          -> Fly deploy token and app credentials
${HOME}/Library/Application Support/com.vercel.cli
```

Both are directories this environment can read. `fly secrets set` and `fly deploy`
therefore work **with no further authentication** — there is no second prompt
between a remote instruction and a production change. `~/.fly` is mode `700`, which
protects it from other users on the machine but not from a process running as you.

So the "needs a human" list above is not ceremony. A remote session has standing
access to production, and the only thing distinguishing a safe instruction from a
dangerous one is the instruction itself.

**Concrete mitigation, if remote sessions become routine:** give the remote
environment a Fly token scoped to read-only, or a separate app for staging, and
keep the deploy token on the machine only. Until then, treat "deploy" and "secrets"
as human-only actions and act accordingly.

## Open question — ANSWERED 2026-09-16

**Does Paseo run in a sandbox with its own clone, or against this working
directory?** A sandbox with its own clone would not inherit `~/.fly`. Worth
confirming, because it decides whether the mitigation above is needed or already
in effect.

**Answer: against this working directory.** `~/.paseo/projects/workspaces.json`
records the repo as:

```json
{ "kind": "local_checkout",
  "cwd": "/Users/kieuminhduc/Documents/job/Asian_taste_Vietnamese_cuisine",
  "isPaseoOwnedWorktree": false,
  "mainRepoRoot": null }
```

`isPaseoOwnedWorktree: false` is the decisive field — there is no separate clone,
so the agent inherits `~/.fly` and the Vercel CLI config, and `fly deploy` /
`fly secrets set` work from a phone with **no second prompt**. The mitigation in
"Verified: the credentials are reachable" is therefore **needed, not already in
effect.**

## Setup as performed (2026-09-16)

Paseo 0.8.0 was already installed (`/opt/homebrew/bin/paseo` + `Paseo.app`) and
this repo was already registered; the daemon had simply been stopped. What was
done:

```bash
paseo daemon start        # had exited on SIGTERM; now running, 127.0.0.1:6767
paseo daemon pair --relay # enabled the relay and printed the pairing link
```

**The relay is free — item "What I would check before relying on it" #1 is
settled.** The endpoint is first-party (`relay.paseo.sh:443`, TLS, E2E encrypted)
and the entire enable path is one consent prompt. No account, no plan, no card
field. The pairing link carries only `serverId`, the relay endpoint and the
daemon's public key:

```json
{"v":2,"serverId":"srv_Fk_1NkCNtq83","daemonPublicKeyB64":"...",
 "relay":{"endpoint":"relay.paseo.sh:443","useTls":true}}
```

Treat the link like a password — it is the trust anchor for the E2E handshake and
anyone holding it can reach the daemon.

### Branch policy — the chosen option, and the gap

**Chosen: remote sessions work on branches, a human merges.** Recorded here
because item 2 says "do not leave it implicit".

**There is no config setting that enforces this.** Paseo has no global default for
workspace isolation, and `paseo run` without `--new-workspace` runs in *this*
working directory on *whatever branch is checked out* — today
`feat/v1-pickup-and-addons`, not `main`. So branch-safety is a property of how a
session is started, held by discipline rather than by the tool.

Start a phone session on a throwaway branch with:

```bash
paseo run --new-workspace worktree --worktree-mode branch-off \
          --new-branch phone/<slug> --base main "<prompt>"
```

A `local` new-workspace does **not** give this isolation — `worktree` is what
prevents two sessions sharing one checkout. Verify with `git worktree list` and
`paseo workspace ls` before trusting it.

Two things this does not fix, worth knowing rather than discovering:

1. The session still inherits `~/.fly`, so it can deploy and rotate production
   secrets — on a branch, but unstoppably. The "needs a human" list is the only
   control that covers this.
2. The desktop app's UI may default to the existing `local_checkout` workspace,
   which is the un-isolated path. The flag above is the CLI path; if a session is
   started from the phone UI, confirm which workspace it landed in before treating
   it as branch-isolated.

### Still not done from the suggested order

- **Item 1 (unskippable hook install):** unchanged. `core.hooksPath` is `.githooks`
  and the pre-commit hook is executable in this clone, but it is still per-clone
  and absent from a fresh one.
- **Item 4 (pin the toolchain):** no `global.json` and no `.nvmrc` exist yet.
  Deferred — it only matters once remote sessions are frequent.
- **Provider coverage:** only Claude (`2.1.12`) is installed; Codex is not found,
  so Paseo can drive one provider here today.

