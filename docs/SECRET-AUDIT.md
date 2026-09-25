# Secret audit — Asian_taste_Vietnamese_cuisine

**Date:** 2026-09-21
**Reason:** the request was to consider making this repository public so the work
becomes verifiable. Diffing visibility is irreversible (`github.com/monsieurkd/...`
becomes world-readable, and any committed secret must be treated as compromised
from that moment), so this audit ran first.

**Verdict: do NOT make the repository public as-is.** Two live credentials are
recoverable from git history. Both were removed from the working tree in later
commits, which is *not* sufficient — history retains them, and `git log -p` is
available to anyone with read access.

## Findings

### 1. Live Neon database password — in history

```
npg_************   <-- redacted; the live value is in git history, which IS the finding
```

- Appeared in `.secrets.local.example` as a worked example of converting a
  connection string.
- Introduced around commit `2c38942` / `5add7f6`, removed by `5add7f6`
  ("Take a live Neon password out of the committed secrets template").
- **Still recoverable:** `git log --all -S "npg_"` finds it (search by prefix —
  this document deliberately does not repeat the full value).
- The file's own header states it must never carry a real value. Removing it
  from the tree fixed the symptom, not the exposure.

**Severity: high.** This is the production database (Neon `ap-southeast-2`,
the same project the Fly API talks to). A reader who flips the repo public
exposes the credential that guards all production data — orders, customer
records, and anything else in that database.

**Required action regardless of visibility:** rotate this password in the Neon
console. Once it has been pushed to any remote, even a private one, treat it as
compromised — it exists in the git objects and in whatever backups exist.

### 2. Stripe secret key — in history

```
sk_test_51T1mTl...REDACTED
```

- Committed in `bfface9` ("Initial project source"), removed in `9e51994`
  ("Fix broken frontend builds and move secrets out of the repo").
- **Still recoverable** from history.

**Severity: low-moderate.** It is a `sk_test_` key, not `sk_live_`, so it cannot
move real money. It can still be used to create test charges, read test-mode
data, and — more relevant here — it confirms the account and key format to
anyone probing. Rotate it; it costs nothing.

### 3. JWT signing key committed in production config — present in tree

```json
// src/AsianTaste.API/appsettings.json
"Jwt": { "SecretKey": "AsianTasteSecretKey2025ForJWTTokenGenerationMin32Chars" }
```

**Severity: low today, but a real latent risk.** `appsettings.json` is the base
config, so this value is the fallback for Production.

**Verified:** `fly secrets list --app asian-taste-api` shows `Jwt__SecretKey`
is set and deployed, so **production is currently signing with the real secret
and is not forgeable.** The exposure is the *fallback*, not the live value.

Why it still matters: if that env var is ever dropped — a bad deploy, a
recreated app, a `fly.toml` change — the app would silently fall back to a
public, guessable string and start accepting forged admin JWTs. Nothing would
fail loudly; the tokens would just start validating. That is the dangerous shape
of a config default.

Recommended fix: replace the literal in `appsettings.json` with an empty string
or placeholder so a missing env var fails loudly at startup instead of quietly
degrading to a publicly-known signer.

## Not found

- No `AKIA…` AWS keys.
- No `whsec_…` webhook signing secrets.
- No live Stripe key.
- No credentials in the *current* tracked tree other than the JWT secret above;
  `.gitignore` correctly covers `.env`, `.env.production`, and `.secrets.local`.

## Options if the repository should still become public

| Option | Effect | Cost |
|---|---|---|
| A. Rotate both credentials, then publish | History still shows the *old* values, which are dead once rotated. Standard industry practice. | Neon + Stripe console work, ~10 min |
| B. Rewrite history (`git filter-repo`) to purge the strings | Removes them from history entirely. | Rewrites all 78 commits — breaks every existing clone, needs a force-push, and any fork/backup keeps the old objects |
| C. Keep the repo private | Zero risk. | The work stays unverifiable to a hiring manager |

**Recommendation: A then B is overkill; do A.** Rotate first — that is the part
that actually removes the risk — and accept that history shows dead values.
Rewrite history only if you specifically want a clean public record and are
willing to force-push.

## Immediate actions (do these regardless of the visibility decision)

1. **Rotate the Neon password** and update `ConnectionStrings__DefaultConnection`
   on Fly. ⚠️ This is the one that actually matters — it guards production data.
2. **Rotate the Stripe test key** in the Stripe dashboard (test mode, so low
   stakes, but free to do).
3. ~~Set `Jwt__SecretKey` on Fly~~ — **already set and deployed**, verified.
   Optional hardening: replace the literal in `appsettings.json` with a
   placeholder so a future missing env var fails loudly instead of silently
   falling back to a public string.
