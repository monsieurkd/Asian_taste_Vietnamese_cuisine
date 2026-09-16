# CI & Test Report — guardrail for unreachable tests

> ⚠️ **HISTORICAL — generated output, not a living document.** A record of one CI
> run, written by the `ci-test-guardian` / `test-author` skills (which now append
> here rather than to the repo root). **For current state, read
> [`../TODO.md`](../TODO.md).** See [`README.md`](README.md).

**Scope:** point `ci-test-guardian` at `src/asian-taste-customer/tests/e2e/checkout.spec.ts`,
add a guardrail so the defect class cannot return, and verify the fix.

**Status:** ✅ Complete — guardrail proven RED on the violation, GREEN after the fix, full CI reproduced green.

---

## 1. The defect (reproduced, not asserted)

`src/asian-taste-customer/tests/e2e/checkout.spec.ts` was a **tracked** Playwright suite
that could never run. Reproduced directly:

```
$ npx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 tests/e2e/checkout.spec.ts
tests/e2e/checkout.spec.ts(1,30): error TS2307: Cannot find module '@playwright/test'
```

Two independent root causes:

| # | Cause | Evidence |
|---|---|---|
| 1 | No test runner configured | `package.json` has only `dev`/`build`/`lint`/`preview` — no `test` script |
| 2 | Runner not installed | `@playwright/test` absent from `package.json`, `package-lock.json`, and `node_modules` |

It was also **invisible to every existing CI check**: `tsconfig.app.json` has `include: ["src"]`,
so the file sat outside `tsc`'s graph, and eslint's `files: ['**/*.{ts,tsx}']` with
`globalIgnores(['dist'])` also skipped it. All 6 selectors it used (`data-testid="menu-item-1"`,
`"cart-icon"`, `"payment-method-card"`, `"payment-method-cash"`, `.order-summary`,
`.confirmation-page`) resolved to **0 files** in the app — no `data-testid` exists anywhere
in either frontend.

**Impact:** fake coverage. It read as "checkout flow is e2e tested" while testing nothing.

**Resolution (user-selected):** deleted via `git rm`. Git history retains it (`cb88416` ancestors).

---

## 2. The guardrail

New: `scripts/check-test-wiring.sh` (178 lines, `100755`). Project-specific by request —
it hardcodes this repo's real layout rather than guessing.

Three checks:

1. **Preconditions** — asserts the paths it claims to inspect actually exist
   (`AsianTaste.sln`, both `.csproj`, both `package.json`). This is the anti-vacuity
   guard: if the layout moves, it **fails loudly** instead of printing a false "all clear".
2. **Reachability** — discovers every tracked test file via
   `git ls-files` (so untracked scratch can't trip it), then per file:
   - `*.cs` → must live under `tests/AsianTaste.API.Tests/` (a solution-wired project)
   - JS/TS → owning app must declare a `test` script, **and** every non-relative import
     must be a declared dependency (this is the check that catches an uninstalled runner)
3. **API suite wiring** — `AsianTaste.API.Tests.csproj` is referenced by `AsianTaste.sln`
   (otherwise `dotnet test` silently skips it), and the suite is non-empty.

Wired into `.github/workflows/ci.yml` as a blocking step in the `api` job, after `Test`.
Fails the build with per-file reasons and an explicit remediation message.

---

## 3. Verification — RED → GREEN

### 3a. RED on the real violation (before the fix)

```
$ ./scripts/check-test-wiring.sh
==> Reachability
  FAIL     src/asian-taste-customer/tests/e2e/checkout.spec.ts
...
FAIL: 2 test-wiring problem(s)
  - unreachable test: ... — 'src/asian-taste-customer/package.json' has no "test" script, so nothing runs this file
  - unreachable test: ... imports '@playwright/test' but 'src/asian-taste-customer/package.json' does not declare it
EXIT CODE: 1
```

✅ Caught both root causes, on the genuine artifact — not a synthetic fixture.

### 3b. GREEN after the fix

```
$ ./scripts/check-test-wiring.sh
found 8 tracked test file(s)
  ok       tests/AsianTaste.API.Tests/Controllers/AdminSettingsControllerTests.cs (xUnit, wired to solution)
  ok       tests/AsianTaste.API.Tests/Services/EncryptionServiceTests.cs (xUnit, wired to solution)
  ok       tests/AsianTaste.API.Tests/Services/Payment/StripeConfigurationTests.cs (xUnit, wired to solution)
PASS: all 8 tracked test file(s) are reachable.
EXIT CODE: 0
```

### 3c. Negative control (proves the guardrail is not vacuous)

Re-introduced the exact defect as `regression-probe.spec.ts`, force-added to git:

```
FAIL: 2 test-wiring problem(s)
  - unreachable test: src/asian-taste-customer/tests/e2e/regression-probe.spec.ts — no "test" script
  - unreachable test: src/asian-taste-customer/tests/e2e/regression-probe.spec.ts imports '@playwright/test' but not declared
EXIT CODE: 1
```

Probe removed, dirs cleaned, re-ran → `EXIT: 0`.

### 3d. Full CI sequence reproduced after all changes

| Job | Command | Result |
|---|---|---|
| api — build | `dotnet build AsianTaste.sln --no-restore -c Release` | **PASS** — 0 errors |
| api — test | `dotnet test AsianTaste.sln --no-build -c Release` | **PASS** — `Test Run Successful. Passed: 29` |
| api — guardrail | `./scripts/check-test-wiring.sh` | **PASS** — exit 0 |
| frontend customer | `npm run build` | **PASS** — built in 3.51s |
| frontend admin | `npm run build` | **PASS** — built in 3.65s |
| frontend customer lint | `npm run lint` | **11 problems (5 errors, 6 warnings)** — unchanged, 0 new |
| syntax | `bash -n scripts/check-test-wiring.sh` | **PASS** |
| exec bit | `git ls-files -s` | **PASS** — `100755` |

Lint is red by design (`continue-on-error: true`; plan item A8). **Before/after counts are
identical at 11 — zero new problems introduced.**

---

## 4. Defects found

### DEFECT-1 — unreachable tracked test file (FIXED)
`src/asian-taste-customer/tests/e2e/checkout.spec.ts`. Playwright spec with no runner,
uninstalled dependency, and 0/6 selectors present. Deleted. Guarded against recurrence.

### DEFECT-2 — `.gitignore` check was a red herring (no action)
I initially reported `.gitignore` line 24 as `reasonix.toml=reasonix.toml`. `git check-ignore -v`
confirms the comment line displays; the actual pattern is `reasonix.toml`. Not a defect —
**retracted**.

### DEFECT-3 — pre-existing lint debt (NOT FIXED, out of scope)
Customer 5 errors / 6 warnings; admin 6 errors. Tracked as plan item A8, deliberately
non-blocking. Not touched — fixing it would require changing production components.

---

## 5. Correction to my earlier audit

My previous report said **14 tests**. That was accurate at `67604c0` but **stale**: HEAD is now
`cb88416 "Phase B: localise the app for Adelaide, SA"`, which added
`tests/AsianTaste.API.Tests/Controllers/AdminSettingsControllerTests.cs` (187 lines, 8 facts/theories).

**Current baseline is 29 passing tests across 3 files** — verified by the run above. The
guardrail is what surfaced this, which is exactly its job. My earlier "~1.5% coverage" framing
should be read against 29 tests, not 14.

---

## 6. Not verified / risks

- **The guardrail's `test`-script check is only as good as its current scope.** It verifies a
  runner is *declared*; it cannot verify the runner actually passes once installed. A future
  `"test": "echo skip"` would satisfy it. Extending to a real frontend runner (Vitest + RTL,
  or Vitest browser mode instead of Playwright) is the durable fix.
- **`tests/test-payment-mock.sh` is still unguarded.** It's a curl-based integration script
  requiring a live API on `localhost:5070`; nothing runs it in CI. It is reported as a `note`,
  not a failure. Whether it should be wired up or deleted is an open question.
- **CI has not run on GitHub.** All verification is local reproduction of the workflow steps.
  The new step's behavior under `ubuntu-latest` (bash 5 vs macOS bash 3.2) is unverified —
  the script avoids bash-4+ features (`mapfile`, associative arrays, `${var,,}`) for this
  reason, but that has not been executed on Linux.
- **`dotnet test` was run with `--no-build`** in the verification above, matching the CI step.
  The 1-warning build output seen above is the NuGet-audit warning local to this machine
  (`NU1900`, a cache-permission issue), not a repo defect; CI does not have it.
- **`OrderRepository` (1009 lines), `StripeWebhookService`, `JwtService`, payment gateways
  remain untested.** Unchanged by this work.

---

## 7. Files changed

| File | Change |
|---|---|
| `scripts/check-test-wiring.sh` | **added** — 178 lines, mode 100755 |
| `.github/workflows/ci.yml` | **modified** — +6 lines, blocking "Verify test wiring" step |
| `src/asian-taste-customer/tests/e2e/checkout.spec.ts` | **deleted** — 112 lines |
