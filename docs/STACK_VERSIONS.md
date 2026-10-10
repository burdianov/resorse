# STACK VERSIONS — task F003

Verified 2026-10-08 against the official npm registry, PyPI and Docker Hub. Every number below was queried,
not copied: `BIG-PROMPT.txt` §2.4 gives "as-of audit examples" and explicitly warns they are not
implementation-time guarantees, so each was re-derived (results compared in §8).

**Status of this document:** these are the versions chosen for implementation with the evidence behind them.
They become *pinned* when F006 (`package.json` + `pnpm-lock.yaml`) and F007 (`pyproject.toml` + `uv.lock`)
create the manifests. Nothing here has been built, installed or run as an application yet.

## 1. Verified local environment

| Tool | Installed | Latest available | Note |
|---|---|---|---|
| Node | **v24.14.0** | v24.21.0 LTS "Krypton" (2026-09-07); v26.11.1 is current, non-LTS | 7 patches behind the LTS line — see §5 |
| npm | 11.19.0 | bundled | not used (see §7) |
| pnpm | **12.9.1** | 12.10.1 (2026-10-06) | satisfies `DECISIONS.md` C11 |
| uv | present (`~/.uv/uv`) | — | backend resolver/runner/lockfile |
| Python | 3.14.0 + 3.14.3 + 3.13.5 + 3.12.x | **3.14.6** stable; 3.15.0b2 is **beta** | pin 3.14 — see §5 |
| git | 2.49.0.windows.1 | — | |
| Docker | not verified | — | F008/F059 own it |

## 2. Frontend — runtime dependencies

| Package | Version | Released | Binding constraint (from the manifest) |
|---|---|---|---|
| `react` | **19.3.0** | 2026-09-09 | |
| `react-dom` | **19.3.0** | 2026-09-09 | peer `react ^19.3.0` |
| `react-router` | **8.4.0** | 2026-09-15 | engines `node >=22.22.0`; peer `react >=19.2.7` |
| `@tanstack/react-query` | **5.104.1** | 2026-10-02 | peer `react ^18 \|\| ^19` |
| `@tanstack/react-table` | **9.2.6** | 2026-10-04 | engines `node >=20`; peer `react >=18` |
| `@tanstack/react-virtual` | **3.14.13** | 2026-09-14 | peer `react ^19` |
| `axios` | **1.20.0** | 2026-08-26 | |
| `react-hook-form` | **7.89.0** | 2026-09-26 | peer `react ^19` |
| `@hookform/resolvers` | **5.9.1** | 2026-08-17 | |
| `zod` | **4.6.5** | 2026-09-13 | |
| `date-fns` | **4.4.0** | 2026-05-29 | |
| `react-day-picker` | **10.0.2** | 2026-09-30 | peer `react >=16.8` |
| `cmdk` | **1.1.1** | 2025-03-14 | peer `react ^19` |
| `sonner` | **2.0.8** | 2026-08-09 | peer `react ^19` |
| `recharts` | **3.10.1** | 2026-07-25 | peer `react ^19`. In use from **F054** (`components/charts/*`), and only there: the charts are drawn by the developer-only component lab, so the library is absent from a production `dist/` — a fact checked by building and searching the output, not assumed (F054's C42). |
| `lucide-react` | **1.53.0** | 2026-10-08 | peer `react ^19` |
| `class-variance-authority` | **0.7.1** | 2024-11-26 | |
| `clsx` | **2.1.1** | 2024-04-23 | |
| `tailwind-merge` | **3.7.0** | 2026-09-12 | |
| `@base-ui/react` | **1.8.0** | 2026-09-04 | peer `react ^19` — backs shadcn `base-nova`. In use from F011. |
| ~~`cn`~~ | 0.4.0 | 2026-09-22 | **not used.** The `base-nova` registry items import `cn` from this package (an official shadcn class-merging helper, zero deps); §2.1 names `clsx` + `tailwind-merge` instead, and the reference carries `lib/utils.ts`, so F011 writes its own `cn` there and rewrites the generated imports. Every `shadcn add` therefore needs that one-line remap — see `ARCHITECTURE.md` §5. |
| `@dnd-kit/core` | **6.3.1** | 2024-12-05 | peer `react >=16.8` |
| `@dnd-kit/sortable` | **10.0.0** | 2024-12-04 | |
| `@dnd-kit/utilities` | **3.2.2** | 2023-11-06 | |
| `react-pdf` | **11.0.0** | 2026-09-10 | peer `react ^19`. In use from **F053** (`components/common/pdf-preview-dialog.tsx`), and loaded lazily: the chunk is imported only after a successful export. |
| `pdfjs-dist` | **6.3.289** | 2026-08-29 | peer — a **direct** dependency from F053 even though `react-pdf` depends on it: pnpm's strict `node_modules` hides the worker file (`pdfjs-dist/build/pdf.worker.min.mjs`) from a bare-specifier resolution, and the pin must agree with the range `react-pdf` resolves. |
| ~~`next-themes`~~ | 0.4.6 | 2025-03-11 | **not used** — §2.1 permits it only if verified in a Vite SPA; F010 wrote an equivalent provider instead and documented the exception (`ARCHITECTURE.md` §5). It has zero dependencies, so this removes rather than adds a dependency. |
| `tw-animate-css` | **1.4.0** | 2025-09-24 | |

## 3. Frontend — build, lint and test tooling

| Package | Version | Released | Binding constraint |
|---|---|---|---|
| `vite` | **8.3.4** | 2026-10-08 | engines `node ^20.19.0 \|\| >=22.12.0` |
| `@vitejs/plugin-react` | **6.1.2** | 2026-10-05 | peer `vite ^8.0.0` |
| `typescript` | **6.0.3** | 2026-04-16 | **pinned below latest — §5** |
| `tailwindcss` | **4.3.3** | 2026-07-16 | |
| `@tailwindcss/vite` | **4.3.3** | 2026-07-16 | peer `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` |
| `shadcn` (CLI) | **4.21.4** | 2026-10-07 | engines `node >=20.18.1`. Run with `pnpm dlx shadcn@4.21.4` — deliberately **not** a project dependency, so the CLI never ships in the bundle or the lockfile's runtime set. |
| `eslint` | **10.12.0** | 2026-10-02 | engines `node ^20.19.0 \|\| ^22.13.0 \|\| >=24`. In use from **F055** — flat config, `frontend/eslint.config.mjs`. |
| `@eslint/js` | **10.0.1** | 2026-02-06 | **New in F055.** ESLint 10 no longer depends on it, so `js.configs.recommended` is not importable unless it is installed here — a direct devDependency, not a transitive one. It is the upstream defaults package, published on its own cadence and **newest at 10.0.1** while `eslint` itself is at 10.12.0: the two version lines are independent, so this row is not stale just because it lags. |
| `typescript-eslint` | **8.71.1** | 2026-10-05 | peer `eslint ^8.57 \|\| ^9 \|\| ^10`; **peer `typescript >=4.8.4 <6.1.0`** — the reason for the TypeScript pin (§5). In use from **F055** (config only: the linter is deliberately **not** type-aware, see §6). |
| `eslint-plugin-react-hooks` | **7.1.1** | 2026-04-17 | In use from **F055**. The flat-config half is `configs.flat['recommended-latest']`; the unprefixed `configs.recommended*` entries are eslintrc-shaped (`plugins: ["react-hooks"]`) and flat config rejects them at load. |
| `eslint-plugin-react-refresh` | **0.5.7** | 2026-09-14 | In use from **F055**; flat config is `configs.vite`. |
| `prettier` | **3.9.9** | 2026-09-23 | In use from **F055** — `frontend/.prettierrc.json` (printWidth 100, derived from the repo's own style: p99 was 102 chars, the author splits at 96). |
| `vitest` | **5.0.3** | 2026-09-30 | engines `node ^22.12 \|\| ^24 \|\| >=26`; peer `vite ^6.4 \|\| ^7 \|\| ^8` |
| `@vitest/coverage-v8` | **5.0.3** | 2026-09-30 | In use from **F055** — `provider: 'v8'`, configured in `vite.config.ts` `test.coverage` with the thresholds and the recorded numbers in §6. |
| `jsdom` | **29.1.1** | 2026-04-30 | **pinned below latest — §5** |
| `@testing-library/react` | **16.3.3** | 2026-08-27 | peer `react ^19` |
| `@testing-library/user-event` | **14.6.7** | 2026-09-02 | |
| `@testing-library/jest-dom` | **7.0.1** | 2026-08-09 | engines `node >=22` |
| `msw` | **3.0.2** | 2026-10-03 | engines `node >=22.12`; peer `vite >=6` |
| `@hey-api/openapi-ts` | **0.99.0** | 2026-06-22 | engines `node >=22.18.0`; peers `typescript >=5.5.3 \|\| >=6.0.0` — the OpenAPI→TypeScript generator, added in F018. Dev-only CLI, never a runtime dependency. |
| `@playwright/test` | **1.64.0** | 2026-10-07 | engines `node >=20` (installed 24.14.0 ✓). In use from **F057** — the browser suite in `frontend/tests/e2e/`; Chromium build **1248**, installed by `pnpm exec playwright install chromium`. The suite runs it headless through the config's default project, so `chromium_headless_shell-1248` is what a run actually launches. |
| `@axe-core/playwright` | **4.13.0** | 2026-08-11 | |
| `@types/react` | **19.3.0** | 2026-09-09 | matches `react` |
| `@types/react-dom` | **19.3.0** | 2026-09-09 | |
| `@types/node` | **24.19.1** | 2026-10-01 | major tracks the Node runtime, not the newest (`26.6.4`) |

**Tool choice: OpenAPI → TypeScript DTOs (F018).** `TASKS.md` F018 requires typed DTOs generated from FastAPI's
OpenAPI schema but names no generator, so one was selected with the §2.4 discipline — registry evidence, not
assumption:

| Candidate | Latest (2026-10-09) | Outcome |
|---|---|---|
| `openapi-typescript` | 7.13.0 (2026-02-11) | Rejected: peer `typescript ^5.x`, unsatisfied by the pinned TS 6.0.3. Under pnpm's `auto-install-peers` that resolves a **second TypeScript copy**, and the package predates TS 6 entirely. |
| `orval` | 8.41.0 (2026-10-08) | Rejected: generates per-endpoint Query hooks and its own client, duplicating `lib/api.ts` (error normalization, 401 policy) and the centralised query keys. |
| **`@hey-api/openapi-ts`** | **0.99.0 (2026-06-22)** | **Chosen**: peers `typescript >=5.5.3 \|\| >=6.0.0` (TS 6 supported explicitly), engines `node >=22.18.0` (installed 24.14.0 ✓). Runs as a pinned devDependency CLI with only the `@hey-api/typescript` plugin — types out, no generated SDK transport. Pipeline and drift check: `docs/OPENAPI_CLIENT.md`. |

## 4. Backend — Python 3.14

Resolution proven, not assumed: `uv pip compile` resolved the full set below with **exit 0** for Python 3.14
(169 packages). See §9 for the command.

| Package | Version | Released | `requires_python` |
|---|---|---|---|
| `fastapi` | **0.143.0** | 2026-10-08 | >=3.10 |
| `uvicorn[standard]` | **0.54.0** | 2026-09-25 | >=3.10 |
| `pydantic` | **2.14.0** | 2026-10-08 | >=3.10 |
| `pydantic-settings` | **2.15.0** | 2026-08-07 | >=3.10 |
| `sqlalchemy[asyncio]` | **2.1.4** | 2026-10-07 | >=3.11 |
| `asyncpg` | **0.32.0** | 2026-10-06 | >=3.9 |
| `alembic` | **1.20.0** | 2026-09-11 | >=3.10 |
| `python-multipart` | **0.0.32** | 2026-06-04 | >=3.10 |
| `email-validator` | **2.3.0** | 2025-08-26 | >=3.8 |
| `argon2-cffi` | **25.1.0** | 2025-06-03 | >=3.8 |
| ~~`pyjwt`~~ | 2.15.1 | 2026-09-28 | >=3.9 — **not required**: `DECISIONS.md` C12 chose opaque session cookies, so there is no JWT anywhere. Listed only because the reference used one. |
| `reportlab` | **5.0.1** | 2026-08-20 | >=3.9,<4 |
| `openpyxl` | **3.1.5** | 2024-06-28 | >=3.8 |
| `pypdf` | **6.19.0** | 2026-09-16 | >=3.9 |
| `pymupdf` | **1.28.2** | 2026-08-06 | >=3.10 |
| `docxtpl` | **0.20.2** | 2025-11-13 | >=3.7 |
| `pillow` | **12.3.0** | 2026-07-01 | >=3.10 |
| `httpx` | **0.28.1** | 2024-12-06 | >=3.8 |
| `pytest` | **9.1.1** | 2026-06-19 | >=3.10 |
| `pytest-asyncio` | **1.4.0** | 2026-05-26 | >=3.10 |
| `pytest-cov` | **7.1.0** | 2026-03-21 | >=3.9 — the plugin that collects the data during a pytest run |
| `coverage` | **7.16.2** | 2026-09-27 | >=3.10 — **new as a direct dependency in F056**: `scripts/coverage_gate.py` imports it by name to read the group numbers, and it is pinned to the version `pytest-cov` 7.1.0 already resolved, so the lock gained a declaration and no version change (`Requires-Python` read from the installed metadata, not assumed) |
| `ruff` | **0.16.10** | 2026-10-01 | >=3.7 — formatter **and** linter, both in the F056 gate |
| `mypy` | **2.4.0** | 2026-10-01 | >=3.10 — strict, over `app`, `tests` and `scripts` (`[tool.mypy] files`), in the F056 gate |

Transitive binary wheels confirmed for CPython 3.14: `pydantic-core` 2.50.0, `asyncpg` 0.32.0, `pillow` 12.3.0
and `greenlet` 3.5.6 publish `cp314` wheels; `pymupdf` 1.28.2 publishes a `cp310-abi3` wheel (stable ABI —
covers 3.10+); `bcrypt` 5.0.0 publishes `cp38-abi3`. `argon2-cffi` and `reportlab` are pure-Python at the top
level (`argon2-cffi-bindings` 26.1.0, 2026-08-20, carries the compiled part).

## 5. Pinned below absolute latest — with the observed reason

`BIG-PROMPT.txt` §2.4 requires a documented reason for any package not at latest. Three:

| Package | Latest | Pinned | Reason (observed, not assumed) |
|---|---|---|---|
| `typescript` | **7.0.2** (2026-07-08) | **6.0.3** | `typescript-eslint@8.71.1` declares peer `typescript >=4.8.4 <6.1.0`, so TS 7 breaks typed linting. No newer stable `typescript-eslint` exists (dist-tags: `latest` 8.71.1, `canary` 8.71.2-alpha.1, no v9). 6.0.3 is the newest version inside the supported range. Revisit when typescript-eslint ships TS 7 support. |
| `jsdom` | **30.1.2** (2026-10-04) | **29.1.1** | jsdom 30.x requires `node ^22.22.2 \|\| ^24.15.0 \|\| >=26`; the installed Node is **24.14.0**, below the 24.15.0 floor. 29.1.1 accepts `>=24.0.0` and works on both the installed Node and a future upgrade. |
| `@types/node` | 26.6.4 | **24.19.1** | Types should match the Node runtime major (24 LTS), not the newest published major. |

**Python version choice.** Latest *stable* is **3.14** (3.14.6 available; 3.15.0b2 is beta and excluded per
§2.4's "avoid alpha, beta, canary"). The full dependency set resolves on 3.14, so 3.14 is the target;
`pyproject.toml` should declare `requires-python = ">=3.14"`. Python 3.12 also resolves (171 packages), so a
downgrade remains available if a later task hits a 3.14-specific problem — that would be a recorded change,
not a silent one.

**Optional operator action:** upgrading Node from 24.14.0 to 24.21.0 LTS would clear the `jsdom` floor and
allow jsdom 30.1.2; it is not required, and 29.1.1 is pinned so nothing is blocked either way. Also consider
upgrading pnpm 12.9.1 → 12.10.1 so the pinned `packageManager` field matches what is installed.

## 6. Compatibility constraints verified

Every one of these was checked against the published manifests, not inferred:

- **React 19.3.0** satisfies every React peer in the set (`^19`, `>=18`, `>=19.2.7`, `^19.3.0`).
- **`react-router@8.4.0`** needs Node `>=22.22.0` (installed 24.14.0 ✓) and React `>=19.2.7` (✓).
- **Vite 8 chain:** `@vitejs/plugin-react@6.1.2` peers `vite ^8.0.0` (✓ 8.3.4);
  `@tailwindcss/vite@4.3.3` peers `vite ^5.2 || ^6 || ^7 || ^8` (✓); `vitest@5.0.3` peers
  `vite ^6.4 || ^7 || ^8` (✓).
- **ESLint 10 chain:** `typescript-eslint@8.71.1` peers `eslint ^8.57 || ^9 || ^10` (✓ 10.12.0).
  Two further facts about this chain were established by installation in **F055**, not inferred:
  ESLint 10 ships **without** `@eslint/js` (so it is a direct devDependency here, §3), and
  `@eslint/js@10.0.1` is the newest published version despite the eslint package being at 10.12.0 —
  the two version lines are independent. `eslint-plugin-react-hooks@7.1.1` works only through its
  `configs.flat` entry; passing the namespaced `configs['recommended-latest']` fails at config load.
- **Node engines:** the strictest floors in the set are `react-router >=22.22.0`, `msw >=22.12.0`,
  `jest-dom >=22` and `typescript-eslint >=21.1.0` — all satisfied by Node 24.14.0. Only `jsdom` 30.x would
  have failed (§5).
- **shadcn `base-nova` exists.** The shadcn docs page only lists `new-york`, which is stale: the authoritative
  schema at `ui.shadcn.com/schema.json` enumerates `base-nova` (alongside `base-vega`, `base-maia`, … and the
  `radix-*`/`aria-*` families). The reference archive's `components.json` uses `style: base-nova` with
  `baseColor: neutral`, `iconLibrary: lucide`, `cssVariables: true`, `rsc: true` — the target keeps everything
  except `rsc`, which must become **`false`** for a Vite SPA (BP §5.1).
- **PostgreSQL 18 with asyncpg:** upstream `asyncpg` documents support for PostgreSQL 9.5–18 and added PG 18
  CI coverage in v0.31.0; the pinned **0.32.0** postdates that. **Not yet independently verified:**
  SQLAlchemy 2.1.4 / Alembic 1.20.0 against a live PG 18 instance — that is only provable by running the
  migrations, and is deferred to **F008/F023** (see §10).
- **`next-themes@0.4.6`** has **no dependencies at all** (verified from the manifest) and does not import
  `next/*`, which is the static evidence behind BP §2.1's conditional "may remain only if verified to work in
  a Vite SPA". The runtime check belongs to **F010**; if it fails there, the documented fallback is an equally
  small framework-agnostic provider.
- **`coverage` is a compatible *direct* dependency, not a second copy (observed F056).** `pytest-cov@7.1.0`
  requires `coverage[toml]>=7.10.6`, and the resolver had already installed **7.16.2** for it. Declaring
  `coverage==7.16.2` directly — which `scripts/coverage_gate.py` needs, since it imports the library by name —
  left the lock with that one added declaration and **no version change**: `uv lock` re-resolved 65 packages and
  every existing pin, `coverage`'s own included, stayed put. A pin *below* pytest-cov's floor would have moved
  the plugin or installed two copies; this is the evidence that it does not.
- **Both legs of the backend suite run under one pytest (observed F056).** `integration` is registered in
  `[tool.pytest.ini_options] markers` — an unregistered marker is an **error** under the `--strict-markers`
  this project already had, which is the check that the registration cannot be forgotten. The database-free leg
  (`-m "not integration"`) collects the whole suite and deselects the rest: 264 of 434 items in F056.
- **`msw@3.0.2` against Vitest's optional peer (observed F018).** `pnpm peers check` reports
  `@vitest/mocker@5.0.3` wanting `msw ^2.4.9`. The declaration is an **optional** peer, and the installed 5.0.3
  only references `msw` in `dist/browser.js` — the browser-mode module mocking this project does not use. The
  jsdom/node path (`msw/node` `setupServer`) is unaffected: the full suite passes with msw 3.0.2, and no second
  copy is installed. If a future Vitest version starts importing msw outside browser mode, the fallback is
  msw 2.x.
- **The browser suite adds no backend dependency (observed F057).** `@playwright/test` is a frontend
  devDependency; the API it drives is the real one, started by the config's `webServer` as the same
  `uvicorn app.main:app` a deployment runs. §4's Python set is unchanged by F057. The PDF step exports through
  the operator's existing in-process renderer, so no Gotenberg container is involved.
- **One isolated stack, three ports, one deliberate configuration override (observed F057).** The run builds
  its own database (`app_e2e`, dropped and migrated to head by `backend/scripts/e2e_database.py`) and starts
  the API on **8001**, the Vite dev server on **5174** and a `vite preview` of the real `dist/` on **4174** —
  a developer's 8000/5173 stack keeps running untouched, and `reuseExistingServer` is `false` on all three
  so a stale server can never be reused. `ALLOWED_ORIGINS` is widened to those two origins **for the API
  process only**, which is also the evidence that CSRF checks the `Origin` header rather than trusting a
  proxy. Both cookies are `__Host-`-prefixed and therefore **port-agnostic**, so the session created on 5174
  is the session the 4174 preview receives — exactly what step 11's deep link needs. The single behavioural
  override is `LOGIN_MAX_ATTEMPTS=200` (default 5 per 15 minutes per source address, `services/auth.py`):
  BP-10.4's workflow signs in more than five times from 127.0.0.1, and a successful login deliberately does
  not clear the address bucket. It is set in the config's `webServer.env` for that process only; step 9 still
  takes one deliberate failed sign-in through the real form.

## 7. Package manager — operator override

`DECISIONS.md` **C11** (confirmed 2026-10-08): **pnpm** for the frontend, overriding `BIG-PROMPT.txt` §2.1/§2.3
("npm … not pnpm"). Consequences recorded here: the lockfile is **`pnpm-lock.yaml`**, CI and operator commands
use pnpm, and `package.json` should carry a `packageManager` field pinning the pnpm version. The pack files
`CLAUDE_MASTER.md`, `TASKS.md` (F061) and `OPERATOR_GUIDE.md` were amended to match. The backend stays on
**uv** as the pack already required — no override needed there.

## 8. Cross-check against `BIG-PROMPT.txt`'s "as-of audit examples"

The prompt states these are not guarantees and must be revalidated. Revalidated:

| Prompt claimed | Actually verified | Verdict |
|---|---|---|
| React `19.3.0` | 19.3.0 (2026-09-09) | confirmed |
| FastAPI `0.142.4` | **0.143.0**, released *today* 2026-10-08 | superseded |
| React Router `8.4.0` | 8.4.0 (2026-09-15) | confirmed |
| TanStack Query `5.104.0` | **5.104.1** (2026-10-02) | superseded |
| Tailwind CSS `4.3.3` | 4.3.3 (2026-07-16) | confirmed |

The archive's own pinned values (`React 19.2.4`, `FastAPI >=0.136.3`) are history, not targets.

## 9. Evidence commands (reproducible)

```bash
# npm — version, publish date, engines, peers for one package
curl -s https://registry.npmjs.org/typescript-eslint \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d),v=j['dist-tags'].latest;console.log(v,j.time[v],JSON.stringify(j.versions[v].peerDependencies))})"

# PyPI — version, upload date, requires_python
curl -s https://pypi.org/pypi/asyncpg/json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.info.version,j.info.requires_python)})"

# Docker Hub — tags and last-updated
curl -s "https://hub.docker.com/v2/repositories/library/postgres/tags?page_size=100&name=18"

# Python 3.14 dependency resolution (the strongest single check)
uv pip compile req.in --python-version 3.14        # exit 0, 169 packages

# Node LTS line
curl -s https://nodejs.org/dist/index.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).filter(v=>v.lts)[0]))"
```

## 10. Not yet verified — owned by later tasks

| Item | Proving task |
|---|---|
| SQLAlchemy 2.1.4 + Alembic 1.20.0 migrations against a live `postgres:18.6-alpine` | F008 (container), F023 (first migration) |
| `next-themes` actually working inside the Vite SPA build | F010 |
| Caddy 2.11.7 SPA fallback + API proxy behaviour | F059 |
| Gotenberg 8.37 conversion round-trip | F052 |
| Frontend dependency set resolving together under pnpm (peer graph, single React copy) | F006 |
| Actual generated lockfiles (`pnpm-lock.yaml`, `uv.lock`) and image digests | F006, F007, F059 |
| Vulnerability scans (`pnpm audit`, `pip-audit`/uv equivalent) | F061 |

No claim in this document asserts that anything has been installed, built, migrated or run.
