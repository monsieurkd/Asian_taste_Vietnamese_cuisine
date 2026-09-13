# Deployment

How Asian Taste gets from `git push` to production, and the one-time setup that
makes it work.

**Stack:** Fly.io (API) · Neon (PostgreSQL) · Vercel (customer app) · admin app
deliberately not public yet.

---

## Where secrets live

Read this before pasting any credential anywhere.

| Secret | Lives in | How to set it |
|---|---|---|
| Neon connection string | Fly secret | `fly secrets set "ConnectionStrings__DefaultConnection=$NEON_CONNECTION_STRING"` |
| `Encryption__Key`, `Jwt__SecretKey` | Fly secrets | same |
| `Cors__AllowedOrigins__N` | Fly secrets | `fly secrets set Cors__AllowedOrigins__0=https://...` |
| Fly deploy token | GitHub secret `FLY_API_TOKEN` | `gh secret set FLY_API_TOKEN` |
| Vercel token / IDs | GitHub secrets | `gh secret set VERCEL_TOKEN` |
| `VITE_API_BASE_URL` | Vercel project env vars | dashboard, or the API |
| Stripe publishable key | Vercel project env vars | dashboard |
| Stripe **secret** key | Fly secret | never in the frontend |

**For your own machine**, use the pattern in `.secrets.local.example`:

```bash
cp .secrets.local.example .secrets.local   # gitignored
$EDITOR .secrets.local                     # paste values here, once
source .secrets.local                      # load into your shell
fly secrets set "ConnectionStrings__DefaultConnection=$NEON_CONNECTION_STRING"
```

That file is the answer to "where do I paste my Neon password next time". It is
gitignored, so it never enters history, and `source`-ing it means the value goes
straight from the file into the `fly` command without passing through a chat, a
terminal transcript, or a clipboard history you might not control.

**Never** paste a live credential into an AI chat. Anything typed into a
conversation should be treated as disclosed — it is stored, and it may be logged
or backed up somewhere you cannot see. If it happens, **rotate the credential**
rather than hoping; rotation is minutes, exposure is indefinite.

---

## The shape of it

```
git push main
   │
   ├─► CI (ci.yml)        build + test + guardrails + frontend builds
   │
   └─► Deploy (deploy.yml)
          await-ci  ───── waits for the CI run on THIS commit
             │
             ├─► deploy-api        Fly deploy, then check-deployment-health.sh
             └─► verify-customer   waits for Vercel's own deploy to be READY
```

**Two workflows, and why they are separate.** `ci.yml` runs on pull requests
too, so deploy jobs living there would either run on PRs or need an `if` on every
job — easy to get wrong later. A separate file makes "deploys only from main"
structural rather than conditional.

**The gate.** `await-ci` polls the GitHub Actions API for the CI run on the same
commit and refuses to continue unless it concluded `success`. This is why a red
CI run cannot be followed by a green deploy. It queries the REST API directly
rather than using `gh run list`, because that returned nothing on the runner
(the default token lacks Actions-read) and — with its stderr suppressed — hung
for its full timeout instead of failing. A gate that hangs is worse than one that
fails: it looks like a slow deploy.

**Who deploys what.** Fly is deployed *by* the pipeline. Vercel is deployed by
its own Git integration, and the pipeline only *verifies* it. That is deliberate
and covered in [Why it is built this way](#why-it-is-built-this-way).

The admin app is not in the pipeline on purpose — see [Admin app](#admin-app).

---

## One-time setup

These are the steps that cannot be automated from the repo. Run them in order;
each one feeds the next.

### 1. Neon (database)

1. Create a project at <https://neon.tech>. Pick **Sydney** (`ap-southeast-2`) —
   the API runs in `syd`, and a cross-region database adds ~150 ms to every
   query, which is very visible on a menu page.
2. Copy the **pooled** connection string (the host containing `-pooler`).
   Serverless Postgres bills per connection and the API opens one per request;
   the pooler is what makes that affordable.
3. Keep it for step 2.

> Free tier: 0.5 GB storage, no expiry, scales to zero when idle. The API runs
> migrations on startup, so it will not stay asleep for long once traffic is real.
> Watch the storage meter before going live — 0.5 GB is not a lot of orders.

### 2. Fly.io (API)

```bash
# Install once
brew install flyctl
fly auth signup          # or: fly auth login

# From the repo root
fly launch --no-deploy   # accepts the existing fly.toml; say NO to a Postgres
```

If `fly launch` suggests a database, **decline** — you are using Neon.

Then set the secrets. These are the ones the API refuses to start without:

```bash
fly secrets set \
  ConnectionStrings__DefaultConnection="<neon pooled connection string>" \
  Encryption__Key="$(openssl rand -base64 32)" \
  Jwt__SecretKey="$(openssl rand -base64 48)"
```

Add these once the frontends exist (substitute your real Vercel URLs). Note the
**indexed** syntax — a JSON array silently does not bind, see the note below:

```bash
fly secrets set \
  Cors__AllowedOrigins__0="https://<customer-app>.vercel.app"
```

> **Use `__0`, `__1`, … not `'["https://..."]'`.** ASP.NET Core maps indexed
> environment variables onto array elements; it does not parse a JSON string
> into `string[]`. The JSON form looks correct, produces an empty list, and the
> API starts happily — then every browser request is blocked by CORS with no
> error in the API log. Verified against the real published build:
>
> ```
> Cors__AllowedOrigins='["https://asian-taste.vercel.app"]'
>   -> no Access-Control-Allow-Origin header
> Cors__AllowedOrigins__0="https://asian-taste.vercel.app"
>   -> Access-Control-Allow-Origin: https://asian-taste.vercel.app
> ```

And when you are ready for real payments (see [Going live](#going-live)):

```bash
fly secrets set \
  Stripe__SecretKey="sk_live_..." \
  Stripe__PublishableKey="pk_live_..." \
  Stripe__WebhookSecret="whsec_..." \
  Payment__UseMockGateway=false
```

Deploy and confirm:

```bash
fly deploy
fly open /api/menu        # should return JSON with 82 items
fly logs                  # watch the migration run on first boot
```

**The first deploy creates the schema automatically.** `DatabaseInitializationService`
runs every migration on startup, and seeds the menu. Confirm with:

```bash
curl -s https://<your-app>.fly.dev/api/menu | python3 -m json.tool | head
```

> **`ASPNETCORE_ENVIRONMENT=production` is set in `fly.toml` and must stay that
> way.** It is what disables the unauthenticated `/api/dev/db/{init,seed,reset}`
> endpoints. Setting it to `Development` would put "wipe the database" and "dump
> recent orders" on a public URL.

> **Admin login:** the seed creates `admin` / `Admin123!` for a fresh database. That is a
> starting credential, not a deployed one — the production database's password has been
> changed away from it. Change it before exposing any new environment:
> app is reachable by anyone else. Rotate by updating the `admin_users` row
> directly, or delete it and let the next boot re-seed with a password you
> control — but note the re-seed only happens when **no** admin row exists.

### 3. Vercel (customer app)

Your repo is already connected, but a project pointed at the repo **root** will
fail — there is no app there. Create (or fix) the project so that:

| Setting | Value |
|---|---|
| Root Directory | `src/asian-taste-customer` |
| Framework Preset | Vite |
| Build Command | *(leave default)* |
| Output Directory | `dist` |

Set **Settings → General → Root Directory**. Setting it via `vercel.json` does
not work reliably, which is the usual cause of "no framework detected" here.

Then add the environment variables under
**Settings → Environment Variables → Production**:

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<your-app>.fly.dev/api` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` |

> **These are inlined at build time, not read at runtime.** Changing a value in
> the dashboard does nothing until the next deploy. This is the single most
> common "but I set it!" moment with Vite.

> **`VITE_API_BASE_URL` must include `/api`.** Pointing at a bare origin makes
> every request 404 while the UI still renders, so the failure looks like an
> empty menu rather than a broken config. `src/api/client.ts` detects it,
> appends `/api`, and logs a warning — but set it correctly.

### 4. GitHub (deploy automation)

Under **Settings → Secrets and variables → Actions**:

| Kind | Name | Where to get it |
|---|---|---|
| Secret | `FLY_API_TOKEN` | `fly tokens create deploy -x 999999h` |
| Secret | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| Secret | `VERCEL_ORG_ID` | `vercel link`, then read `.vercel/project.json` |
| Secret | `VERCEL_CUSTOMER_PROJECT_ID` | same file |
| Variable | `API_URL` | `https://<your-app>.fly.dev` |

Until these exist, both deploy jobs **skip with a notice** rather than failing —
so the workflow is green from the first push, and turns on the moment you add
the secrets.

> Vercel's own Git integration also deploys on push. Running both means two
> deploys per commit. Pick one: either skip the GitHub Vercel secrets and let
> Vercel handle the frontend, or turn off Vercel's automatic Git deployments in
> the project settings. Keeping both is harmless but noisy and doubles build
> minutes.

---

## Health check

One command answers "is production actually working?":

```bash
./scripts/check-deployment-health.sh
```

It checks liveness, readiness, menu content, **duplicate dishes**, CORS for the
real origin, that the dev endpoints are 404 in production, and the customer
site's SPA routes. The deploy workflow runs the same script after every API
deploy, so CI and a manual check cannot disagree about what "healthy" means.

The duplicate check exists because a row count is not enough: the bug that
started all of this served 164 rows for 82 dishes, which looked plausible until
you compared distinct names.

---

## Day-to-day

| I want to… | Do this |
|---|---|
| Deploy everything | Push to `main` |
| Deploy only the API | `fly deploy` from the repo root |
| Watch a deploy | GitHub → Actions → Deploy |
| See API logs | `fly logs` |
| Set/change a secret | `fly secrets set KEY=value` (triggers a restart) |
| Roll back the API | `fly releases` then `fly deploy --image <previous>` |
| Roll back the frontend | Vercel → Deployments → ⋯ → Promote to Production |

---

## Why it is built this way

**Why a separate `deploy.yml`.** `ci.yml` triggers on `pull_request` too. Putting
deploy jobs in it would mean either deploying from PRs or guarding every job with
an `if` that is easy to get wrong later. A separate file makes "deploys only from
main" structural.

**Why `await-ci` instead of re-running the tests.** CI already ran them on this
commit. Re-running would double build minutes and prove nothing new. Waiting on
the existing run is what makes the gate meaningful.

**Why `concurrency` with `cancel-in-progress: false`.** Two commits landing close
together would otherwise race, and the loser's deploy could finish last — leaving
the API and frontend on different versions.

**Why there are two health endpoints, and only one drives Fly.** `/healthz` is
liveness and touches nothing; `/health/db` is readiness and reports the concrete
database error. Only `/healthz` is wired to the Fly check, and that separation is
load-bearing: a liveness probe that touches the database turns a transient
database problem — or a bad connection string — into the machine being killed and
restarted until it hits the restart limit. That is not hypothetical: it is
exactly what happened, and the crash loop buried the real error ("Failed to
connect to 127.0.0.1:5432") under restart spam. Dependency health belongs in a
readiness endpoint, where a failure is *reported*, not in a liveness probe, where
a failure destroys the evidence.

**Why Vercel deploys itself and the pipeline only verifies it.** Vercel's Git
integration already builds and deploys every push to `main`. A `vercel deploy` in
the workflow would be a second deployer for the same project — two builds per
commit, and a race over which one serves production. The CLI path was also not
usable with a team-scoped token (see the table below), whereas the REST API
accepts it. So `verify-customer` waits for that commit's deployment to become
READY and fails otherwise, which gates the frontend without duplicating the work.

**Why the smoke test fails on duplicate dishes.** The bug that started all of
this served 164 rows for 82 dishes. A row count looked plausible; only comparing
*distinct names* to the row count catches it, so the check does that.

**Why `auto_stop_machines = "off"`.** The API is customer-facing and Stripe
webhooks arrive unannounced. A machine that sleeps to save a few cents would drop
a real order. This is the ~$2-3/month that buys reliability over a free tier.

**Fly billing is a prerequisite, not an optimisation.** On Fly's free *trial*,
machines are stopped after 5 minutes:

```
warn: Trial machine stopping. To run for longer than 5m0s, add a credit card
      by visiting https://fly.io/trial.
```

The config above asks for an always-on machine and the trial timer overrides it,
so the app alternates between running and stopped. Fly Doctor reports this as
"App is not listening to the expected port" and blames your code — a **false
positive**. The app binds correctly (`Now listening on: http://[::]:8080`, which
is all interfaces on the expected `internal_port`), the health check passes while
the machine is up, and the port is fine. The fix is a credit card on the Fly
account, not a code change.

---

## Admin app

Not deployed. When you and the owner are ready, there are three options, cheapest
first:

1. **Vercel project with password protection** — same repo, Root Directory
   `src/asian-taste-admin`, plus Vercel's password protection (a paid feature) or
   an allowlist. Simplest.
2. **Local-only** — run `npm run dev` on a laptop at the restaurant, pointed at
   the production API. Zero cost, no public attack surface.
3. **Public URL behind the app's own login** — free, but the login page becomes
   internet-facing. If you take this, rotate the default password first and set
   `Cors__AllowedOrigins` to include its origin.

Whichever you choose, add its origin to `Cors__AllowedOrigins__1` on Fly or every
request from it will be blocked by CORS.

---

## Going live

Things that must change before real customers pay real money:

- [x] **Rotate the admin password** off `Admin123!` — done for the deployed database.
      Do it again for any new environment before exposing the admin app.
- [ ] **Stripe live keys** set on Fly, and `Payment__UseMockGateway=false`.
      While it is `true` the API approves payments without contacting Stripe, so
      orders are accepted unpaid.
- [ ] **Stripe webhook endpoint** pointing at `https://<api>/api/webhook/stripe`,
      with its signing secret in `Stripe__WebhookSecret`.

      The route is `webhook` (singular). Subscribing Stripe to
      `/api/webhooks/stripe` looks right and returns 404 — nothing arrives and no
      error is raised anywhere, so payments appear to succeed while the order is
      never marked paid.

      Subscribe to exactly these four events; the API handles these and ignores
      the rest:

      | Event | Why |
      |---|---|
      | `payment_intent.succeeded` | the money arrived — marks the order paid |
      | `payment_intent.payment_failed` | records the failure and its reason |
      | `payment_intent.canceled` | the customer abandoned the payment |
      | `charge.refunded` | a refund was issued outside this app |
- [ ] **`Cors__AllowedOrigins`** set to the real frontend origins, and localhost
      removed.
- [ ] **SendGrid** enabled so customers get confirmations
      (`SendGrid__Enabled=true`), otherwise orders succeed silently with no email.
- [ ] **Verify a real order end to end** — place one, pay, confirm it reaches the
      admin dashboard.
- [ ] **Back up the database.** Neon's free tier does not include automated
      backups. Either upgrade before launch or schedule your own `pg_dump`.
- [ ] **Vercel Hobby is non-commercial.** A restaurant taking orders is
      commercial use. Move to Pro (~$20/mo) at launch, or host the frontends on
      Cloudflare Pages (free, commercial use permitted, unlimited bandwidth).

---

## When something breaks

| Symptom | Likely cause |
|---|---|
| Fly Doctor says "not listening on the expected port", but requests work | Usually a **false positive**. Check `fly logs` for `Trial machine stopping` — on Fly's free trial, machines are killed after 5 minutes regardless of `auto_stop_machines`. Add a credit card. Confirm the port is genuinely fine with `fly logs | grep "Now listening"` (it should say `http://[::]:8080` or `http://0.0.0.0:8080`, never `127.0.0.1`). |
| API deploy job fails: "Could not retrieve Project Settings" | `VERCEL_TOKEN` is team-scoped. Mint one from **personal** Account Settings, not Team Settings — the Vercel CLI needs a user identity, which a team-scoped token lacks. `vercel whoami` returning "User not found" is the tell. (No longer used by the pipeline, which only verifies via the REST API.) |
| Deploy job hangs instead of deploying | The CI gate polls the Actions API. A hang means the call returns nothing — check the job has `actions: read`. |
| API crash-loops on Fly | Check `/health/db` first: it names the concrete cause. A missing or malformed connection string is the usual one, and Neon's `postgresql://` URI form must be converted to Npgsql's key=value form. |
| Menu renders but is empty | `VITE_API_BASE_URL` missing `/api`, or CORS blocking |
| Every request 404s, UI still renders | `VITE_API_BASE_URL` is a bare origin |
| CORS error in the console | Origin not in `Cors__AllowedOrigins__N` on Fly, or a JSON array was used instead of the indexed form |
| API deploy fails at startup | Missing `Encryption__Key` — the API throws by design |
| `direct load of /menu/item/33` 404s | `vercel.json` rewrite missing in the deployed app |
| API returns 200 but no items | Run `./scripts/check-deployment-health.sh` — it distinguishes a dead database from an unseeded one |
| Changes to an env var do nothing | Vite inlined it at build time; redeploy |
| Orders succeed but no email | `SendGrid__Enabled=false` or the API key is unset |

---

## Cost

| Piece | Cost |
|---|---|
| Fly.io API (256 MB, always on) | ~$2-3/month |
| Neon Postgres (free tier) | $0 |
| Vercel customer app (Hobby) | $0 (non-commercial — see above) |
| Admin app | $0 (not deployed) |
| **Total** | **~$2-3/month** |

The cost that matters is not the hosting bill. A free tier that sleeps turns the
first order of the day into a 30-60 second hang, and a paused database turns
"we're quiet this week" into a restaurant that cannot take orders. The few
dollars above are what avoid both.
