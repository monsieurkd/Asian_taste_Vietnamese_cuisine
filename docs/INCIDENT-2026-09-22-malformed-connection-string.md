# Incident — production cannot reach the database (2026-09-22)

**Status:** production API is up but its database connection is broken.
`/healthz` → 200, `/health/db` → **503**.

**Root cause:** the `ConnectionStrings__DefaultConnection` Fly secret contains
**embedded newline characters** that split the hostname in two. A long value was
pasted with line breaks that were stored literally. Not DNS, not IPv6, not the
password.

**Trigger:** the Neon password rotation (`fly secrets set …`, release v47,
2026-09-22 12:31). The rotation was performed correctly — the *new* value is
what got stored malformed, so the redeploy is what surfaced it.

## Symptom

```
GET https://asian-taste-api.fly.dev/health/db
503 {"status":"unhealthy","error":"Name or service not known"}
```

Application logs, repeating every 30s from
`OrderSyncBackgroundService`:

```
fail: AsianTaste.API.Services.OrderSyncBackgroundService[0]
      Error in order sync background service
   at System.Net.Dns.GetHostEntryOrAddressesCore(String hostName, ...)
   at System.Net.Dns.GetHostAddresses(String hostNameOrAddress, AddressFamily family)
   at Npgsql.Internal.NpgsqlConnector.Connect(NpgsqlTimeout timeout)
```

`"Name or service not known"` is a **DNS resolution failure**, not an auth
failure. A wrong password would report "password authentication failed". So the
new credential is not implicated.

## Root cause

**The connection string stored in the Fly secret contains embedded newline
characters that tear the hostname in half.** This is a copy/paste line-wrap
artifact from `fly secrets set`, not a DNS, IPv6 or credential problem.

Evidence — counting newline bytes inside the live secret value:

```
$ fly ssh console --app asian-taste-api -C "sh -c 'printenv ConnectionStrings__DefaultConnection | tr -cd \"\n\" | wc -c'"
3
```

Three literal newlines, where a clean value must have zero. Character count is
179 across 3 lines; the intended single-line value is 181 bytes on one line.

Split on those newlines, the stored value is:

```
Host=ep-muddy-dust-a7pesw5m-pooler.ap-southeast-   <- hostname cut here
2.aws.neon.tech; Database=neondb; Username=neondb_owner; Password=…; SSL Mode=VerifyFull;
Channel Binding=Require;
```

The hostname is torn between `ap-southeast-` and `2.aws.neon.tech`. .NET is
therefore asked to resolve a hostname containing newline characters and reports
exactly that: `"Name or service not known"`.

### Two corrections to earlier drafts of this document

I got this wrong twice before measuring it, and the wrong versions are worth
recording so the reasoning is not repeated:

1. **"IPv6-only DNS."** Wrong. Public DNS has A records
   (`54.153.234.207`, `54.206.85.193`), and the container resolves IPv4 fine
   when asked explicitly (`getent ahostsv4` → `54.206.85.193`).
2. **"The .NET managed resolver can't handle AAAA-only responses."** Wrong for
   the same reason — there are no AAAA-only responses here.

What misled me: `getent hosts <clean-hostname>` succeeded while the app failed,
which *looked* like a resolver discrepancy. It was not. The app was never
resolving the clean hostname — it was resolving a corrupted one, because that is
what the environment variable contains. **The lesson: measure the actual stored
value before theorising about the consumer.**

Also misleading: `fly ssh console -C printenv` renders the value wrapped across
lines at the terminal width, so corruption is invisible in normal output and
only shows up when you count bytes.

## Why now

The new password is longer or was pasted differently than the previous value, and
the **new** value is the one that got stored with embedded line breaks. The old
value (digest `63dfb71f0d934b62`) had presumably been set cleanly — so v46 was
connecting to a well-formed string, and the redeploy is what introduced the
malformed one.

This is why the timing is not suspicious: the rotation did not break DNS, it
replaced a clean value with a broken one. Nothing was latent and nothing is
Neon's fault.

## Fix

Re-set the secret as a **single line**. The previous attempt stored newlines
because a multi-line paste was preserved literally.

```bash
cd ~/Documents/job/Asian_taste_Vietnamese_cuisine

# Build the value on ONE line, with no manual line breaks anywhere in it.
# The whole string must be one continuous line — do not let your editor wrap it
# into multiple lines, and do not paste a wrapped version.
fly secrets set ConnectionStrings__DefaultConnection="Host=ep-muddy-dust-a7pesw5m-pooler.ap-southeast-2.aws.neon.tech; Database=neondb; Username=neondb_owner; Password=YOUR_NEW_PASSWORD; SSL Mode=VerifyFull; Channel Binding=Require;"
```

### Verify the fix worked before trusting it

```bash
# Must print 0. Any other number means newlines are still embedded.
fly ssh console --app asian-taste-api -C "sh -c 'printenv ConnectionStrings__DefaultConnection | tr -cd \"\n\" | wc -c'"

# Then the real test:
curl -s https://asian-taste-api.fly.dev/health/db
# expect: {"status":"healthy"}  with HTTP 200
```

### Why this happened, and how to avoid it next time

The value is ~181 characters — long enough that terminals, editors and chat
clients wrap it visually. If the *wrapped rendering* is what gets copied, the
line breaks come along as real characters.

Safer approaches for long secrets:

- **Avoid pasting long values into a chat or editor that wraps.** Build them in a
  file you control, then reference the file.
- Or set the secret from a file so no interactive paste is involved:
  ```bash
  printf '%s' "Host=...; Password=...; ..." > /tmp/conn.txt   # %s, not echo — echo adds a newline
  fly secrets set ConnectionStrings__DefaultConnection="$(cat /tmp/conn.txt)"
  rm /tmp/conn.txt
  ```
- Or set it in the **Fly dashboard UI**, which uses a real text field with no
  wrapping semantics.

### Note for the repo's own tooling

`.secrets.local.example` documents converting Neon's URI form into the Npgsql
`Host=…;` form. This incident is a good argument for a helper that builds and
sets that value programmatically rather than by hand, since the string is long
enough to be wrapped by accident.

## Follow-up worth doing

Once production is healthy, add a check that would have caught this immediately:
a startup assertion that the configured connection string contains no control
characters or newlines. `Program.cs` already validates configuration for the
payment gateway, so there is precedent for failing early on a malformed value —
and a silent fallback here meant the app reported 503 with a misleading
"DNS" message instead of saying "your connection string is malformed".

## Immediate triage for the operator

```bash
# 1. Confirm the failure is a malformed host, not credentials — the error text
#    "Name or service not known" means the hostname could not be resolved at all.
curl -s https://asian-taste-api.fly.dev/health/db

# 2. THE DEFINITIVE CHECK — count newline bytes in the stored secret.
#    Must print 0. Anything else is the bug.
fly ssh console --app asian-taste-api -C "sh -c 'printenv ConnectionStrings__DefaultConnection | tr -cd \"\n\" | wc -c'"

# 3. Confirm the NEW password is valid — connect from your machine with psql
#    using the clean, single-line hostname. If this succeeds, the password
#    rotation was correct and the only problem is the stored secret's formatting.
psql "postgresql://neondb_owner:<NEW_PASSWORD>@ep-muddy-dust-a7pesw5m-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require" -c 'select 1;'
```

If the `psql` test succeeds and check 2 prints a non-zero number, the diagnosis is
confirmed: **good password, malformed stored value.**

**Do not rotate the password again** — it is not the cause, and repeated
rotations will not change the outcome.

## Note

The API is intentionally designed not to crash on a DB failure
(`Program.cs` logs and starts anyway, to avoid a restart loop). That design is
working as intended here — which is also why this is silent apart from the 503
and the repeating background-service error. Worth remembering: the app staying
up does not mean the database is reachable.
