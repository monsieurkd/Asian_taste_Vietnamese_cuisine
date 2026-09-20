#!/usr/bin/env bash
#
# backup-db.sh — take a real, restorable dump of the production database.
#
#   ./scripts/backup-db.sh                      # write a compressed dump
#   ./scripts/backup-db.sh --out ~/backups      # choose where it lands
#   ./scripts/backup-db.sh --keep 30            # prune dumps older than 30 days
#   ./scripts/backup-db.sh --verify-only        # check the toolchain, write nothing
#
# Why this exists: Neon's free tier has **no automated backups** (docs/TODO.md §9
# item 3). Before this script the only copy of the orders table was the running
# database, so a bad migration or an accidental DELETE meant the day's takings
# were gone with no way back. That is the kind of gap that is invisible until the
# afternoon it matters.
#
# It uses `pg_dump` when one is installed, and falls back to the postgres image via
# Docker when it is not — which is the common case on a machine that only needs to
# talk to a hosted Postgres. Both paths produce the same file.
#
# Neon specifics that are easy to get wrong:
#   * The **pooled** endpoint (…-pooler.…) runs PgBouncer, which does not support
#     everything `pg_dump` needs. The *unpooled* URL is required. `DATABASE_URL_UNPOOLED`
#     is used when present for exactly this reason.
#   * Neon suspends idle branches. A dump straight after a quiet period can time out
#     while the compute wakes up, so the connection timeout is generous.
#
# Exit 0 = a dump was written and its integrity was checked.
# Exit 1 = nothing usable was written; the reason is printed.

set -uo pipefail

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""; }

ok()   { printf '  %sok%s   %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %swarn%s %s\n' "$YELLOW" "$RESET" "$1"; }
bad()  { printf '  %sfail%s %s\n' "$RED" "$RESET" "$1"; }
hdr()  { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${HOME}/asian-taste-backups"
KEEP_DAYS=""
VERIFY_ONLY=0
PG_IMAGE="postgres:17-alpine"

while [ $# -gt 0 ]; do
  case "$1" in
    --out)         OUT_DIR="${2:?--out needs a directory}"; shift 2 ;;
    --keep)        KEEP_DAYS="${2:?--keep needs a number of days}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

# ── Resolve the connection string ────────────────────────────────────────────
#
# Order matters. The unpooled URL wins because pg_dump talks to a PgBouncer-pooled
# endpoint badly (see the header). Then the pooled one, then DATABASE_URL from the
# environment, so this works both locally and from CI.
hdr "Resolving the database URL"

load_env_file() {
  # Read a KEY=value file without executing it and without echoing values.
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    local key="${line%%=*}"
    local val="${line#*=}"
    # Strip one layer of surrounding quotes, which is how .env files are usually written.
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    case "$key" in
      DATABASE_URL_UNPOOLED|DATABASE_URL)
        [ -n "${!key:-}" ] || export "$key=$val"
        ;;
    esac
  done < "$file"
}

# .env.local first (it is the file this repo documents for local secrets), then
# .secrets.local. Neither is committed.
load_env_file "$REPO_ROOT/.env.local"
load_env_file "$REPO_ROOT/.secrets.local"

DB_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ]; then
  bad "no DATABASE_URL_UNPOOLED or DATABASE_URL found"
  printf '  Looked in: %s/.env.local, %s/.secrets.local, and the environment.\n' "$REPO_ROOT" "$REPO_ROOT"
  printf '  See .secrets.local.example, or docs/DEPLOYMENT.md.\n'
  exit 1
fi

# Never print the URL. It carries a live password and this output goes into
# terminals, CI logs and issue reports.
#
# `plan_host` strips the userinfo section (user:password@), keeping only host and
# database name. An earlier version of this line printed the raw variable when
# neither branch was empty, which wrote the production Neon password to the
# terminal on the very first run — the exact class of leak this comment warns
# about. Anything printed below must go through plan_host first.
plan_host() {
  # Print only host + database name, with any userinfo (and therefore any
  # password) removed. Verified against pooled, unpooled, localhost and
  # password-less URL shapes.
  printf '%s' "$1" | sed -E 's#^([a-z]+://)([^@/]*@)?([^/?]+)(/[^?]*)?.*#\3\4#'
}

if [ -n "${DATABASE_URL_UNPOOLED:-}" ]; then
  ok "using the unpooled URL for $(plan_host "$DB_URL")"
else
  ok "using DATABASE_URL for $(plan_host "$DB_URL")"
fi

# Warn loudly if we fell back to a pooled endpoint, because the dump may fail.
if [ -z "${DATABASE_URL_UNPOOLED:-}" ]; then
  case "$DB_URL" in
    *-pooler.*)
      warn "only a POOLED URL is available; pg_dump against PgBouncer often fails."
      warn "set DATABASE_URL_UNPOOLED (Neon dashboard → Connection Details → uncheck 'Pooled')."
      ;;
  esac
fi

# ── Choose a pg_dump ─────────────────────────────────────────────────────────
hdr "Locating pg_dump"

PG_DUMP=(pg_dump)
PG_RESTORE_CHECK=(pg_restore)
USING_DOCKER=0

if command -v pg_dump >/dev/null 2>&1; then
  # Version only. The earlier line here ran bare `pg_dump`, which — with no database
  # or arguments — read from stdin and, in a failed-connection test, echoed a
  # connection string containing a password straight into the report.
  ok "$(pg_dump --version 2>/dev/null | head -1)"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  USING_DOCKER=1
  # Two separate commands, because `pg_restore --list < file` needs the file on stdin
  # while `pg_dump --dbname …` needs the connection string as an argument.
  PG_DUMP=(docker run --rm -i "$PG_IMAGE" pg_dump)
  PG_RESTORE_CHECK=(docker run --rm -i "$PG_IMAGE" pg_restore)
  if docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
    ok "docker image $PG_IMAGE (already pulled)"
  else
    warn "docker image $PG_IMAGE is not present; it will be pulled on first use"
  fi
else
  bad "neither pg_dump nor a running docker daemon is available"
  printf '  Install the postgres client (brew install libpq && brew link --force libpq),\n'
  printf '  or start Docker. Then re-run.\n'
  exit 1
fi

# The Docker fallback runs a container as a different user than the host, so a
# directory the host can write may not be writable from inside it. Verifying now
# avoids a pull + connection + dump before discovering that.
if [ "$USING_DOCKER" -eq 1 ] && [ "$VERIFY_ONLY" -eq 0 ]; then
  mkdir -p "$OUT_DIR"
  if ! docker run --rm -v "$OUT_DIR:/out" "$PG_IMAGE" sh -c 'touch /out/.write-probe' >/dev/null 2>&1; then
    bad "the docker fallback cannot write to $OUT_DIR"
    printf '  Re-run with --out pointing at a directory under your home that Docker Desktop\n'
    printf '  has been granted access to, or install the postgres client instead.\n'
    exit 1
  fi
  rm -f "$OUT_DIR/.write-probe"
fi

if [ "$VERIFY_ONLY" -eq 1 ]; then
  hdr "Verify only"
  ok "toolchain is usable; no dump was written"
  exit 0
fi

# ── Take the dump ────────────────────────────────────────────────────────────
hdr "Dumping the database"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="asian-taste-${STAMP}"
TARGET="${OUT_DIR}/${BASE}.dump"

# A temporary name, moved into place only on success. A half-written dump that
# looks like a backup is worse than no backup: it is the file someone restores
# from during an incident, and it will be truncated.
TMP="${TARGET}.partial"
trap 'rm -f "$TMP"' EXIT

# `--format=custom` rather than plain SQL: it compresses, restores selectively with
# pg_restore, and is what `--verify-only`-style integrity checks expect. The
# connection timeout is generous because Neon wakes a suspended compute first.
dump_args=(
  --format=custom
  --no-owner
  --no-acl
  --verbose
)

if ! "${PG_DUMP[@]}" "${dump_args[@]}" --dbname "$DB_URL" > "$TMP" 2>"${TMP}.err"; then
  bad "pg_dump failed"
  # Show the error, but scrub anything that looks like a credential before
  # printing — a failed connection string is the most likely thing to leak here.
  sed -E 's#(://[^:]*:)[^@]*@#\1***@#g' "${TMP}.err" | tail -20 | sed 's/^/     /'
  rm -f "${TMP}.err"
  exit 1
fi
rm -f "${TMP}.err"

if [ ! -s "$TMP" ]; then
  bad "pg_dump produced an empty file"
  exit 1
fi

mv "$TMP" "$TARGET"
trap - EXIT

SIZE="$(du -h "$TARGET" | cut -f1)"
ok "wrote $TARGET ($SIZE)"

# ── Prove the dump is restorable ─────────────────────────────────────────────
#
# `pg_restore --list` reads the archive's table of contents. It is not a full
# restore test, but it catches the two failures that actually happen: a truncated
# file, and an archive written with incompatible flags. An unverified backup is a
# belief, not a backup.
#
# The listing is captured ONCE into a variable. An earlier version ran
# `pg_restore --list < file` separately for the readability check and for each
# table check; because a file redirected on stdin can only be read once, every
# check after the first saw an empty stream and the script warned that four
# present tables were missing. Reading it once removes both the bug and the
# repeated work.
hdr "Verifying the dump"

LISTING="$("${PG_RESTORE_CHECK[@]}" --list < "$TARGET" 2>/dev/null || true)"

if [ -n "$LISTING" ] && printf '%s' "$LISTING" | grep -q 'TABLE DATA'; then
  TABLES="$(printf '%s' "$LISTING" | grep -c 'TABLE DATA' || true)"
  ok "archive is readable"
  ok "${TABLES:-0} table(s) of data present"
else
  bad "the dump could not be read back; do NOT rely on it"
  exit 1
fi

# Sanity-check that the tables this app cannot afford to lose are actually in it.
for required in orders order_items menu_items customers; do
  if printf '%s' "$LISTING" | grep -q "TABLE DATA public ${required}"; then
    ok "contains ${required}"
  else
    warn "${required} is not in the dump — check this is the right database"
  fi
done

# ── Prune old dumps ──────────────────────────────────────────────────────────
if [ -n "$KEEP_DAYS" ]; then
  hdr "Pruning dumps older than ${KEEP_DAYS} day(s)"
  removed=0
  while IFS= read -r old; do
    [ -n "$old" ] || continue
    rm -f "$old" && removed=$((removed + 1))
  done < <(find "$OUT_DIR" -maxdepth 1 -name 'asian-taste-*.dump' -type f -mtime "+${KEEP_DAYS}" 2>/dev/null)
  ok "removed ${removed} old dump(s)"
fi

hdr "Done"
printf '  Restore with:\n'
printf '    pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL_UNPOOLED" %s\n' "$TARGET"
printf '  Or, in the Docker fallback:\n'
printf '    docker run --rm -i %s pg_restore --clean --if-exists --no-owner --no-acl -d "…" < %s\n' "$PG_IMAGE" "$TARGET"
printf '\n  %sThis is a manual backup. Nothing runs it for you%s — see docs/TODO.md §9 item 3\n' "$BOLD" "$RESET"
printf '  for the scheduled option, which needs a decision about where dumps live.\n'
exit 0
