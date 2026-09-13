#!/usr/bin/env bash
#
# check-ci-integrity.sh — fail CI when the guardrails themselves are weakened,
# or when a change is so large it cannot be reviewed.
#
# Why this exists:
#   Guardrails only work if they cannot be quietly disabled. The cheapest way to
#   make a red build green is not to fix the code — it is to delete the check:
#
#     - add `continue-on-error: true` to a blocking step
#     - delete a step, or an entire job, from .github/workflows/
#     - change `on: push` to a branch that never matches
#     - remove a guardrail script, or drop its executable bit
#
#   The second failure mode is size. A change that touches hundreds of files, or
#   rewrites a critical file wholesale, hides its own bugs regardless of what the
#   tests say. Large diffs get flagged loudly, not silently merged.
#
# Modes:
#   (default)       everything, including the commit-diff size tripwire. This is
#                   what CI runs.
#   --static-only   validate the working tree only (guardrail steps present, not
#                   disarmed, scripts runnable, no guardrail script deleted) and
#                   skip the size tripwire. That tripwire compares a commit
#                   against its base, so mid-edit it would fail on somebody
#                   else's commit. This is what .githooks/pre-commit runs.
#
# Exit 0 = guardrails intact and the diff is reviewable. Exit 1 = a guardrail was
# weakened, or the change is too large/lopsided to trust.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

STATIC_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --static-only) STATIC_ONLY=1 ;;
    -h|--help)
      printf 'usage: %s [--static-only]\n' "${0##*/}"
      printf '  --static-only  pre-commit mode: working-tree checks only, no diff size tripwire\n'
      exit 0
      ;;
    *)
      printf 'unknown argument: %s (try --help)\n' "$arg" >&2
      exit 2
      ;;
  esac
done

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""; }

failures=()
warnings=()
notes=()
fail()    { failures+=("$1"); }
warn()    { warnings+=("$1"); }
note()    { notes+=("$1"); }
hdr()     { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }

WORKFLOW=".github/workflows/ci.yml"

# Thresholds. Deliberately generous: this is a tripwire for "this cannot be
# reviewed", not a style rule.
MAX_FILES_CHANGED="${MAX_FILES_CHANGED:-60}"
MAX_LINES_CHANGED="${MAX_LINES_CHANGED:-2500}"
MAX_SINGLE_FILE_LINES="${MAX_SINGLE_FILE_LINES:-600}"

# ---------------------------------------------------------------------------
# 0. Preconditions.
# ---------------------------------------------------------------------------
hdr "Preconditions"
declare -a REQUIRED=(
  "$WORKFLOW"
  "scripts/check-test-wiring.sh"
  "scripts/check-test-health.sh"
  "scripts/check-ci-integrity.sh"
  "scripts/ui-shots.mjs"
  "scripts/ui-judge.mjs"
  "docs/ui-rubric.md"
  "docs/GUARDRAILS.md"
  "README.md"
)
for p in "${REQUIRED[@]}"; do
  if [ -e "$p" ]; then
    printf '  ok       %s\n' "$p"
  else
    fail "required guardrail artefact is missing: $p — the guardrail set has been weakened"
  fi
done

# ---------------------------------------------------------------------------
# 1. The guardrail scripts must be executable and syntactically valid.
# ---------------------------------------------------------------------------
hdr "Guardrail scripts are runnable"
for s in scripts/check-test-wiring.sh scripts/check-test-health.sh; do
  [ -f "$s" ] || continue

  if [ -x "$s" ]; then
    printf '  ok       %s is executable\n' "$s"
  else
    fail "$s lost its executable bit — CI would fail to invoke it"
  fi

  if bash -n "$s" 2>/dev/null; then
    printf '  ok       %s parses\n' "$s"
  else
    fail "$s has a bash syntax error — it cannot guard anything"
  fi
done

# ---------------------------------------------------------------------------
# 2. CI must not weaken itself: no continue-on-error on guardrail steps, and
#    the guardrail steps must still be present.
# ---------------------------------------------------------------------------
hdr "CI has not disarmed its own guardrails"
if [ -f "$WORKFLOW" ]; then
  declare -a REQUIRED_STEPS=(
    "check-test-wiring.sh:test wiring"
    "check-test-health.sh:test health (tests actually run)"
    "check-ci-integrity.sh:CI integrity"
  )
  for entry in "${REQUIRED_STEPS[@]}"; do
    script="${entry%%:*}"
    label="${entry##*:}"
    if grep -q "$script" "$WORKFLOW"; then
      printf '  ok       CI still runs the %s guardrail\n' "$label"
    else
      fail "CI no longer runs scripts/$script — the $label guardrail was removed"
    fi
  done

  # A guardrail step wrapped in continue-on-error is a guardrail in name only.
  # Look for continue-on-error lines near a guardrail invocation.
  if awk '
      /check-test-wiring\.sh|check-test-health\.sh|check-ci-integrity\.sh/ { near=NR }
      /continue-on-error/ && near && NR - near <= 4 { found=1 }
      END { exit !found }
    ' "$WORKFLOW"; then
    fail "a guardrail step has 'continue-on-error: true' — it can no longer fail the build"
  else
    printf '  ok       no guardrail step is wrapped in continue-on-error\n'
  fi

  # The workflow must still trigger on push and pull_request.
  for trigger in "push:" "pull_request:"; do
    if grep -q "$trigger" "$WORKFLOW"; then
      printf '  ok       workflow still triggers on %s\n' "${trigger%:}"
    else
      fail "workflow no longer triggers on ${trigger%:} — CI would not run"
    fi
  done
else
  fail "$WORKFLOW is missing — CI cannot run at all"
fi

# ---------------------------------------------------------------------------
# 3. Diff size: a change too large to review fails loudly.
#    Skipped in --static-only mode (pre-commit): it measures a committed diff
#    against its base, which is not a claim a pre-commit hook can make.
# ---------------------------------------------------------------------------
if [ "$STATIC_ONLY" -eq 1 ]; then
  hdr "Change size (skipped: --static-only)"
  note "--static-only: the commit-diff size tripwire did not run. CI runs it on the branch."
else
hdr "Change size (must stay reviewable)"

# Determine the diff base. On GitHub PRs, GITHUB_BASE_REF identifies the target.
base=""
if [ -n "${GITHUB_BASE_REF:-}" ] && git rev-parse --verify -q "origin/${GITHUB_BASE_REF}" >/dev/null 2>&1; then
  base="origin/${GITHUB_BASE_REF}"
elif git rev-parse --verify -q HEAD~1 >/dev/null 2>&1; then
  base="HEAD~1"
fi

if [ -z "$base" ]; then
  note "no diff base available (single-commit history) — size checks skipped"
else
  numstat="$(git diff --numstat "$base"...HEAD 2>/dev/null || git diff --numstat "$base" HEAD 2>/dev/null || true)"

  if [ -z "$numstat" ]; then
    note "no committed changes between $base and HEAD — nothing to size-check"
  else
    files_changed=$(printf '%s\n' "$numstat" | grep -c . || echo 0)
    lines_changed=$(printf '%s\n' "$numstat" | awk '{ if ($1 != "-") s += $1; if ($2 != "-") s += $2 } END { print s+0 }')

    printf '  base=%s  files=%s  lines=%s (thresholds: %s files / %s lines)\n' \
      "$base" "$files_changed" "$lines_changed" "$MAX_FILES_CHANGED" "$MAX_LINES_CHANGED"

    if [ "$files_changed" -gt "$MAX_FILES_CHANGED" ]; then
      fail "change touches $files_changed files (> $MAX_FILES_CHANGED) — too large to review reliably. Split the PR."
    fi
    if [ "$lines_changed" -gt "$MAX_LINES_CHANGED" ]; then
      fail "change touches $lines_changed lines (> $MAX_LINES_CHANGED) — too large to review reliably. Split the PR."
    fi

    # A single file rewritten wholesale is the classic place a bug hides.
    worst_file=""; worst_lines=0
    while IFS=$'\t' read -r added removed path; do
      [ -n "${path:-}" ] || continue
      a=0; r=0
      [ "$added" != "-" ] && a="$added"
      [ "$removed" != "-" ] && r="$removed"
      tot=$((a + r))
      if [ "$tot" -gt "$worst_lines" ]; then
        worst_lines="$tot"; worst_file="$path"
      fi
    done <<< "$numstat"

    if [ "$worst_lines" -gt "$MAX_SINGLE_FILE_LINES" ]; then
      fail "single file changed $worst_lines lines (> $MAX_SINGLE_FILE_LINES): $worst_file — review this file line by line"
    elif [ -n "$worst_file" ]; then
      printf '  ok       largest single file: %s (%s lines)\n' "$worst_file" "$worst_lines"
    fi
  fi
fi
fi   # end: change size (section 3)

# ---------------------------------------------------------------------------
# 4. Guardrail scripts must not be deleted by the change under test.
#
#    In --static-only mode there is no committed change to inspect yet, so this
#    asks the working tree instead: the guardrail files must exist on disk and
#    must not be staged for deletion. Deleting a guardrail is the single most
#    dangerous commit this repo can make, so the pre-commit tier still refuses
#    it rather than deferring the entire check to CI.
# ---------------------------------------------------------------------------
hdr "Guardrail scripts survive the change"
if [ "$STATIC_ONLY" -eq 1 ]; then
  declare -a GUARDED=(scripts/check-test-wiring.sh scripts/check-test-health.sh scripts/check-ci-integrity.sh)
  missing=0
  for g in "${GUARDED[@]}"; do
    if [ ! -e "$g" ]; then
      fail "guardrail script is gone from the working tree: $g"
      missing=1
    fi
  done

  # `git diff --cached --name-status HEAD` is the index vs the last commit: a
  # staged `D` means this very commit removes the file.
  while IFS= read -r line; do
    case "$line" in
      D*scripts/check-*.sh)
        fail "this commit is staged to delete a guardrail script: ${line#D}"
        ;;
    esac
  done <<< "$(git diff --cached --name-status HEAD 2>/dev/null || true)"

  [ "$missing" -eq 1 ] || printf '  ok       all guardrail scripts present and none staged for deletion\n'
elif [ -n "$base" ]; then
  while IFS= read -r line; do
    case "$line" in
      D*scripts/check-*.sh)
        fail "the change deletes a guardrail script: ${line#D}"
        ;;
    esac
  done <<< "$(git diff --name-status "$base"...HEAD 2>/dev/null || git diff --name-status "$base" HEAD 2>/dev/null || true)"
  printf '  ok       no guardrail script deleted by this change\n'
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
for n in "${notes[@]:-}"; do
  [ -n "$n" ] && printf '\n%s  note%s     %s\n' "$YELLOW" "$RESET" "$n"
done
for w in "${warnings[@]:-}"; do
  [ -n "$w" ] && printf '\n%s  warn%s     %s\n' "$YELLOW" "$RESET" "$w"
done

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\n%s%sFAIL: %d CI-integrity problem(s)%s\n' "$BOLD" "$RED" "${#failures[@]}" "$RESET"
  for x in "${failures[@]}"; do printf '  - %s\n' "$x"; done
  printf '\nGuardrails that can be quietly disabled are not guardrails.\n'
  printf 'If weakening one is genuinely intended, that change must be explicit and reviewed on its own.\n'
  exit 1
fi

printf '\n%s%sPASS: guardrails intact and the change is reviewable.%s\n' "$BOLD" "$GREEN" "$RESET"
exit 0
