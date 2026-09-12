#!/usr/bin/env bash
#
# check-deployment-health.sh — prove the deployed stack is actually serving.
#
# Run this after a deploy, or any time you suspect production is broken:
#
#   ./scripts/check-deployment-health.sh
#   API_URL=https://asian-taste-api.fly.dev ./scripts/check-deployment-health.sh
#
# Exit 0 = every check passed. Exit 1 = at least one did not, and the failing
# check printed the concrete reason.
#
# Why this exists as a script rather than a curl in a README: "is production
# healthy?" was being answered by pasting one-off commands into a terminal, and
# the answers were not comparable between runs. The deploy workflow calls the
# same logic, so CI and a human checking by hand agree on what "healthy" means.

set -uo pipefail

API_URL="${API_URL:-https://asian-taste-api.fly.dev}"
CUSTOMER_URL="${CUSTOMER_URL:-https://asian-taste-customer.vercel.app}"

RED=$'\033[31m'; GREEN=$'\033[32m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; BOLD=""; RESET=""; }

failures=0
ok()   { printf '  %sok%s   %s\n' "$GREEN" "$RESET" "$1"; }
bad()  { printf '  %sfail%s %s\n' "$RED" "$RESET" "$1"; failures=$((failures + 1)); }
hdr()  { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }

# fetch_status URL -> prints the HTTP status, or 000 when unreachable.
fetch_status() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null || echo "000"
}

hdr "API liveness ($API_URL/healthz)"
code=$(fetch_status "$API_URL/healthz")
if [ "$code" = "200" ]; then
    ok "/healthz returned 200 (the process is serving)"
else
    bad "/healthz returned $code — the app is not running or not reachable"
fi

hdr "API readiness ($API_URL/health/db)"
code=$(fetch_status "$API_URL/health/db")
body=$(curl -s --max-time 15 "$API_URL/health/db" 2>/dev/null || echo "")
if [ "$code" = "200" ]; then
    ok "/health/db returned 200 — $body"
else
    # The body names the concrete cause (unreachable host, bad credentials),
    # which is the whole reason the endpoint exists.
    bad "/health/db returned $code — $body"
fi

hdr "Menu content"
menu=$(curl -s --max-time 20 "$API_URL/api/menu" 2>/dev/null || echo "")
count=$(printf '%s' "$menu" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(sum(len(c["items"]) for c in d["categories"]))
except Exception:
    print(0)' 2>/dev/null || echo 0)

if [ "${count:-0}" -ge 1 ]; then
    ok "the menu served $count items"
else
    bad "the menu is empty or unreadable — the database may be reachable but unseeded"
fi

# The duplicate-dish bug produced 164 cards for 82 dishes, so a count alone
# would not have caught it. Compare distinct names to the row count instead.
dupes=$(printf '%s' "$menu" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    names = [i["name"] for c in d["categories"] for i in c["items"]]
    print(len(names) - len(set(names)))
except Exception:
    print(-1)' 2>/dev/null || echo -1)

if [ "${dupes:- -1}" = "0" ]; then
    ok "no duplicate dishes ($count rows, all distinct)"
else
    bad "$dupes duplicate menu rows — the seed has run more than once"
fi

hdr "CORS for the customer site"
acao=$(curl -s -D- -o /dev/null --max-time 15 -H "Origin: $CUSTOMER_URL" "$API_URL/api/menu" \
    | grep -i '^access-control-allow-origin' | tr -d '\r' || true)
if [ -n "$acao" ]; then
    ok "$acao"
else
    bad "no Access-Control-Allow-Origin for $CUSTOMER_URL — the browser will block every request"
fi

hdr "Production posture (dev endpoints must be gone)"
for path in /api/dev/db/reset /api/dev/db/seed /api/dev/db/status; do
    code=$(fetch_status "$API_URL$path")
    if [ "$code" = "404" ]; then
        ok "$path is 404 (disabled outside Development)"
    else
        bad "$path returned $code — ASPNETCORE_ENVIRONMENT is not 'production'"
    fi
done

hdr "Customer site ($CUSTOMER_URL)"
for path in / /menu /cart; do
    code=$(fetch_status "$CUSTOMER_URL$path")
    if [ "$code" = "200" ]; then
        ok "$path returned 200"
    else
        bad "$path returned $code — check the SPA rewrite in vercel.json"
    fi
done

printf '\n'
if [ "$failures" -eq 0 ]; then
    printf '%sPASS: the deployed stack is healthy.%s\n' "$GREEN" "$RESET"
    exit 0
fi
printf '%sFAIL: %d check(s) failed.%s\n' "$RED" "$failures" "$RESET"
exit 1
