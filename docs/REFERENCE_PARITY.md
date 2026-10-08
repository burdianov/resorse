# REFERENCE PARITY — task F004 (Phase 0 requirement, gap G-5)

Reference file → target file → status → reason. Required by `BIG-PROMPT.txt` §11.7/§14.2; F002's
`REQUIREMENT_TRACEABILITY.md` §12 and gap G-5 assigned it to F004.

Source of the reference column: the archive manifest (`D:\RESORS_REFERENCE\qtc360-main.zip`, 517 entries),
inspected read-only in F001 and re-listed for this task. Status meanings:

| Status | Meaning |
|---|---|
| **KEEP** | capability preserved, re-implemented on the target stack |
| **ADAPT** | capability preserved but materially changed (Next→Vite, domain removed, security improved) |
| **REWRITE** | same purpose, new implementation with no reusable code |
| **EXCLUDE** | deliberately not ported — domain logic, branding, credentials or environment residue |

## 1. Frontend — components

| Reference | Target | Status | Reason |
|---|---|---|---|
| `src/components/ui/*.tsx` (29 files) | `src/components/ui/*` | KEEP | The 29 primitives are the design contract (§1.1). Re-implemented on `@base-ui/react` + Tailwind 4, not pasted from stale generated code. |
| `src/components/data-table/*` (7 + `index.ts`) | `src/components/data-table/*` | KEEP | Enterprise table parity (§5.3) is a core requirement. |
| `src/components/form/{form,fields}.tsx` | `src/components/form/*` | KEEP | RHF + Zod pattern (§5.4). |
| `src/components/loaders/*` (5) | `src/components/loaders/*` | KEEP | Skeleton/spinner states reused. |
| `src/components/layout/{app-sidebar,navbar,command-palette}.tsx` | `src/components/layout/*` | ADAPT | Same geometry and interaction; nav contents replaced with generic admin groups. |
| `src/components/layout/{project-switcher,project-select-modal}.tsx` | `src/components/layout/context-switcher-slot.tsx` | ADAPT | Becomes a disabled-by-default generic adapter (gap G-4), not a project master. |
| `src/components/providers/{query,auth,theme}-provider.tsx` | `src/components/providers/*` | ADAPT | Patterns kept; auth guard reworked for cookie sessions and Retry-on-network-failure. |
| `src/components/pdf-preview-modal.tsx` | `src/components/common/pdf-preview-modal.tsx` | KEEP | Generic PDF preview (§7.9). |
| `src/components/SignatureImage.tsx` | *optional, deferred* | EXCLUDE (optional) | A generic signature **asset** would be permissible, but its only consumer is a domain workflow. Not built unless adopted (gap G-7). |
| `src/components/approval/*` (7 files) | — | EXCLUDE | Approval/signing business semantics (§3.1). |
| `src/components/qaqc/*` (3) | — | EXCLUDE | QA/QC domain. |
| `src/components/{checklist-items-dialog,fill-checklist-modal,document-attachments,document-checklist-buttons,requirement-selector,commissioning-linkage}.tsx` | — | EXCLUDE | Domain document/commissioning logic. |

## 2. Frontend — pages, routing, lib, hooks

| Reference | Target | Status | Reason |
|---|---|---|---|
| `src/app/(dashboard)/**` (67 files) | `src/pages/*` (14 generic routes) | EXCLUDE | Domain screens (QA/QC, commissioning, documents, masters). Replaced by the generic route set in ARCHITECTURE §4 and F016. |
| `src/app/login/page.tsx` | `src/pages/login.tsx` | ADAPT | Visual composition kept (§1.2), brand artwork replaced with neutral CSS/SVG. |
| `src/app/{layout,error,not-found,loading}.tsx` | `src/app/{router,providers}.tsx` + route states | REWRITE | Next App-Router conventions do not exist in a Vite SPA (§0.5). |
| `src/config/navigation.ts` | `src/config/navigation.ts` | ADAPT | Registry shape and metadata contract preserved; entries become generic, permission-filtered. |
| `src/lib/api.ts` | `src/lib/api.ts` | ADAPT | Axios kept; token storage and single-flight refresh **removed** (opaque cookie sessions, ARCHITECTURE §3). |
| `src/lib/{csv,upload,format-date,utils}.ts` | `src/lib/*` | KEEP | Generic helpers. |
| `src/lib/{document-payload,commissioning-linkage-persist}.ts` | — | EXCLUDE | Domain payload shaping. |
| `src/lib/constants.ts` | `src/config/branding.ts` | ADAPT | Neutral `APP_NAME` config instead of QTC360 constants. |
| `src/hooks/{use-auth,use-mobile}.ts` | `src/hooks/*` | KEEP | Generic. |
| `src/hooks/use-project.ts` | `src/hooks/use-permission.ts` | ADAPT | Domain project context replaced by permission + context-adapter hooks. |
| *(absent in reference)* | `src/testing/*`, `tests/{unit,components,e2e,visual}` | REWRITE | The reference has no frontend test suite; §10.3/§10.4 add Vitest + Testing Library + MSW + Playwright. |

## 3. Frontend — build and configuration

| Reference | Target | Status | Reason |
|---|---|---|---|
| `next.config.ts`, `postcss.config.mjs` | `vite.config.ts` | REWRITE | Next.js is prohibited (§0.5); Tailwind 4 goes through `@tailwindcss/vite`. |
| `package.json`, `package-lock.json` | `package.json`, `pnpm-lock.yaml` | REWRITE | pnpm per `DECISIONS.md` C11; versions from `docs/STACK_VERSIONS.md`. |
| `tsconfig.json`, `eslint.config.mjs` | same names | ADAPT | `strict` kept; ESLint flat config retargeted; TS pinned 6.0.3 for typescript-eslint. |
| `components.json` | `components.json` | ADAPT | Keeps `style: base-nova`, `baseColor: neutral`, `iconLibrary: lucide`, `cssVariables: true`; **`rsc` must become `false`**. |
| `public/{logo,logo-icon,favicon}*.svg` | `public/brand-placeholder.svg` | EXCLUDE | QTC360 branding (§0.2). |
| `public/login-bg{,-light}.svg` | neutral CSS/SVG pattern | REWRITE | Layout language kept, original artwork not reused. |
| `public/{next,vercel,file,globe,window}.svg` | — | EXCLUDE | Framework scaffolding icons. |
| `next/link`, `next/image`, `next/font`, `useRouter`, `usePathname`, metadata exports | Router `Link`, `<img>`, `@font-face`, `useNavigate`, `useLocation`, static `index.html` title | REWRITE | §9.5 Next-removal mapping. |
| `next-themes@0.4` | `next-themes@0.4.6` *(verify at F010)* or a small framework-agnostic provider | ADAPT | Permitted only if verified in a Vite SPA (§2.1); the fallback is documented. |
| **Redis** | **absent everywhere** | EXCLUDE | §0.6 target-state prohibition — not a source feature to migrate. |

## 4. Backend

| Reference | Target | Status | Reason |
|---|---|---|---|
| `app/core/{config,database,deps,types}.py` | `app/core/*` | KEEP | Configuration, async engine, dependency wiring. |
| `app/core/security.py` | `app/core/security.py` | REWRITE | JWT/`localStorage` design replaced by opaque cookie sessions + Argon2id (ARCHITECTURE §3). |
| `app/models/{user,rbac,audit_log,notification,user_preference,app_setting,base}.py` | `app/models/*` | ADAPT | Domain columns removed (`designation`, project relations); a `session` model is added. |
| `app/models/*` — remaining 24 files (asset, checklist, commissioning, contractor, client, document, project, approver, …) | — | EXCLUDE | Domain masters and workflow entities (§3.1). |
| `app/schemas/{auth,admin}.py` | `app/schemas/*` | KEEP | DTO patterns. |
| `app/schemas/{commissioning,document,master}.py` | — | EXCLUDE | Domain DTOs. |
| `app/services/{audit,pdf,pdf_merge,storage}.py` | `app/services/*` | KEEP | Generic audit, PDF and private-storage infrastructure (§3.2, §7.9). |
| `app/services/{approval,approval_files,checklist_pdf,checklist_xlsx,commissioning,signature}.py` | — | EXCLUDE | Domain report/approval/signature logic. |
| `app/services/reporting.py` *(new)* | `app/services/reporting.py` | REWRITE | Generic `ReportService` incl. Gotenberg and docxtpl sample (§7.9b). |
| `app/api/v1/{auth,admin}.py` | `app/api/v1/{auth,admin_users,roles,permissions,settings,preferences}.py` | ADAPT | Split into the required endpoint surface (§8.3). |
| `app/api/v1/notifications.py` | `app/api/v1/notifications.py` | KEEP | Per-user CRUD, ownership enforced in SQL. |
| `app/api/v1/{checklist,links,progress,requirements,tag_targets,work_items,dashboard,approval,attachments,signing,master,ref_config,bundle,generation,templates}.py` | — | EXCLUDE | Domain routers (§3.1). |
| `app/main.py` | `app/main.py` | REWRITE | The global `APIRouter.include_router` monkey patch must **not** be copied (§6.2h). |
| `app/seed.py` | `app/seed.py` + `bootstrap_admin.py` | REWRITE | Idempotent roles/permissions only; no demo data, no default credentials (§0.7). |
| `app/{seed_demo,seed_commissioning}.py`, `recalculate_all.py`, `cleanup_*.py` | — | EXCLUDE | Demo/domain tooling. |
| `backend/{_chk,reset_password,purge_documents}.py` | — | EXCLUDE | Ad-hoc scripts superseded by the bootstrap CLI and admin UI. |
| `app/repositories/` | *not created* | EXCLUDE | Thin pass-through in the reference; services + models suffice (§8.1 permits deviation). |
| `backend/db_dump/*.csv` (29 files) | — | EXCLUDE | Real credential/PII material — `users.csv` carries `hashed_password`. Explicitly forbidden (§0.7, line 621). |
| `backend/app/fonts/*.ttf` (9) | — | EXCLUDE | Decorative signature fonts for a removed workflow. |
| `backend/.venv_old/`, `_chk.py` residue | — | EXCLUDE | Environment residue. |
| `pyproject.toml`, `uv.lock` | `pyproject.toml`, `uv.lock` | REWRITE | Python 3.14, versions from `docs/STACK_VERSIONS.md`. Substitutions: `passlib` → `argon2-cffi` (passlib last shipped 2020); `python-jose` → **nothing** — C12's opaque sessions mean no JWT exists anywhere. |
| `alembic.ini`, `migrations/env.py` | same | ADAPT | Async setup kept; **no** historical revision is imported (§8.1). |

## 5. Infrastructure, CI, tests, docs

| Reference | Target | Status | Reason |
|---|---|---|---|
| `docker-compose.yml` (dev: postgres, gotenberg, pgadmin) | `docker-compose.yml` | ADAPT | postgres 18.6 + gotenberg 8.37; no pgadmin requirement; no Redis. |
| `docker-compose.prod.yml` | `docker-compose.prod.yml` | ADAPT | Caddy + static Vite + API + postgres + gotenberg; internal networks, non-root, healthchecks. |
| `docker-compose.e2e.yml` | `docker-compose.e2e.yml` | ADAPT | Isolated test database for Playwright. |
| `Caddyfile` | `Caddyfile` | ADAPT | SPA fallback that does **not** swallow API 404s; security headers. |
| `frontend/Dockerfile` (Next standalone) | `frontend/Dockerfile` | REWRITE | Multi-stage static Vite build; no Node runtime in production. |
| `backend/Dockerfile`, `Dockerfile.e2e` | same | ADAPT | Non-root, uv-based, Python 3.14. |
| `.github/workflows/{ci,deploy}.yml` | same | ADAPT | pnpm instead of npm; Vite build; Gotenberg **:8** consistently (fixes the source's `:7`/`:8` split); guarded deploy without QTC360 hosts. |
| `scripts/run_e2e.{sh,ps1}` | same | ADAPT | Retargeted at the new compose file. |
| `scripts/fix_tags_recalculate.py` | — | EXCLUDE | Domain data-repair script. |
| `.env.example` | `.env.example` | REWRITE | New key set; no `NEXT_PUBLIC_*`; placeholders only, production fails on weak values. |
| `.gitignore`, `.dockerignore` | same | ADAPT | Project-specific; a `.gitattributes` **exists already** (LF policy) and must be extended, not replaced. |
| `.claude/**`, `frontend/.claude/**`, `CLAUDE.md` ×2, `PR1_RESUME_PROMPT.md`, `docs/claude-{map,workflows}.md`, `.claudeignore` | — | EXCLUDE | Another project's agent configuration and working notes. |
| `README.md` | `README.md` | REWRITE | New setup, migration, bootstrap, backup and deploy instructions (F062). |
| `backend/tests/e2e/**` (incl. domain suites) | `backend/tests/**` | ADAPT | Fixture/helper patterns and the real-PostgreSQL integration approach are reused; domain test bodies are not. |
| *(absent in reference)* | `docs/*` per §14 | REWRITE | The required document set is new — see `REQUIREMENT_TRACEABILITY.md` §12. |

## 6. Summary

Counted directly from the tables above (70 rows):

| Status | Rows |
|---|---|
| KEEP | 11 |
| ADAPT | 23 |
| REWRITE | 15 |
| EXCLUDE | 21 |

**No domain module survives into the target.** The four things the target deliberately does *not* carry over
from the reference's architecture are: Next.js (replaced by Vite), `localStorage` JWTs (replaced by opaque
cookie sessions), npm (replaced by pnpm per C11), and the `APIRouter` monkey patch (replaced by normal
composition). The four it carries forward are: the component/data-table/form design language, the
FastAPI + async SQLAlchemy layering, the private-storage/PDF reporting infrastructure, and the
real-PostgreSQL integration test approach.
