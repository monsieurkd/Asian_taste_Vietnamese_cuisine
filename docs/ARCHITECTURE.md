# How it all works together

A map of the whole system: what runs where, how a change reaches production, and
how the pieces talk to each other. Written to be read cold — by you in three
months, or by whoever takes this over.

For the step-by-step setup commands, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## The four moving parts

```
                    ┌─────────────────────────────────────────┐
   Browser  ──────► │  Vercel                                 │
   (customer)       │  asian-taste-customer.vercel.app        │
                    │  React + Vite, static files             │
                    └────────────────┬────────────────────────┘
                                     │  HTTPS + CORS
                                     │  VITE_API_BASE_URL baked in at build time
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │  Fly.io  (region: syd)                  │
                    │  asian-taste-api.fly.dev                │
                    │  ASP.NET Core 10, Docker container      │
                    └────────────────┬────────────────────────┘
                                     │  Npgsql, pooled connection
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │  Neon  (region: ap-southeast-2)         │
                    │  PostgreSQL                             │
                    └─────────────────────────────────────────┘

   GitHub  ──────►  Actions: CI (test)  ──►  Deploy (ship)
```

Four services, and each one is replaceable without touching the others — the
frontend only knows the API's URL, and the API only knows a connection string.

| Piece | What it is | Why this one |
|---|---|---|
| **Vercel** | Static host for the customer app | Free, global CDN, deploys from Git by itself |
| **Fly.io** | Runs the API container | Always-on cheaply (~$2–3/mo), and *doesn't sleep* — a sleeping API drops orders |
| **Neon** | Managed PostgreSQL | Free tier with no expiry, and scales to zero when idle |
| **GitHub Actions** | Build, test, deploy | Already where the code lives |

---

## How a change reaches production

You push to `main`. Two workflows fire, and their relationship is the important
part:

```
git push origin main
        │
        ├──────────────► CI (ci.yml) ─────────────────────────────┐
        │                 • API build + 71 tests                  │
        │                 • guardrails (test wiring/health/CI)     │
        │                 • both frontends lint + build           │
        │                 • UI quality loop (if a vision key set)  │
        │                                                         │
        └──────────────► Deploy (deploy.yml)                      │
                           await-ci  ◄───────────────────────────┘
                              │  polls the Actions API until THIS commit's
                              │  CI run concludes `success`.
                              │  Not green? The deploy never starts.
                              │
                              ├──► deploy-api
                              │      fly deploy
                              │      then ./scripts/check-deployment-health.sh
                              │      against the LIVE site
                              │
                              └──► verify-customer
                                     waits for Vercel's own deployment of this
                                     commit to report READY
```

**Why the gate exists.** Without it, a red CI run and a green deploy could
diverge — you would ship code that failed its own tests. `await-ci` refuses to
continue unless CI concluded `success` on the *same commit*, which is why the two
workflows cannot disagree.

**Why two workflow files.** `ci.yml` also runs on pull requests. If the deploy
jobs lived there, they would either run on PRs or need an `if` on every job —
easy to get wrong six months from now. Splitting the files makes "deploys only
from main" structural rather than conditional.

**Who deploys the frontend.** Vercel, by itself. Its Git integration builds and
deploys every push to `main`. The pipeline does *not* run `vercel deploy` — that
would be a second deployer for the same project, so two builds per commit and a
race over which one serves production. Instead `verify-customer` waits for
Vercel's deployment of that commit to become READY and fails if it does not. The
frontend is gated without being deployed twice.

---

## The API, in detail

### Startup

`Program.cs` runs the whole database migration sequence at boot. Two things about
that are deliberate:

**A database problem does not kill the process.** It retries three times (Neon
scales to zero, so a cold start may need a moment), then logs the concrete error
and *starts anyway*. This was learned the hard way: the original unguarded
`await` threw before the HTTP listener bound, so on Fly the process aborted, the
machine restarted, aborted again, and looped to the restart limit — burying the
real error (`Failed to connect to 127.0.0.1:5432`) under restart spam.

**The migrations are ordered, and the order is forced.** `schema → de-duplicate →
create the seed's conflict index → seed → 04-10 → remaining indexes → admin user`.
The seed conflicts on `(name, category_id)`, and `ON CONFLICT` is rejected until
an index can arbitrate it — but that index cannot be built while duplicate dishes
are still present. So the duplicates must go first. Getting this order wrong fails
at startup with a clear SQLSTATE, which is how it was found.

### Health endpoints, and why there are two

| Endpoint | Answers | Wired to Fly? | On failure |
|---|---|---|---|
| `/healthz` | Is the process serving HTTP? | **Yes** | Fly kills and restarts the machine |
| `/health/db` | Can it reach the database? | No | Returns 503 *with the reason* |

Only the liveness check drives Fly, and the separation is load-bearing. A liveness
probe that touches the database converts a transient database problem into a
restart loop — which is exactly what happened here. Dependency health belongs
where a failure is *reported*, not where it destroys the evidence.

This is also why "the menu is empty" is now diagnosable in one request instead of
an SSH session.

### Data model, briefly

`categories → menu_items → modifier_groups → modifiers`, plus `orders →
order_items → order_item_modifiers`. Orders copy the dish name and price onto the
line item, so **order history survives menu changes** — deleting a dish does not
rewrite what someone was charged.

`menu_items` carries a unique index on `(name, category_id)`. That is the natural
key: a dish name is unique within its category. It is what makes the seed
re-runnable, and it is what stopped every dish from appearing twice.

---

## The frontend, in detail

A Vite/React SPA. Two configuration facts cause most of the confusion:

**Env vars are baked in at build time, not read at runtime.** `VITE_API_BASE_URL`
is inlined into the JavaScript bundle when Vercel builds it. Changing the value in
the Vercel dashboard does nothing until the next deploy. This is a Vite
characteristic, not a bug.

**`VITE_API_BASE_URL` must include `/api`.** Pointing it at a bare origin makes
every request 404 *while the UI still renders*, so the symptom looks like an empty
menu rather than a broken config. `src/api/client.ts` detects this, appends
`/api`, and logs a warning — but set it correctly: it should be
`https://asian-taste-api.fly.dev/api`.

**Deep links need a rewrite.** The app uses `BrowserRouter`, so `/menu/item/33` is
a client-side route with no file behind it. Without the `vercel.json` catch-all
rewrite to `/index.html`, a direct load or a refresh returns 404.

---

## Secrets: where each one lives

The rule: **a secret lives in the platform that needs it, and nowhere else.**

| Secret | Stored in | Used by |
|---|---|---|
| Neon connection string | Fly secrets | the API |
| `Encryption__Key`, `Jwt__SecretKey` | Fly secrets | the API |
| `Cors__AllowedOrigins__0` | Fly secrets | the API (which browser origin may call it) |
| `FLY_API_TOKEN` | GitHub secret | the deploy workflow |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_CUSTOMER_PROJECT_ID` | GitHub secrets | the verify job |
| `VITE_API_BASE_URL`, `VITE_STRIPE_PUBLISHABLE_KEY` | Vercel env vars | the browser (so these are *public* by design) |
| Your copies of all the above | `.secrets.local` (gitignored) | your shell, for running `fly secrets set` |

`VITE_*` values are public — they end up in the JavaScript bundle, which is fine
because the Stripe *publishable* key is meant to be seen. The Stripe **secret**
key must never appear there.

**Never paste a live credential into a chat.** Treat anything typed into a
conversation as disclosed. If it happens, rotate it — rotation costs minutes,
exposure lasts indefinitely. `.secrets.local.example` shows the pattern for
storing them locally instead.

---

## CORS: why it is configured, not hardcoded

The API must tell the browser which origins may call it. That list is now
configuration (`Cors__AllowedOrigins__N` on Fly) rather than hardcoded, because a
deployed frontend with hardcoded `localhost` origins would be blocked with no fix
short of editing and redeploying the API.

**Use the indexed form.** ASP.NET Core maps `Cors__AllowedOrigins__0`,
`__1`, … onto array elements. A JSON array
(`Cors__AllowedOrigins='["https://..."]'`) looks correct, silently produces an
empty list, and leaves the API starting normally while every browser request is
blocked and nothing appears in the log:

```
Cors__AllowedOrigins='["https://..."]'   → no Access-Control-Allow-Origin header
Cors__AllowedOrigins__0="https://..."    → Access-Control-Allow-Origin: https://...
```

The API now logs a warning in production when the list is empty, so this failure
is no longer silent.

---

## Verifying it all works

One command, the same one CI runs after every API deploy:

```bash
./scripts/check-deployment-health.sh
```

It checks, against **live production**:

- `/healthz` returns 200 — the process is serving
- `/health/db` returns 200 — the database is reachable, and it prints the menu count
- the menu has items **and no duplicate dishes** (a row count alone would not
  have caught the bug that started all of this: 164 rows for 82 dishes looked
  plausible)
- CORS returns the header for the real frontend origin
- all three `/api/dev/db/*` endpoints return **404** — the destructive dev
  endpoints are off in production
- the customer site serves `/`, `/menu` and `/cart` — the SPA rewrite works

Locally, the three guardrails cover the rest:

```bash
dotnet test                                     # 71 tests
./scripts/check-test-wiring.sh                   # every test file can actually run
./scripts/check-test-health.sh                   # tests really ran, suite did not shrink
./scripts/check-ci-integrity.sh                  # the guardrails themselves are intact
```

---

## What is deliberately not done yet

| Not done | Why | Before launch |
|---|---|---|
| Admin app not deployed | Needs a conversation with the owner about exposure | See [Admin app](DEPLOYMENT.md#admin-app) |
| `Payment__UseMockGateway: true` | Real payments need live Stripe keys | **Must** be false, or orders are accepted unpaid |
| Stripe publishable key unset on Vercel | Blocks checkout | Set `VITE_STRIPE_PUBLISHABLE_KEY` |
| Single Fly machine, no autoscaling | One is enough for a restaurant; scale when it hurts | — |
| Neon free tier has no backups | Free tier limitation | Upgrade or schedule `pg_dump` |
| Vercel Hobby is non-commercial | A restaurant taking orders is commercial use | Move to Pro or Cloudflare Pages |

---

## Cost

| Piece | Monthly |
|---|---|
| Fly.io API (256 MB, always-on, Sydney) | ~$2–3 |
| Neon Postgres (free tier) | $0 |
| Vercel customer app (Hobby) | $0 |
| Admin app | $0 (not deployed) |
| GitHub Actions | $0 (public repo minutes) |
| **Total** | **~$2–3** |

Fly's free *trial* is not an option: it stops machines after 5 minutes, which is
what made the app appear broken while the code was fine. A credit card on the Fly
account is a prerequisite, not an optimisation.
