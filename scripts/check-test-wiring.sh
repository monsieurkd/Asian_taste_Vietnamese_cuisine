#!/usr/bin/env bash
#
# check-test-wiring.sh — fail CI when a tracked test file cannot actually run.
#
# Why this exists: this repo shipped `src/asian-taste-customer/tests/e2e/checkout.spec.ts`,
# a tracked Playwright suite whose runner was never installed (no `test` script, no
# `@playwright/test` dependency, no playwright.config) and whose selectors did not exist
# in the app. It looked like checkout coverage and provided none.
#
# This guardrail makes that class of artefact impossible to merge again.
#
# Scope (deliberately project-specific — see docs/archive/MAJOR_UPDATE_PLAN_superseded.md):
#   1. Every test file in the repo must have a runnable home.
#   2. The API xUnit suite must stay wired to the solution.
#   3. Every path this script expects must exist, so it cannot silently no-op.
#
# Exit 0 = all reachable. Exit 1 = at least one unreachable test artefact.

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

# ---------------------------------------------------------------------------
# 0. Preconditions: the paths we promise to check must exist. If the layout
#    moved, fail loudly instead of reporting a false "all clear".
# ---------------------------------------------------------------------------
hdr "Preconditions"
declare -a REQUIRED_PATHS=(
  "AsianTaste.sln"
  "src/AsianTaste.API/AsianTaste.API.csproj"
  "tests/AsianTaste.API.Tests/AsianTaste.API.Tests.csproj"
  "src/asian-taste-customer/package.json"
  "src/asian-taste-admin/package.json"
)
for p in "${REQUIRED_PATHS[@]}"; do
  if [ -e "$p" ]; then
    printf '  ok       %s\n' "$p"
  else
    fail "expected path is missing: $p (layout changed — update scripts/check-test-wiring.sh)"
  fi
done

# ---------------------------------------------------------------------------
# 1. Discover every test file tracked by git, excluding vendored/build output.
# ---------------------------------------------------------------------------
hdr "Discovering test files"
declare -a TEST_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    */node_modules/*|*/bin/*|*/obj/*|*/dist/*|*/.git/*) continue ;;
  esac
  TEST_FILES+=("$f")
done < <(git ls-files | grep -E '(^|/)(tests?|__tests__|e2e|spec|specs)/|\.(spec|test)\.[cm]?[jt]sx?$|Tests?\.cs$' || true)

if [ "${#TEST_FILES[@]}" -eq 0 ]; then
  note "no test files discovered"
else
  printf '  found %d tracked test file(s)\n' "${#TEST_FILES[@]}"
fi

# Helpers to read package.json without jq/node assumptions.
has_npm_script() { # $1=app dir  $2=script name
  [ -f "$1/package.json" ] || return 1
  grep -Eq "\"$2\"[[:space:]]*:" "$1/package.json"
}
declares_dep() { # $1=app dir  $2=package name
  [ -f "$1/package.json" ] || return 1
  grep -q "\"$2\"" "$1/package.json"
}

# ---------------------------------------------------------------------------
# 2. Every discovered test file must be reachable.
# ---------------------------------------------------------------------------
hdr "Reachability"
declare -a JS_APPS=("src/asian-taste-customer" "src/asian-taste-admin")

for f in "${TEST_FILES[@]}"; do
  case "$f" in
    *.cs)
      case "$f" in
        */AsianTaste.API.Tests/*)
          printf '  ok       %s (xUnit, wired to solution)\n' "$f"
          ;;
        *)
          fail "C# test file outside a wired test project: $f — add it to a .csproj referenced by AsianTaste.sln"
          ;;
      esac
      ;;
    *.ts|*.tsx|*.js|*.jsx|*.mts|*.cts|*.mjs|*.cjs)
      # Which frontend app owns this file?
      owner=""
      for app in "${JS_APPS[@]}"; do
        case "$f" in "$app"/*) owner="$app" ;; esac
      done
      if [ -z "$owner" ]; then
        fail "JS/TS test file is outside any known app: $f"
        continue
      fi

      # (a) Does the app declare a test runner at all?
      if ! has_npm_script "$owner" "test"; then
        fail "unreachable test: $f — '$owner/package.json' has no \"test\" script, so nothing runs this file"
      fi

      # (b) Every package it imports must be a declared dependency.
      #     This is the check that catches a spec importing an uninstalled runner.
      while IFS= read -r spec; do
        [ -n "$spec" ] || continue
        # '@playwright/test' -> check the package name as written
        base="$spec"
        if ! declares_dep "$owner" "$base"; then
          fail "unreachable test: $f imports '$base' but '$owner/package.json' does not declare it"
        fi
      done < <(grep -oE "from[[:space:]]+['\"][^'\"]+['\"]" "$f" \
                 | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/" \
                 | grep -vE '^\.' || true)

      # (c) A runner is only real if it is configured or scripted.
      if has_npm_script "$owner" "test"; then
        printf '  ok       %s (runner script present in %s)\n' "$f" "$owner"
      else
        printf '  %sFAIL%s     %s\n' "$RED" "$RESET" "$f"
      fi
      ;;
    *)
      note "unclassified test-like file, not checked: $f"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 3. The API suite must remain genuinely wired end-to-end.
# ---------------------------------------------------------------------------
hdr "API suite wiring"
API_TEST_PROJ="tests/AsianTaste.API.Tests/AsianTaste.API.Tests.csproj"
if [ -f "$API_TEST_PROJ" ]; then
  if grep -q "AsianTaste.API.Tests" AsianTaste.sln 2>/dev/null; then
    printf '  ok       %s is referenced by AsianTaste.sln\n' "$API_TEST_PROJ"
  else
    fail "$API_TEST_PROJ is NOT referenced by AsianTaste.sln — 'dotnet test' would silently skip it"
  fi
  cs_count=$(git ls-files 'tests/AsianTaste.API.Tests/**/*.cs' | wc -l | tr -d ' ')
  if [ "$cs_count" -eq 0 ]; then
    fail "no C# test files under tests/AsianTaste.API.Tests — the API suite is empty"
  else
    printf '  ok       %s C# test file(s) in the API suite\n' "$cs_count"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
for n in "${notes[@]:-}"; do
  [ -n "$n" ] && printf '%s  note%s     %s\n' "$YELLOW" "$RESET" "$n"
done

if [ "${#failures[@]}" -gt 0 ]; then
  printf '\n%s%sFAIL: %d test-wiring problem(s)%s\n' "$BOLD" "$RED" "${#failures[@]}" "$RESET"
  for x in "${failures[@]}"; do printf '  - %s\n' "$x"; done
  printf '\nA test that cannot run is worse than no test: it advertises coverage that does not exist.\n'
  printf 'Fix by wiring the runner (dependency + "test" script + config) or deleting the file.\n'
  exit 1
fi

printf '\n%s%sPASS: all %d tracked test file(s) are reachable.%s\n' "$BOLD" "$GREEN" "${#TEST_FILES[@]}" "$RESET"
exit 0
