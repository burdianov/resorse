# Security — threat model and controls

This is the threat model and the control register for the platform as it stands
after F060 (BP-14.5, BP-6.4). It states what each control protects against, where
it is enforced, and what is **not** covered. A control named here is in the code
and under test; a residual risk is named as one. Decisions behind the controls
are the `DECISIONS.md` rows cited in brackets.

## 1. Scope and assets

- **Assets:** user accounts and their credentials; sessions; role and permission
  grants; the audit trail; uploaded and generated files; notifications and
  preferences; application settings.
- **Entry points:** the SPA and `/api/v1` through Caddy (the only published port);
  the bootstrap and seed CLIs (run by an operator on the server); the environment
  (`.env.production`).
- **Out of scope for this stack:** the host operating system, the Docker daemon,
  the hosting provider's network, backups, and the operator's own machine.

## 2. Trust boundaries

```
Internet ──► Caddy (edge: TLS, headers, body cap, X-Forwarded-For set)
              ├── static SPA files
              └── /api/* ──► API (uid 10001) ──► PostgreSQL
                              └──────────────► Gotenberg (DOCX → PDF)
              internal network: no internet route; no published port except Caddy's
```

Everything arriving from the internet is untrusted, including `Origin`,
`Referer`, `X-Forwarded-For`, `X-Request-Id` and every upload's bytes and declared
type. The API trusts the proxy's address only (section 4.7).

## 3. Threats and controls

### 3.1 Credentials and login

| Threat | Control | Where |
|---|---|---|
| Account enumeration by login response | One uniform 401 for every credential failure; an unknown email still pays one Argon2 verification against a decoy hash [C17] | `app/services/auth.py`, `app/core/security.py` |
| Online password guessing | Per-account and per-address fixed-window buckets, counted before the lookup, committed on failure; 429 with `Retry-After` [C17, F026] | `app/core/rate_limit.py`, `app/models/rate_limit.py` |
| Throttle bypass by header spoofing | The throttle address is the transport peer, with `X-Forwarded-For` honoured **only** from the web proxy's fixed address (section 4.7) [F060] | `FORWARDED_ALLOW_IPS` in `docker-compose.prod.yml` |
| Weak passwords | Policy: length bounds, a denylist, the user's own email refused; checked on every set path [C15, C19] | `app/core/security.py` (`password_policy_violations`) |
| Credentials in transit or at rest | HTTPS at the edge with HSTS; Argon2id hashes only; no password in any log, audit row or response except the one-time generated temporary shown to the admin [C15, C22, C32] | Caddyfile; `app/core/security.py`; `app/core/logs.py` |
| Default or placeholder credentials in production | The API refuses to start with a placeholder, well-known or short database password [F060] | `app/core/startup.py` |
| Stolen session replay after rotation | Rotated-session replay revokes the whole family and refuses on every endpoint [C18] | `app/services/sessions.py` |

### 3.2 Sessions and CSRF

| Threat | Control | Where |
|---|---|---|
| Session token theft through JavaScript | Opaque random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie with the `__Host-` prefix; the row stores only a hash [C12] | `app/core/cookies.py`, `app/core/security.py` (`generate_session_token`, `hash_session_token`) |
| Long-lived sessions | Idle timeout (12 h, sliding) and an absolute lifetime (30 d, fixed); both are settings [C18] | `app/services/sessions.py` |
| Session outliving a password change or admin reset | Password change revokes every other session and rotates the caller's; admin reset revokes all of the target's [C19] | `app/services/passwords.py` |
| Cross-site request forgery | Three layers: `SameSite=Lax`; `Origin`/`Referer` must reduce to a configured origin; a double-submit `X-CSRF-Token` when a session cookie is present. Login is exempt from the double-submit only, and its origin check still applies [C18] | `app/core/csrf.py` |
| Origin allow-list left at the development default | Production refuses an unset, non-https or loopback origin list [F060] | `app/core/startup.py` |

### 3.3 Authorization

| Threat | Control | Where |
|---|---|---|
| Missing check on a new endpoint | `CsrfMiddleware` and the session gate apply to every route; `current_session` is the default dependency, and an exemption must be typed on purpose [C20] | `app/api/v1/dependencies.py` |
| Privilege escalation through role edits | A grant must be a subset of the caller's own effective permissions; superusers are managed only by superusers; the last active super-admin is protected [C22, C24] | `app/services/users.py`, `app/services/roles.py` |
| Cross-user data access | Every user-scoped query filters on the session's user id in SQL; foreign ids answer 404 [C30, C34] | service layer |
| Forced password change bypassed | Every route except the auth exemption list returns 403 while `must_change_password` is set [C20] | `app/api/v1/dependencies.py` |

### 3.4 Uploads and files

| Threat | Control | Where |
|---|---|---|
| Oversized request exhausting memory | Byte cap applied while reading (`limit + 1`), and a proxy body cap of 16 MB above the API's 10 MiB per-file cap [F049, F059] | `app/api/v1/files.py`; `deploy/Caddyfile` |
| Disguised file (declared type lies) | Allowlist checked by magic bytes; the declared type can only refine within a sniffed family; nothing is trusted by name [F049] | `app/services/storage.py` |
| Path traversal in stored names | Objects are addressed by UUID key; filenames are sanitised and never used as paths [F049] | `app/services/storage.py` |
| Malware in an uploaded file | **Not scanned.** The scan hook exists (`MalwareScanner`) and the route uses `get_malware_scanner()`, which returns `NoMalwareScanner`, the no-op. A refusal from a future scanner is a 400 and leaves no object [F060] | `app/services/storage.py`, `app/api/v1/files.py` |
| Public exposure of stored files | The upload directory is never served; downloads go through the API with authorization [F049] | `app/services/storage.py` |

**Residual risk:** until a scanning engine is chosen and wired, every stored upload
is type- and size-checked but not malware-checked. The UI and reports must not
describe an upload as scanned.

### 3.5 Browser-facing headers (the edge)

Caddy sends, on every response (`deploy/Caddyfile`):

- **Content-Security-Policy:** `default-src 'self'`; `script-src 'self'` (no inline
  script — the anti-flash theme script is `public/theme-init.js`); `style-src 'self'
  'unsafe-inline'` (the component library positions popovers with style attributes;
  a residual, not a choice of convenience); `img-src 'self' blob: data:` (object URLs
  for file previews); `worker-src 'self' blob:` (the PDF viewer); `connect-src 'self'`;
  `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'self'`.
- **Strict-Transport-Security:** `max-age=31536000` (no `includeSubDomains`, no preload).
- **X-Content-Type-Options:** `nosniff`. **X-Frame-Options:** `DENY`.
- **Referrer-Policy:** `no-referrer`. **Permissions-Policy:** camera, microphone,
  geolocation, payment and USB disabled.
- The `Server` header is removed.

The API adds its own floor to each response (`app/core/security_headers.py`):
`nosniff`, `DENY`, a `default-src 'none'` CSP, `no-referrer`, `same-origin` resource
policy, and `Cache-Control: no-store`, unless a route sets its own value. Behind Caddy, the edge's value for a header both set wins (Caddy `header` replaces it), so in production the browser sees the edge's CSP; the API's floor applies to a direct connection. `Cache-Control` is not set at the edge, so the API's `no-store` reaches the browser.

### 3.6 Logging and errors

| Threat | Control | Where |
|---|---|---|
| Secrets or personal data in logs | Structured JSON lines carry scalars only; request bodies, headers, query strings, form fields and the database URL are never logged; the access line has the path only [F060] | `app/core/logs.py`, `app/core/request_context.py` |
| Exception text reaching a client | An unhandled error is a JSON 500 with the generic detail and the request id; the traceback goes to the log only [F060] | `app/core/request_context.py` |
| Log and audit lines that cannot be joined | One request id per request: echoed in `X-Request-Id`, carried by audit rows, written on every log line [C32, F060] | `app/core/request_context.py` |
| Hostile request id poisoning logs | A client-supplied id is accepted only if `[A-Za-z0-9._-]{1,64}`; otherwise replaced [C32] | `app/core/request_context.py` |
| Silent credential edits | Audit rows are append-only and redact credential-shaped keys at the door [C32] | `app/services/audit.py` |

### 3.7 Secrets and configuration

- Secrets are never in an image, a commit or the frontend bundle (`.dockerignore`,
  `.gitignore`, and the `VITE_*` rule in BP-9.3). The production compose file has no
  defaults for any secret: a missing value stops Compose [F059].
- `.env.production` is created on the server from `.env.production.example` and is
  git-ignored. The bootstrap password is passed only to the one-time CLI and is not
  stored in the production file [C15, F059].
- Production start-up refuses placeholder, weak, default or unset values
  (`app/core/startup.py`): the database password, the origin list, the uploads
  root and the converter address must be explicit.

### 3.8 Denial of service

| Threat | Control |
|---|---|
| Login flooding | Database-backed buckets (section 3.1) |
| Large uploads and conversions | Upload byte cap; a 16 MB proxy cap; a bounded converter response; a conversion timeout that reports "unavailable" [F052] |
| Database connection exhaustion | Pooled engine, disposed on shutdown [F023] |

**Residual risk:** there is no request-rate limit for the general API. A flood of
authenticated requests is bounded only by the host.

### 3.9 The readiness endpoint

`GET /api/v1/ready` (F065) reports whether each dependency — PostgreSQL, the
converter, the report engine — is answering, which means it describes this
deployment's own configuration; it is a diagnosis rather than a control. Two
things keep it where it belongs. It carries **no session**: its callers are the
container, a monitor on the box and the operator, and none of them can hold a
cookie, so demanding a permission would mean no probe could ever run. And it is
**refused at the edge**: `deploy/Caddyfile` answers 404 for the path before the
proxy rule sees it, so the internet cannot reach it at all, and the API is never
published on its own (section 2). The body is a boolean per dependency — no
address, no version, no error text — the same rule `reports/engine-health`
follows [C41].

## 4. Operating the controls

### 4.1 The uniform production refusal

`create_app()` calls `assert_production_ready(settings)` before anything else. It
lists every problem at once and names the setting and the rule, never the value.

### 4.2 Headers

The edge policy is in `deploy/Caddyfile`. A change to it is a change to what the
browser may run, so it is reviewed with the SPA build (`pnpm run build` produces the
bundle the policy is written for). After a deploy, check on the live host:
`curl -sI https://<SITE_ADDRESS>/` shows the policy above.

### 4.3 Logs

Each line is one JSON object on stdout. The operator reads them with
`docker compose -f docker-compose.prod.yml logs backend`. Uvicorn's plain access
log is switched off in the image (`--no-access-log`), so there is one format.

### 4.4 Uploads

Every type on the allowlist has a magic-byte check. Removing a type is a
configuration change (`STORAGE_ALLOWED_CONTENT_TYPES`); adding one needs a sniffer.

### 4.5 Sessions

Sign-out everywhere revokes every session of the user (`logout_all`). Changing a
user's roles does not revoke sessions: the new grant applies on the next request
[C24].

### 4.6 Passwords

Temporary passwords are generated under the policy and shown once. An admin reset
forces a change on the next sign-in.

### 4.7 Proxy trust

The API reads `X-Forwarded-For` only from the address given in `FORWARDED_ALLOW_IPS`
(uvicorn's own setting). The production compose file gives the web proxy a fixed
address, `172.31.250.10`, on the `internal` network and sets that address as the only
trusted one. Caddy overwrites the header with the peer it sees, so a client's own
header never reaches the API as a trusted value.

A development run (`uvicorn` on the host) trusts forwarded headers only from loopback, which is uvicorn's own default.

## 5. Residual risks and open items

| Item | Status | Owner |
|---|---|---|
| Uploads are not malware-scanned | Hook in place, no engine | Operator decision (choice of engine) |
| `style-src 'unsafe-inline'` in the CSP | Accepted; removing it needs the component library to stop writing style attributes | Frontend follow-up |
| No general API rate limit | Login only | Not planned for this stage |
| A one-time bootstrap password passes through the shell history if typed on the command line | Use `--generate-password` or the interactive prompt | Operator practice |
| Orphan file objects after a process dies between commit and cleanup | Recorded in the handoff; cleanup runs only after commit | Unowned — needs a task |
| The CSRF `Origin` check accepts a request with no `Origin` and no `Referer` (scripted clients) | Covered by the session double-submit when a session cookie is present | Accepted by design [C18] |
