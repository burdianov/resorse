# TESTING

What is tested, with what, and how to run it. The commands here are the ones the gate uses; the
operator runbook that assembles them into a gate is `claude_code_pack/OPERATOR_GUIDE.md` §Gates, and
the gate evidence ledger is [`IMPLEMENTATION_LOG.md`](IMPLEMENTATION_LOG.md).

## 1. The rule that shapes this document

**The agent runs focused, cheap checks and reports what it observed. The operator runs every
whole-suite and gate check.** (`DECISIONS.md` C14.) Nothing here is a claim that a command has been
run: every count below is attributed to the task that observed it, and is a recorded observation, not
a threshold. Run the command and read your own output.

A red gate item is never waived. It becomes a fix task, and the gate is re-run once that task lands.

## 2. The layers

| Layer | Command | Needs | Counts as |
|---|---|---|---|
| Backend unit, no database | `cd backend && uv run pytest -m "not integration"` | nothing | focused or gate |
| Backend integration, real PostgreSQL | `cd backend && uv run pytest -m integration` | `docker compose up -d --wait` | gate |
| Backend, both legs | `cd backend && uv run pytest` | the container | gate |
| Backend format | `cd backend && uv run ruff format --check .` | — | gate (focused run: name files) |
| Backend lint | `cd backend && uv run ruff check .` | — | gate (focused run: name files) |
| Backend types (strict) | `cd backend && uv run mypy` | — | gate (focused run: name files) |
| Backend coverage gate | `cd backend && uv run python -m scripts.coverage_gate` | the container | gate |
| Frontend unit and component | `cd frontend && pnpm exec vitest run` | — | focused or gate |
| Frontend coverage | `cd frontend && pnpm run coverage` | — | gate |
| Frontend lint / format | `cd frontend && pnpm run lint` / `pnpm run format:check` | — | gate (focused run: name paths) |
| Frontend types | `cd frontend && pnpm run typecheck` | — | focused or gate |
| Frontend build + dev-only check | `cd frontend && pnpm run build`, then search `dist/` | — | gate |
| OpenAPI contract drift | see §5 | — | gate |
| Browser workflow E2E | `cd frontend && pnpm exec playwright test` | PostgreSQL + Chromium | gate |
| Accessibility scans | `cd frontend && pnpm run test:a11y` | PostgreSQL + Chromium | gate |
| Visual baselines | `cd frontend && pnpm run test:visual` | PostgreSQL + Chromium | gate |
| Production stack boots | `docs/DEPLOYMENT.md` §4 | Docker | gate |

`cd frontend && pnpm exec vitest run` is the suite; `pnpm test` is the same thing in watch mode.

## 3. Backend tests

Tests live in `backend/tests/`, one file per subject (`test_auth_login.py`, `test_files_api.py`, …).
`backend/tests/conftest.py` owns the fixtures; the database-backed ones create and migrate a
dedicated **`app_test`** database on first use, so a test run never touches `app_dev`.

**The `integration` marker is mandatory and checked in both directions.** Any test that reaches the
database — directly or through a fixture — must carry `@pytest.mark.integration` (or be in a
module-level `pytestmark`); `backend/tests/test_markers.py` fails a database-backed test that lacks
it *and* a marked test that resolves no database fixture. The marker is registered in
`backend/pyproject.toml`:

```bash
uv run pytest -m "not integration"    # runs anywhere, no database
uv run pytest -m integration          # the PostgreSQL leg
uv run pytest                         # both legs
```

**Two files are checks rather than subject tests** (F063). `test_foundation_boundaries.py` scans
the trees that ship — and the config files that carry values — for a forbidden dependency, import or
artefact (no Next.js, no Redis) and for construction-domain vocabulary; it touches no database, so it
deliberately carries no `integration` marker. `test_extension_contract.py` mounts a **test-only**
module (`demo_records.py`) on an app the test builds — the shape `test_authorization.py`'s
`build_scratch_app` established — and asserts the guards, ownership isolation, and that an
unregistered permission code and an unregistered audit event are both refused; it reaches the
database, so the whole file is marked. Both exist to make a boundary executable; see
[`FOUNDATION_REPORT.md`](FOUNDATION_REPORT.md) §2–§3.

**The suite fails rather than skips when no database is configured.** With no `DATABASE_URL` /
`TEST_DATABASE_URL`, `conftest.py` calls `pytest.fail()` naming both legs — a suite that reported
every database test as skipped and still exited 0 is a green light with nothing behind it. The two
skips you may legitimately see are conditional and unrelated to the database: the opt-in live
Gotenberg conversion test (`RESORS_LIVE_GOTENBERG=1`) and, on a platform that does not grant
unprivileged symlink creation, the storage symlink test.

The three backend quality commands are configured so the bare form *is* the gate: `[tool.ruff]` and
`[tool.ruff.format]` exclude applied migrations from the **formatter** only (a revision applied in two
environments must stay byte-identical — `ruff check` still lints them), and `[tool.mypy] files = [...]`
covers `app`, `tests` and `scripts` together, so `uv run mypy` checks the test tree too.

### The coverage gate

`backend/scripts/coverage_gate.py` runs the suite under branch coverage and enforces **three** floors,
because coverage.py enforces one floor over one file set and BP-10.5 asks for "coverage ≥85% core with
critical auth/RBAC branches":

| Group | Files | Floor |
|---|---|---|
| `core` | `app/core/` + `app/services/` | **85** (BP's own number) |
| `auth_rbac` | the 13 security/permission/CSRF/rate-limit/auth/session/password/permission modules | **97**, measured on branches |
| `total` | everything under `app/` | **95** (a ratchet set at the F056 measurement) |

A group matching **no** module fails rather than scoring a vacuous 100. Floors may only go up;
`backend/tests/test_coverage_gate.py` asserts that none sits below BP's 85.

F056's recorded run of `uv run python -m scripts.coverage_gate`: exit 0 — `core` 96.72%, `auth_rbac`
97.34% branches, `total` 95.64%, **432 passed, 2 skipped**.

## 4. Frontend tests

Unit and component tests live in `frontend/tests/`, mirroring `src/` (`tests/admin/`, `tests/lib/`,
`tests/components/`, …). They run on Vitest with `@vitest/coverage-v8`.

```bash
pnpm exec vitest run tests/admin/users.test.tsx    # one file
pnpm run coverage                                  # the whole suite under coverage
```

Coverage thresholds live in `vite.config.ts` (`test.coverage`) and measure two different things:
`src/lib/**` at **85/85/85/85** (BP §10.5's requirement for the shared core) and a global **92 / 80 /
91 / 93** (statements / branches / functions / lines) — a ratchet set at the F055 measurement. The
exclusion list is by category (`src/lib/generated/`, `src/main.tsx`, `src/testing/`,
`src/components/ui/`, `*.d.ts`), never by convenience, so the number cannot be raised by narrowing the
set. **Never lower a threshold to turn a red run green.**

F055's recorded run: **563 passed across 67 files**, All files **92.65 / 80.49 / 91.14 / 93.71**,
`src/lib` **94.04 / 85.71 / 90.32 / 95.65**.

`tsconfig.json` includes `["src", "tests", "vite.config.ts"]`, so `pnpm run typecheck` checks the test
tree as well — and `pnpm run build` is `tsc --noEmit && vite build`, so a type error in a test fails
the production build too.

### The dev-only exclusion

The component lab must not exist in a production bundle. This is checked against the **built
artefact**, never inferred from the flag:

```bash
cd frontend && pnpm run build
# then search dist/ for a lab-only string, for "recharts", or for the route path.
# A match means the exclusion broke.
```

## 5. The OpenAPI contract

The API contract and the typed client are generated artefacts and must stay in step:

```bash
cd backend  && uv run python -m scripts.export_openapi    # writes backend/openapi.json
cd frontend && pnpm run api:types                         # writes src/lib/generated/
git diff --exit-code -- backend/openapi.json frontend/src/lib/generated
```

The diff must be empty apart from the task's own change. **Never hand-edit a generated file.**
`docs/OPENAPI_CLIENT.md` is the pipeline's own document.

## 6. The browser suites

Three Playwright spec files under `frontend/tests/e2e/`, in two projects
(`frontend/playwright.config.ts`):

| Spec | Command | Project |
|---|---|---|
| `workflow.spec.ts` — BP-10.4's eleven steps as one serial file | `pnpm exec playwright test` | `workflow` |
| `accessibility.spec.ts` — 14 axe scans over 9 screens | `pnpm run test:a11y` | `quality` |
| `visual.spec.ts` — 94 screenshot baselines | `pnpm run test:visual` | `quality` |

**Prerequisites, once and always:** `docker compose up -d --wait postgres` and
`cd frontend && pnpm exec playwright install chromium` (Chromium build 1248, matching
`@playwright/test` 1.64.0). Each invocation resets and migrates its own database (`app_e2e` — never
`app_dev`) and starts its own API on **8001**, dev server on **5174** and a `vite preview` of the real
`dist/` on **4174**, so it never touches a developer's 8000/5173 stack. It builds the frontend first,
so a run takes minutes before the first spec executes.

**`quality` depends on `workflow`**, so either quality command runs the workflow first: step 2 of the
workflow is the bootstrapped account's *first* sign-in, the one-time forced-change gate, and a scan
that consumed that gate would be photographing a state the app no longer produces. A broken workflow
therefore skips the scans rather than reporting green scans of a broken app.

**Determinism is the whole job of these suites.** The theme is applied after first paint (so
`settle()` ends transitions and animations and awaits `document.fonts.ready`); only timestamps are
masked; each state is arranged *through the app* rather than inherited from whatever the run did
earlier (a Playwright worker restarts after any failure and re-runs the suite's setup); and the inbox
is trimmed to the one notice the run itself caused. `docs/ARCHITECTURE.md` §5 and §12 carry the
detail, including the three failures that taught each of those rules.

**A visual difference is looked at, never re-pinned blind.** `maxDiffPixels: 0`, so one pixel fails
and the run writes actual/expected/diff images into `frontend/test-results/`. When a change to the
interface is intended: `pnpm run test:visual:update` writes the baselines, and the plain
`pnpm run test:visual` afterwards is the run that says they are stable. The baselines are
**platform-tagged** (`*-quality-win32.png`), which is why CI compares them on Windows (§7).

Recorded runs: workflow **11 passed** (F057, two consecutive runs); visual **105 passed** — 11
workflow steps plus 94 screenshots (F058); accessibility **25 passed** — 11 workflow steps plus 14
axe scans (F058).

## 7. Continuous integration

`.github/workflows/ci.yml` — one workflow, seven independent jobs, `contents: read` only, no pushes
and no deploys:

| Job | Runner | What it proves |
|---|---|---|
| `backend` | ubuntu | `ruff format --check`, `ruff check`, strict `mypy`, `coverage_gate` (both database legs, with a live Gotenberg), and a migration round trip on `app_test` |
| `frontend` | ubuntu | lint, `format:check`, typecheck, coverage, build, and the dev-only exclusion search of `dist/` |
| `api-contract` | ubuntu | regenerates `backend/openapi.json` and the typed client and fails on any diff |
| `e2e` | ubuntu | `pnpm run test:a11y` — the workflow steps and the 14 axe scans (Playwright, Linux) |
| `visual` | **windows-latest** | `pnpm run test:visual` |
| `audit` | ubuntu | `pnpm audit --prod --audit-level=high` and `pip-audit` over the production lock export |
| `images` | ubuntu | `docker compose config`, builds the API and edge images, and starts `postgres gotenberg migrate backend` with the migration job required to exit 0 |

The `visual` job runs on Windows because the committed baselines are `-win32`; on Linux every state
would fail as a new snapshot, and the suite is deliberately not rendered to a second platform. Its
PostgreSQL step uses the runner image's own install and is **unverified** (`DECISIONS.md` C49).

**No CI job has been observed running.** F061 checked the workflow with `actionlint` and confirmed the
YAML parses; it did not push a branch. Read the first real run's results from the Actions page rather
than assuming them.

## 8. Adding a test

- **Backend:** add `backend/tests/test_<subject>.py`. If the test reaches the database — directly or
  through a fixture — mark it `integration` (§3), or `test_markers.py` will fail. A new mutation's
  test should assert the audit event it writes.
- **Frontend:** add a test under `frontend/tests/<area>/`, mirroring the source path. Prefer the real
  router, the real query client and the real form kit; MSW is available (`msw` is a dev dependency)
  for the API boundary.
- **Browser:** extend `workflow.spec.ts` only if the step belongs to BP-10.4's sequence; otherwise add
  a state to `accessibility.spec.ts` or `visual.spec.ts`, arranging it through the app in
  `tests/e2e/support/`.
- **Never** relax a threshold, delete an assertion, or suppress an axe rule to make a run green. If a
  check is genuinely wrong, fix the check and say so in the commit.

## 9. What is not covered

Stated so nobody infers coverage that does not exist:

- **No load, performance or soak testing.** Nothing here measures throughput or behaviour under
  concurrency beyond a handful of targeted race tests.
- **`/ready` (BP-8.4b) is not covered end to end by this suite's own means.** `tests/test_readiness.py`
  (F065) covers the endpoint itself — the verdicts, the two optional halves, the real PostgreSQL — but
  what no test here can prove is the *ingress* half of "not public": that a deployed Caddy refuses
  `/api/v1/ready` is verified against `caddy:2.11.7-alpine` in F065's record, and a real deployment
  would re-verify it. `GET /api/v1/health` is liveness only.
- **Uploads are not scanned.** The malware-scan seam ships as a no-op; no test should be read as
  proving a file was scanned.
- **The migration round trip is manual or CI-only** and must run against `app_test`; it is never a
  local gate command against `app_dev`.
- **The production deployment path is unverified** beyond the `images` CI job and an agent run of the
  stack in a scratch environment — no real DNS name, certificate or load. See
  [`DEPLOYMENT.md`](DEPLOYMENT.md) §14.
