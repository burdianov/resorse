# DEPLOYMENT

How to run this application on a Linux server. The development setup lives in
[`README.md`](../README.md); backup and restore in [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md);
the security model in [`SECURITY.md`](SECURITY.md).

Everything below is a documented procedure, not a record of a run: the "What has been verified"
section at the end states exactly what was executed and what was not.

## 1. What this deploys

`docker-compose.prod.yml` (Compose project `resors-prod`) is the whole production system. It is
deliberately separate from the development `docker-compose.yml`, and it has **no defaults** — a
missing value stops Compose before any container starts.

| Service | Image / build | Published | Role |
|---|---|---|---|
| `web` | `deploy/web/Dockerfile` (Node builds the SPA → `caddy:2.11.7-alpine`) | **80, 443** | The only public service. Serves `frontend/dist` and reverse-proxies `/api/*` to the API |
| `backend` | `backend/Dockerfile` | — | The API (`uvicorn`), non-root (uid 10001), writes only to the uploads volume |
| `migrate` | `backend/Dockerfile` | — | One-shot `alembic upgrade head`; `backend` waits for it to exit 0 |
| `postgres` | `postgres:18.6-alpine` | — | The database; data on the `postgres_data` volume |
| `gotenberg` | `gotenberg/gotenberg:8.37` | — | Word → PDF conversion (DOCX reports only) |

**Networks.** `edge` faces the internet and holds Caddy alone (it needs outbound access for
certificate issuance). `internal` is `internal: true` — no route to the internet — and holds
PostgreSQL, Gotenberg, the migration job and the API. No internal service publishes a port.

**Volumes.** `postgres_data` (database), `uploads` (private file objects, mounted at
`/var/lib/resors/uploads`), `caddy_data` + `caddy_config` (certificates and ACME state). Everything
that must survive a redeploy lives on one of these; the containers themselves are disposable.

**Same origin by construction.** Caddy serves the SPA and proxies `/api/*` to the API, so the browser
sees one origin and there is no CORS. `ALLOWED_ORIGINS` is therefore exactly
`https://$SITE_ADDRESS`, and it is also the CSRF origin allow-list (`docs/SECURITY.md` §3.2).

## 2. Host prerequisites

- A Linux VPS (Hetzner-compatible) with Docker Engine and the Compose plugin.
- A DNS name that resolves to the host, with **ports 80 and 443 reachable from the internet** —
  Caddy obtains and renews the TLS certificate itself over ACME, which requires both.
- Enough disk for PostgreSQL, the uploads volume and the images. No sizing figure is given here
  because none was measured; the stack is a single API process plus PostgreSQL, and this is a
  deployment fact you should confirm against your own data, not a number to copy from a document.
- An operator who will hold `.env.production` and the backup encryption key. Nothing in this
  repository contains either.

## 3. Configuration

Create `.env.production` from the template, on the server, and replace every value:

```bash
cp .env.production.example .env.production
```

| Variable | Meaning | Rule |
|---|---|---|
| `SITE_ADDRESS` | The public name Caddy serves and certifies (e.g. `resors.example.com`) | Required; must resolve to this host |
| `POSTGRES_USER` | Database role | Required |
| `POSTGRES_PASSWORD` | Database password, URL-safe (hex is simplest: `openssl rand -hex 32`) | Required. The API **refuses to start** if it is a placeholder, a well-known default (`app`, `postgres`, `password`, `secret`, `resors`), or shorter than 16 characters |
| `POSTGRES_DB` | Database name | Required |

`.env.production` is git-ignored and must never be committed. No secret is baked into an image: the
web image builds from the repository root, and the root `.dockerignore` excludes `.env`, `.env.*` and
`LOCAL_CREDENTIALS.md` by name as well as by git.

**The production refusal (F060).** At startup the API validates its configuration and refuses to
serve, naming each problem, when it finds any of: a missing or placeholder `DATABASE_URL` password, a
password shorter than 16 characters, an `ALLOWED_ORIGINS` that is not set explicitly, not `https://`,
or a loopback address, or a `STORAGE_ROOT` / `GOTENBERG_URL` left unset or pointing at localhost. The
messages name the setting and the rule and never echo a value. `docs/SECURITY.md` §4.1 has the full
list.

## 4. First deploy

```bash
# 1. Configuration for the server (section 3).
cp .env.production.example .env.production    # then edit it

# 2. Build and start everything; --wait blocks until healthchecks pass.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait

# 3. Confirm the migration job finished cleanly (it runs once and stays stopped).
docker compose -f docker-compose.prod.yml --env-file .env.production ps -a
```

The `migrate` service runs `alembic upgrade head` before the API starts; `backend` waits for it to
exit 0. The API then reaches `https://$SITE_ADDRESS`.

## 5. Bootstrap the first account

There is no default credential and no seeded password. Exactly one super-admin is created by a
one-time command that refuses to run once an active super-admin exists:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  backend python -m app.bootstrap_admin --generate-password
```

The generated password is printed **exactly once** — record it in the git-ignored
`LOCAL_CREDENTIALS.md` immediately, then change it at first sign-in (the account is created with
`must_change_password`, so the forced-change gate applies before anything else is reachable).
Alternatively, set `BOOTSTRAP_ADMIN_PASSWORD` for that single command (never in `.env.production`,
which is long-lived). Every account after this one is created in **Administration → Users**.

## 6. Verify the deployment

```bash
curl -s https://$SITE_ADDRESS/api/v1/health
# {"status":"ok","name":...,"version":...,"environment":"production"}
```

Then sign in at `https://$SITE_ADDRESS/login` with the bootstrapped account, change the password when
prompted, and confirm the sidebar renders — an account with no administrative role sees the Overview
group only; that is the permission filter, not a fault.

## 7. Migrations in production

- Migrations are **explicit**: the `migrate` service runs them once per deployment, and nothing in the
  application ever migrates at startup.
- To run them by hand (for example after a `git pull` on a host you deploy manually):

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate
  docker compose -f docker-compose.prod.yml --env-file .env.production exec backend \
    python -m alembic current        # expect "<head revision> (head)"
  ```

- **Never** run `alembic downgrade base` against the production database — the downgrade drops every
  table it touches. The round trip belongs to a scratch database (`app_test`) only.
- Adding a revision is a development step (see `docs/ADDING_A_MODULE.md`); the deployed image always
  carries the whole `migrations/` tree.

## 8. Updating a deployment

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
```

Compose rebuilds the changed images, runs `migrate`, and recreates `backend` and `web`. The database,
uploads and certificate volumes are untouched.

## 9. Rollback

Two things can be rolled back, and they are different operations:

- **The application image.** Check out the previous commit and re-run the `up -d --build` command
  above. This is safe when the previous release's schema is still current.
- **The schema.** Prefer the forward direction: land a new revision that reverses the change
  (expand → migrate → contract, `docs/ARCHITECTURE.md` §9). The deployed image carries the
  `migrations/` tree, so a revision can be applied by hand with `run --rm migrate` after checking
  out the tree that contains it — but a downgrade that drops a column is a data-loss operation, so
  it is the last resort and is never automatic here.

There is no blue/green or canary machinery. A rollback is a redeploy, and the caveats in section 13
apply to it.

## 10. Logs and diagnostics

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production stats
```

The API writes **one JSON object per line** with scalar fields only; the access line carries the
path, the status, the duration and the request id, and never the query string. Uvicorn's own
plain-text access log is switched off (`--no-access-log`) so there is one line per request, not two.
An unhandled error is answered as a JSON 500 carrying the request id and no exception text; the
traceback goes to the log. `X-Request-Id` is echoed on every response and can be used to correlate a
report with a log line.

## 11. Health and readiness

- **Liveness** is `GET /api/v1/health` — what the container healthcheck calls. It reports that the
  process is up and serving, which is all it can observe, and it stays the healthcheck's question on
  purpose (F065): a healthcheck that probed the database would restart the API to fix a database.
- **Readiness** is `GET /api/v1/ready` (F065, BP-8.4b) — "should this process receive traffic", as one
  answer per dependency: `postgresql` (a `SELECT 1`; down → **503 `not_ready`**, since no route can
  serve without it) and the two halves of a report — `gotenberg` (`conversion.health()`) and
  `pdf-engine` (`reports.self_test()`) — where down is **200 `degraded`**, not a failure (only DOCX
  needs the converter). Never treat `/api/v1/health` as a database probe.
- **`/ready` is not public, and the edge is what makes that true.** BP-8.3 lists it as
  "[protected appropriately at ingress]": the route carries **no session**, because its callers — the
  container, a monitor on the box, the operator — cannot hold a cookie, so `deploy/Caddyfile` refuses
  the path for everyone outside. It answers **404 in the API's own `{"detail": …}` shape** rather than
  403, so an external caller does not even learn that the path exists. Call it from inside the stack
  (`docker compose -f docker-compose.prod.yml exec backend python -c "import urllib.request;
  print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/ready').read().decode())"` — the same
  one-liner the healthcheck uses); through the edge it is a 404. Verified against the pinned Caddy,
  `caddy:2.11.7-alpine`, in F065.
- `GET /api/v1/reports/engine-health` (`reports.generate`) answers a **different** question, for a
  signed-in administrator: the PDF engine and the converter as a capability report, and it deliberately
  does not probe PostgreSQL either.
- The API's own Swagger UI at the root (`/docs`) and `/openapi.json` are **not reachable through the
  edge**: Caddy routes only `/api/*` to the API and sends every other path to the SPA. The committed
  `backend/openapi.json` is the contract artefact; regenerate it in development with
  `uv run python -m scripts.export_openapi`.

## 12. Operational facts worth knowing

- **Proxy trust.** Caddy overwrites `X-Forwarded-For` with the peer it actually sees, and the API
  honours the header only from the proxy's fixed internal address (`FORWARDED_ALLOW_IPS:
  172.31.250.10`, matching the `internal` network's subnet in the Compose file). The login and
  password throttles key on that address, so **if you change the `internal` subnet you must change
  this value too** — otherwise every client shares one throttle bucket.
- **One throttle address.** Because all traffic arrives through one proxy from one host, the
  per-address login throttle is shared by every user. It is per-account as well
  (`docs/SECURITY.md` §3.1), and a successful login clears the account bucket but deliberately not
  the address bucket. A large office behind one NAT is the case to watch.
- **Uploads are private and unscanned.** Caddy's `request_body` cap (16 MB) sits above the API's
  per-file cap so the API's refusal is the one a user reads. Nothing scans uploads: the malware-scan
  seam ships as a no-op (`get_malware_scanner()`), so uploads are not scanned and must not be
  described as scanned.
- **No scheduler exists.** There is no background worker and no cron in this stack, so nothing sweeps
  unreferenced upload objects or expired rows on its own. Any periodic job is the operator's to
  arrange.
- **Certificates** live in the `caddy_data` volume. Losing it re-issues them, which can hit the
  issuer's rate limits — back it up (section 3 of `BACKUP_RESTORE.md`).

## 13. No-downtime caveats

This is a single-host Compose deployment with one API process. Be explicit with stakeholders:

- `up -d --build` **recreates** the `backend` and `web` containers, so their requests are dropped for
  the seconds that takes. There is no rolling update and no second replica to absorb the gap.
- The `migrate` job runs **before** the new API starts, and it runs against the live database. A
  migration that rewrites a large table will hold the API's start until it finishes, and long locks
  on hot tables are visible to users.
- A schema change is therefore **not** zero-downtime by default. Expand → migrate → contract across
  two releases is what makes a column addition and its backfill safe to deploy while the old code is
  still running.
- Sessions live in PostgreSQL and the SPA is served from a container, so a browser session survives a
  redeploy; a user mid-request during the recreate does not.

## 14. What has been verified, and what has not

**Verified (agent record).** `.env.production.example` documents every required value; Compose
configuration for `docker-compose.prod.yml` was validated with `docker compose config`; and an agent
run of the stack in a scratch environment reached healthy services with the `migrate` job exiting 0
(F059's record). The production startup refusal, the security headers and the logging shape are
covered by `backend/tests/test_production_hardening.py` (F060).

**Not verified.** No deployment has been made to a real VPS against a real DNS name. Certificate
issuance over ACME, the HTTPS path end to end, behaviour under load, and the sizing figures remain
**untested** — the F059 run used a local address and a scratch environment. The CI `images` job
builds and starts the stack, but no CI job has been observed running (see `docs/TESTING.md` §7).
Treat the first real deployment as the test of these steps, and record what it showed.
