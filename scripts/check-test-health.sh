#!/usr/bin/env bash
#
# check-test-health.sh — fail CI when the test suite passes but proves nothing.
#
# Why this exists (distinct from check-test-wiring.sh):
#   check-test-wiring.sh answers "can every tracked test file RUN at all?"
#   This script answers a harder question: "did the suite actually RUN, and did
#   it MEAN something?" A suite can be wired correctly and still be worthless:
#
#     - every test [Fact(Skip="...")]  -> "Passed! 0 failed" while testing nothing
#     - a filter that silently matches nothing -> 0 tests, exit code 0
#     - a test project dropped from the run -> the count quietly collapses
#     - an assertion that was commented out -> green, proving nothing
#
#   This guardrail turns those into loud failures.
#
# Anti-vacuity: it fails if it cannot find the test project, and it compares the
# discovered test count against a floor recorded in .test-baseline so that a
# shrinking suite is a build failure rather than a silent regression.
#
# Judging a run does not require performing one:
#   TEST_RESULTS_DIR=/path/to/trx  -> read results CI already produced and do
#                                     NOT re-run the suite (see section 2).
#   TEST_RESULTS_DIR unset         -> run the suite here. Local default.
#
# Exit 0 = the suite genuinely ran. Exit 1 = it did not, or it shrank.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""; }

failures=()
notes=()
fail() { failures+=("$1"); }
note() { notes+=("$1"); }
hdr()  { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }

BASELINE_FILE=".test-baseline"

# ---------------------------------------------------------------------------
# 0. Preconditions — refuse to report a false "all clear" if the layout moved.
# ---------------------------------------------------------------------------
hdr "Preconditions"
SLN="AsianTaste.sln"
TEST_PROJ="tests/AsianTaste.API.Tests/AsianTaste.API.Tests.csproj"

for p in "$SLN" "$TEST_PROJ"; do
  if [ -e "$p" ]; then
    printf '  ok       %s\n' "$p"
  else
    fail "expected path is missing: $p (layout changed — update scripts/check-test-health.sh)"
  fi
done

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\n%s%sFAIL: cannot run the test-health check — expected paths are missing.%s\n' "$BOLD" "$RED" "$RESET"
  for x in "${failures[@]}"; do printf '  - %s\n' "$x"; done
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Static scan: skipped / ignored tests are silent coverage loss.
# ---------------------------------------------------------------------------
hdr "Skipped and ignored tests"

declare -a SKIP_HITS=()
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  SKIP_HITS+=("$hit")
done < <(git ls-files 'tests/**/*.cs' | xargs grep -nE '\[(Fact|Theory)[[:space:]]*\([[:space:]]*Skip|Assert\.True\(true,?[[:space:]]*["'\'']|Assert\.True\([[:space:]]*true[[:space:]]*\)' 2>/dev/null || true)

if [ "${#SKIP_HITS[@]}" -eq 0 ]; then
  printf '  ok       no skipped tests and no assertion-free placeholders\n'
else
  for h in "${SKIP_HITS[@]}"; do
    fail "skipped or vacuous test: $h — a skipped test still reports the suite as green"
  done
fi

# Detect tests whose body is empty or assertion-free (a common "(no-op)" pattern).
declare -a EMPTY_HITS=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Count [Fact]/[Theory] occurrences vs Assert./Throws occurrences.
  facts=$(grep -cE '\[(Fact|Theory)' "$f" 2>/dev/null || echo 0)
  asserts=$(grep -cE 'Assert\.|Assert\.Throws|\.Should\(\)|Record\.Exception' "$f" 2>/dev/null || echo 0)
  if [ "$facts" -gt 0 ] && [ "$asserts" -eq 0 ]; then
    EMPTY_HITS+=("$f ($facts test(s), 0 assertions)")
  fi
done < <(git ls-files 'tests/**/*.cs' || true)

if [ "${#EMPTY_HITS[@]}" -eq 0 ]; then
  printf '  ok       every test file contains at least one assertion\n'
else
  for h in "${EMPTY_HITS[@]}"; do
    fail "assertion-free test file: $h — a test that asserts nothing cannot fail"
  done
fi

# ---------------------------------------------------------------------------
# 2. The suite must actually execute a non-trivial number of tests.
#
#    Two modes, because running the suite and judging it are separate jobs:
#
#      consumer — TEST_RESULTS_DIR is set. CI already ran the suite in its
#        "Test" step and wrote TRX there. Re-running `dotnet test` here would
#        pay for the entire build + suite a second time for a signal that
#        already exists on disk, so this script judges the artefact instead of
#        reproducing it.
#
#      local — TEST_RESULTS_DIR is unset, so there is no artefact to judge and
#        the script runs the suite itself. This is the documented local
#        workflow (`./scripts/check-test-health.sh`).
#
#    Consumer mode never degrades into "assume it passed": a missing or
#    unreadable TRX is a hard failure. A guardrail that shrugs is the exact
#    false-green this script exists to prevent.
# ---------------------------------------------------------------------------
hdr "Execution (the tests must really run)"

RUN_LOG=""
run_status=0
passed=""; failed=""; skipped=""; total=""

if [ -n "${TEST_RESULTS_DIR:-}" ]; then
  printf '  mode     consumer — reading TRX from %s (the suite is NOT re-run)\n' "$TEST_RESULTS_DIR"

  declare -a TRX_FILES=()
  if [ -d "$TEST_RESULTS_DIR" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      TRX_FILES+=("$f")
    done < <(find "$TEST_RESULTS_DIR" -type f -name '*.trx' 2>/dev/null | sort)
  fi

  if [ "${#TRX_FILES[@]}" -eq 0 ]; then
    fail "no *.trx under '$TEST_RESULTS_DIR' — the suite produced no results, so nothing here is trustworthy"
  else
    printf '  trx      %s file(s): %s\n' "${#TRX_FILES[@]}" "${TRX_FILES[*]}"

    # Each TRX carries a `<Counters>` element for one test run. Sum across files
    # so a solution with more than one test project still yields a true total.
    #
    # `skipped` is not a standard TRX attribute on current SDKs: a test that did
    # not execute (e.g. [Fact(Skip = "...")]) lands in `notExecuted`. When that
    # counter is absent, total - executed is the same quantity, and it is what
    # the "Skipped:" column of the console summary reports in local mode.
    read -r passed failed skipped total < <(awk '
      function attr(s, name,   m) {
        if (match(s, name "=\"[0-9]+\"")) {
          m = substr(s, RSTART, RLENGTH)
          sub(/^[^"]*"/, "", m); sub(/"$/, "", m)
          return m
        }
        return 0
      }
      {
        line = $0
        while (match(line, /<Counters[^>]*>/)) {
          c = substr(line, RSTART, RLENGTH)
          total    += attr(c, "total")       + 0
          executed += attr(c, "executed")    + 0
          passed   += attr(c, "passed")      + 0
          failed   += attr(c, "failed")      + 0
          notrun   += attr(c, "notExecuted") + 0
          line = substr(line, RSTART + RLENGTH)
        }
      }
      END {
        if (total == 0 && executed > 0) total = executed + failed + notrun
        n = notrun
        if (n == 0 && total > executed) n = total - executed
        printf "%d %d %d %d\n", passed + 0, failed + 0, n + 0, total + 0
      }
    ' "${TRX_FILES[@]}" 2>/dev/null) || true

    if [ -z "${total:-}" ]; then
      fail "could not parse any <Counters> from the TRX — the result files are not readable, so the run cannot be trusted"
    else
      printf '  passed=%s failed=%s skipped=%s total=%s\n' "$passed" "$failed" "$skipped" "$total"

      [ "$failed" -eq 0 ]  || fail "$failed test(s) FAILED — the suite is not green"
      [ "$skipped" -eq 0 ] || fail "$skipped test(s) SKIPPED — skipped tests hide broken behaviour"
      [ "$total" -gt 0 ]   || fail "0 tests ran — a suite that runs nothing reports success"
    fi
  fi
else
  printf '  mode     local — TEST_RESULTS_DIR is unset, so running the suite here\n'

  RUN_LOG="$(mktemp)"
  trap 'rm -f "$RUN_LOG"' EXIT

  if command -v dotnet >/dev/null 2>&1; then
    dotnet test "$TEST_PROJ" --nologo --verbosity minimal > "$RUN_LOG" 2>&1
    run_status=$?
  else
    fail "dotnet SDK not found on PATH — cannot verify the suite runs"
    run_status=127
  fi

  # Parse the summary line: "Passed!  - Failed:     0, Passed:    45, Skipped:     0, Total:    45"
  summary="$(grep -Eo '(Passed|Failed)![[:space:]]*-[[:space:]]*Failed:[[:space:]]*[0-9]+,[[:space:]]*Passed:[[:space:]]*[0-9]+,[[:space:]]*Skipped:[[:space:]]*[0-9]+,[[:space:]]*Total:[[:space:]]*[0-9]+' "$RUN_LOG" | tail -1)"

  if [ -z "$summary" ]; then
    fail "could not parse a test summary — the suite did not report results (did it build?)"
    printf '  %sraw tail:%s\n' "$YELLOW" "$RESET"
    tail -15 "$RUN_LOG" | sed 's/^/    /'
  else
    failed=$(printf '%s' "$summary"  | sed -E 's/.*Failed:[[:space:]]*([0-9]+).*/\1/')
    passed=$(printf '%s' "$summary"  | sed -E 's/.*Passed:[[:space:]]*([0-9]+).*/\1/')
    skipped=$(printf '%s' "$summary" | sed -E 's/.*Skipped:[[:space:]]*([0-9]+).*/\1/')
    total=$(printf '%s' "$summary"   | sed -E 's/.*Total:[[:space:]]*([0-9]+).*/\1/')

    printf '  passed=%s failed=%s skipped=%s total=%s\n' "$passed" "$failed" "$skipped" "$total"

    [ "$failed" -eq 0 ]  || fail "$failed test(s) FAILED — the suite is not green"
    [ "$skipped" -eq 0 ] || fail "$skipped test(s) SKIPPED — skipped tests hide broken behaviour"
    [ "$total" -gt 0 ]   || fail "0 tests ran — a suite that runs nothing reports success"
  fi
fi

# ---------------------------------------------------------------------------
# 3. The suite must not shrink. A shrinking count means coverage was lost
#    (deleted tests, a project dropped from the run, a bad filter).
#
#    Skipped when mode 2 could not produce a count: an unparseable run is
#    already a failure above, and comparing against a floor would be invented
#    evidence on top of it.
# ---------------------------------------------------------------------------
if [ -n "${total:-}" ]; then
  hdr "Suite size (must not shrink)"
  if [ -f "$BASELINE_FILE" ]; then
    baseline="$(grep -Eo '[0-9]+' "$BASELINE_FILE" | head -1)"
    if [ -n "$baseline" ]; then
      printf '  baseline=%s  current=%s\n' "$baseline" "$total"
      if [ "$total" -lt "$baseline" ]; then
        fail "test count regressed: $total < baseline $baseline — tests were removed, skipped, or filtered out"
      elif [ "$total" -gt "$baseline" ]; then
        note "test count grew: $baseline -> $total. Update $BASELINE_FILE to lock in the new floor."
      else
        printf '  ok       test count unchanged (%s)\n' "$total"
      fi
    else
      fail "$BASELINE_FILE exists but contains no number"
    fi
  else
    note "$BASELINE_FILE not found — cannot detect a shrinking suite. Create it with the current count."
  fi
fi

[ "$run_status" -eq 0 ] || fail "dotnet test exited $run_status"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
for n in "${notes[@]:-}"; do
  [ -n "$n" ] && printf '\n%s  note%s     %s\n' "$YELLOW" "$RESET" "$n"
done

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\n%s%sFAIL: %d test-health problem(s)%s\n' "$BOLD" "$RED" "${#failures[@]}" "$RESET"
  for x in "${failures[@]}"; do printf '  - %s\n' "$x"; done
  printf '\nA green suite that skipped, shrank, or asserted nothing is a false signal.\n'
  printf 'Fix the tests, or update .test-baseline if the reduction is deliberate and reviewed.\n'
  exit 1
fi

printf '\n%s%sPASS: the test suite genuinely ran and did not shrink.%s\n' "$BOLD" "$GREEN" "$RESET"
exit 0
