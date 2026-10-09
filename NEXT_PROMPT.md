# NEXT SESSION PROMPT — resors

> **Read this file first** in any new Claude Code session started in `D:\resors`.
> It is the **single cold-start handoff**; `claude_code_pack/STATE.md` is now just a pointer to it.
> Last updated: 2026-10-09 — after task F017.

**Rules for Claude Code:**
- **Commit at the end of each completed task** (C13). Push, deploy and final acceptance stay with the operator.
- **The handoff's `NEXT:` line carries the task name, not just the ID** — `NEXT: F017 — error and route states`
  (operator request 2026-10-09). A bare ID forces a lookup in `TASKS.md`; the name is what makes the line
  readable on its own. Use the title exactly as `TASKS.md` writes it.
- **The operator runs all whole-suite and gate checks** (C14). Every handoff must give exact, copy-pasteable
  commands with expected outcomes. Never run or report a suite result you did not observe yourself.
- **Update this file at the end of every completed task — all six places, not the interesting ones.** On 2026-10-09
  the paste block and the header were found still naming F008 after five further tasks, because only §3/§4/§7/§8 had
  been refreshed. The full refresh list: the **header date and task**, **§1's two task IDs**, **§3 current
  position**, **§4 environment facts**, **§7 completed work**, and **§8 commands**. A stale §1 is the worst of them:
  it is the text the operator actually pastes.
- **Every completed task must add its runnable commands to §8** (start it, check it, test it), with the task ID
  that made them available. Remove or correct any command a later task invalidates. §8 is what the operator
  actually runs; it must never list a command that does not work yet.
- **Every account a task creates gets a row in §9** — email, role, purpose and which task made it. **Never put a
  password in this file**: it is committed. Password values go in the git-ignored `LOCAL_CREDENTIALS.md`, and §9
  only points there. Record a password at the moment it is generated; most are shown once.

---

## 1. Paste this to continue

```text
Read claude_code_pack/CLAUDE_MASTER.md, claude_code_pack/DECISIONS.md,
docs/ARCHITECTURE.md, docs/STACK_VERSIONS.md, NEXT_PROMPT.md and task F018 in
claude_code_pack/TASKS.md. Implement F018 only. Follow the one-task protocol.
Commit the task at the end. Update NEXT_PROMPT.md, then stop and give me the
operator checks — I run the suites myself.
```

Replace `F018` with the next ID from §3 when it changes. Read only the spec sections the task needs, and never
re-read all of `BIG-PROMPT.txt` — jump to a section using the index in `docs/REQUIREMENT_TRACEABILITY.md` §1–§11.

## 2. Where things are

| What | Path |
|---|---|
| Project root (repo) | `D:\resors` |
| Instruction pack | `claude_code_pack\` — `CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `OPERATOR_GUIDE.md` (operator runbook incl. the test-command table), `STATE.md` (pointer only) |
| Task artifacts | `docs\` — `REPOSITORY_AUDIT.md` (F001), `REQUIREMENT_TRACEABILITY.md` (F002), `STACK_VERSIONS.md` (F003), `ARCHITECTURE.md` + `REFERENCE_PARITY.md` (F004), `ROUTES_NAVIGATION.md` (F016) |
| Frontend (F006) | `frontend\` — `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src\{main.tsx,vite-env.d.ts,app\router.tsx}` |
| Backend (F007) | `backend\` — `pyproject.toml`, `uv.lock`, `.python-version`, `app\{main.py,core\config.py,api\v1\{router,health}.py}`; `models\`, `schemas\`, `services\`, `migrations\versions\`, `tests\` still empty |
| Reference material (**outside the project folder**) | `D:\RESORS_REFERENCE\qtc360-main.zip`, `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |
| Unrelated — do not touch | `D:\QTC360\` (a separate QTC360 working area) |

Reference inputs are outside the repo by design and `.gitignore` carries a safety net. Read them by absolute
path; an out-of-folder read may raise a permission prompt, which is expected. Hashes:
`qtc360-main.zip` = `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05`,
`BIG-PROMPT.txt` = `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2`.

## 3. Current position

- Stage: **A — domain-neutral foundation** (F001–F063; Stage B D001–D091 adds the construction domain).
- Last completed: **F017 — error and route states** (`/` → `/dashboard`, `/admin` → first permitted admin route
  or 403, 403/404 pages, per-route error boundary with Retry, protected placeholder, and the five enhanced
  generics: PageHeader, EmptyState, ErrorState, LoadingState, StatusBadge).
- **Next task: F018 — API client foundation.** Axios error normalization, the TanStack Query provider, typed
  DTOs generated from the FastAPI OpenAPI schema, and `docs/OPENAPI_CLIENT.md` (drift check wired in F061).
  Acceptance is MSW client tests. It feeds two things F017 left ready: `ErrorState variant="offline"` for
  network/5xx (the query layer is where "offline" can actually be told apart from "broken") and the
  `useAccess` provider feeding route guards. Package additions (axios, @tanstack/react-query, msw) are already
  named in the mandated stack and pinned in `docs/STACK_VERSIONS.md` §2–§3 — allow the install step.
- Git: branch `main`, one commit per completed task; the tree is clean after each commit. F017 sits on top of
  `749fe42` (docs: NEXT-line convention).
- Last human verification: **NOT RUN** — no gate suite has been run by the operator yet. F015's three-width
  check, F016's palette check and F017's route-state checks are the operator's visual checks (see §8).

## 4. Environment facts

- Windows 11; PowerShell-first, Bash (Git Bash/MSYS2) also available. Node **v24.14.0**, pnpm **12.9.1**
  (pinned in `package.json`, honoured — no corepack switch), `uv`, git 2.49, Python 3.14. Docker not yet verified.
- Both sides are installed: `frontend/node_modules` (pnpm) and `backend/.venv` (`uv sync`, 64 packages locked).
  Neither dev server is running by default; the database container is running now.
- **Styling is live:** `frontend/src/styles/globals.css` holds the theme tokens (31 light / 30 dark, values
  verified against the reference). Tailwind 4 goes through `@tailwindcss/vite`; dark mode is the `.dark` class
  on `<html>`, not a media query — F010 supplies the provider that sets it.
- **UI primitives and tests are live:** 29 files in `frontend/src/components/ui/` (F011–F015) = 28 of the source's
  29 primitives — only `table` missing, it is F020 — plus `calendar`, with the generation-and-correction workflow
  in `ARCHITECTURE.md` §5 — after every `shadcn add` run **`pnpm run fix:ui`**, which restores components the
  generator reverted. Component tests live in `frontend/tests/components/`; Vitest config sits in `vite.config.ts`
  (jsdom + `src/testing/setup.ts`).
- **Layout shell is live (F015):** `frontend/src/components/layout/` — `app-shell.tsx` (SidebarProvider + sidebar
  + 64px header + `p-6` content, mounted as the root layout route in `app/router.tsx`), `app-sidebar.tsx` (nav
  mechanics; items arrive through a `groups` prop), `app-header.tsx`, `context-switcher-slot.tsx` (BIG-PROMPT
  §3.2a interface; disabled by default and renders **nothing**), `sidebar-preferences.ts`. Sidebar collapse is
  persisted in localStorage `app.sidebar` (`expanded`/`collapsed`), group open state in `app.sidebar.groups`;
  a first load in the 768–1023px band starts collapsed. The theme control moved from the page into the header
  (sun/moon menu with Light/Dark/System). `src/pages/` holds the current pages (the F017 placeholder and the state
  pages); `src/config/` and `src/hooks/` are no longer empty (`branding.ts`, `navigation.ts`, `modules.ts`,
  `use-mobile.ts`).
- **Navigation registry is live (F016):** `src/config/navigation.ts` is the single definition (route metadata per
  BP §4.7 + `visibleNavigation(access)` + `buildBreadcrumbs` + `buildRouteObjects`); the router's children are
  **generated from it**, and the shell filters once and hands the same list to the sidebar and the palette.
  `src/config/modules.ts` is the compiled-in module slot (`AppModule`, empty today; F063 proves it). Access flows
  through `components/providers/access-provider.tsx`; until F032 supplies a session the shell uses
  `ANONYMOUS_ACCESS` (no permissions, not a superuser) — the correct answer for an anonymous caller, which is why
  the Administration group is deliberately invisible today. `components/common/permission-gate.tsx` and
  `secure-link.tsx` share the same `meetsAccess` rule. `docs/ROUTES_NAVIGATION.md` is the F016 artifact.
- **Command palette is live:** Ctrl/Cmd+K (or the header search trigger, which now appears because F016 passes
  `onSearchClick`) opens it; it lists exactly the filtered registry — today that is `Overview → Dashboard`,
  nothing else, because no other page is registered yet.
- **Route states are live (F017):** `app/router.tsx` exports `buildAppRoutes(access?, routes?)` (the real table,
  built from the registry; tests mount it with fixtures) plus `appRoutes`/`router`. `/` → `/dashboard`; `/admin`
  → first permitted `/admin/*` section or the 403 page; `/403`, `/404` and `*` render the state pages inside the
  shell; every registry route carries `errorElement` and, when it declares `requiredPermissions`/`adminOnly`, an
  automatic `RouteGuard` (denial = 403, *distinct* from the F032 login redirect). `AppShell` now takes an
  optional `access` prop (default anonymous) — that is the seam F032 fills. The foundation status page is
  retired; `/dashboard` renders `pages/dashboard-placeholder.tsx` until F047 replaces it.
- **Enhanced generics are live (F017):** `components/common/` — `page-header.tsx` (breadcrumbs slot),
  `empty-state.tsx`, `error-state.tsx` (with the `offline` flavour), `loading-state.tsx` (the shell's route
  pending state uses it), `status-badge.tsx` (token-only colours; F034 is its first consumer).
- **The header still shows fewer controls than the reference on purpose.** CLAUDE_MASTER forbids inert buttons;
  notifications and the profile menu arrive with F046/F032 (`ARCHITECTURE.md` §12).
- **Database:** `resors-postgres` on `postgres:18.6-alpine`, published on **5432**, database `app_dev`, user
  `app`. Credentials are in the git-ignored `.env`. Verified working end to end: asyncpg 0.32.0 and SQLAlchemy
  2.1.4 both connect to **PostgreSQL 18.6** (this closed the compatibility check F003 had to defer).
- **No JWT anywhere** — C12 chose opaque session cookies, so `pyjwt`/`python-jose` are not dependencies.
- Mandated stack: React + Vite + TS strict SPA, Tailwind 4, FastAPI + async SQLAlchemy 2, PostgreSQL, uv,
  Alembic, Docker Compose, Caddy. **No Next.js, no Redis**, no public signup, one entity, AED only.
- Everything runs **same-origin**: relative `/api/v1`, Vite proxy in dev → `localhost:8000`, Caddy in prod.
- The reference archive is Next.js and is **untrusted**: never extract into the project tree, never execute it,
  never copy branding, `db_dump/*.csv` credentials, seed data, fonts or domain code.

## 5. Pending operator decisions

**None outstanding.** Everything raised so far is decided and recorded:

- **C11** pnpm · **C12** opaque rotating HttpOnly session cookies (no JWT/refresh) · **C13** agent commits each
  task · **C14** operator runs all suites, agent supplies the commands.
- **C12's fallout is reconciled** — F025/F029/F032 were amended in `TASKS.md` to match.
- **All seven F002 gaps are closed** (`docs/REQUIREMENT_TRACEABILITY.md` §14, now a resolution table):
  G-1 `input-group`→F011; G-2 the 21 enhanced generics distributed across F009/F011–F013/F016/F017/F019/F020/
  F050/F053/F054; G-3 redirects→F017; G-4 context-switcher slot→F015; G-5 `docs/TESTING.md`→F062;
  G-6 OpenAPI typed client→F018 generates / F061 drift-checks; G-7 S3 adapter→F049, malware hook→F060,
  delegation interface already in F004, signature asset excluded.
- **Also decided:** routing mode is **data-router**; the pack **stays in `claude_code_pack/`**; **Node stays
  24.14.0** with jsdom 29.1.1 (upgrading to 24.21.0 LTS is optional and only unlocks jsdom 30).
- `DECISIONS.md` OPEN items O01–O18 block only Stage B tasks — **no Stage A task is blocked**. Never silently
  turn an OPEN item into a rule.

## 6. Gaps and constraints later tasks must honour

- **TypeScript 6 deprecates `baseUrl`** — it errors and will stop working in TS 7. Omit `baseUrl`; `paths` alone
  resolves relative to the tsconfig file. Any new tsconfig must follow this.
- **`.gitattributes` must be extended, never replaced** — `* text=auto eol=lf` (scripts/Docker/Caddy LF;
  `*.ps1`/`*.bat`/`*.cmd` CRLF), overriding the machine-wide `core.autocrlf=true`.
- **Do not "helpfully" bump the pinned deviations:** TypeScript **6.0.3** (typescript-eslint peers `<6.1.0`) and
  jsdom **29.1.1** (30.x needs Node ≥24.15.0). Full rationale in `docs/STACK_VERSIONS.md` §5.
- **Tailwind is not installed yet** — F009 owns the theme tokens; do not add it early.
- `docs/ARCHITECTURE.md` §7 defines the extension boundaries (`AppModule`, `ScopePolicy`,
  `ContextSwitcherAdapter`); F063 proves them with a test-only module.
- **Nothing is open** — G-8 was fixed in F014 (`REQUIREMENT_TRACEABILITY.md` §14 records the resolution).
- **One thing needs a real browser to confirm:** in jsdom an uncontrolled `Select` renders the raw value on its
  trigger (`site`) rather than the item label (`Site`) and leaves the listbox mounted. That may be an artefact of a
  layout-less DOM rather than a defect, so it is **not** asserted either way; confirm visually when Playwright
  arrives in **F057** and fix or dismiss it there.
- **`pnpm run fix:ui` after every `shadcn add`** — it restores components the generator reverted, remaps `cn`,
  strips `"use client"` and drops the `cn` package. **Commit before generating**: it restores from `HEAD`.
- **Adding a page is one registry entry.** Create the page under `src/pages/`, then add a `RouteDefinition` to
  `APP_ROUTES` in `config/navigation.ts` (lazy `component`, `group`, permissions). The router mounts it, the
  sidebar and palette list it, breadcrumbs resolve it, and `requiredPermissions`/`adminOnly` automatically give
  it its 403 state and error boundary — no other file changes. **Never register a page that does not exist**: a
  registered route is a rendered link (BIG-PROMPT §1.2, no dead links).
- **`RouterProvider` renders the route tree only** — `<RouterProvider>{extra}</RouterProvider>` silently drops
  `extra`; put extra UI inside a route element (`ARCHITECTURE.md` §12, learned in F016).
- **The 403 page is not the login redirect.** Route guards deny with the 403 UI; the anonymous → `/login`
  redirect is F032's and must stay separate (§4.6), or a permission error reads as "log in again".
- **`StatusBadge` uses existing tokens only** (primary / muted-foreground / destructive). Adding an
  emerald/amber success-warning pair would grow the design system §1.2 froze — add a theme token first, in
  `globals.css`, the way F009 did.
- **Two source behaviours were deliberately not copied in F015** (recorded in `ARCHITECTURE.md` §12): the
  reference re-forces its viewport default on every load and resize, discarding the stored collapse preference —
  here the viewport only decides the first load with nothing stored; and the reference's edge chevron is anchored
  to no positioned ancestor, escaping to the viewport edge — the wrapper here is `relative`.
- **Read `docs/ARCHITECTURE.md` §12 (Implementation notes) before debugging anything in the frontend.** It records
  the traps that cost the most time in F011–F014: minifiers rewriting values and quotes so that hand-written checks
  produce false failures, most failing component tests being wrong expectations rather than defects (dump the DOM
  before changing code), overlay test-state leaking between tests, and the jsdom gaps that need shims.
- Handoff convention: this file is the single source of truth; `STATE.md` is a state-free pointer (a practical
  rather than literal reading of `CLAUDE_MASTER.md` item 7).

## 7. Completed work (newest first)

- **F017 — error and route states.** The route table became a function, `buildAppRoutes(access?, routes?)` in
  `app/router.tsx`, so tests mount the **real** table with fixture routes instead of re-declaring it. `/`
  redirects to `/dashboard` (F032 makes it auth-aware); `/admin` goes to the first `/admin/*` section the caller
  may open — `firstPermittedAdminPath` skips detail routes — and to the **403 page** when there is none, which is
  today's truth (no admin route is registered until F034). `buildRouteObjects` now gives every registry route an
  `errorElement` (a page crash keeps the frame: the error boundary renders *inside* the shell) and wraps every
  route with `requiredPermissions`/`adminOnly` in `RouteGuard`, so a route cannot be registered without its
  denial state. The 403 is deliberately distinct from F032's login redirect (§4.6), and neither the guard nor
  the boundary renders anything from the thrown error (§6.2f, no leak). New: `pages/forbidden.tsx`,
  `pages/not-found.tsx`, `pages/dashboard-placeholder.tsx` (the protected placeholder the retired foundation
  status page hands over to; `status` left the registry), `layout/{route-guard,route-error,admin-redirect}.tsx`,
  and the five enhanced generics in `components/common/` — PageHeader (with the breadcrumbs slot F016 promised),
  EmptyState, ErrorState (`offline` flavour for §6.2f's retry UI), LoadingState (now the shell's pending state,
  and the nested Spinner's own live region is suppressed so the wait is announced once), StatusBadge
  (token-only colours). `AppShell` gained the optional `access` prop — the seam F032 fills. Honest correction:
  F016's entry said `AppBreadcrumbs` was "finished and tested"; the *trail builder* was, the renderer was not, so
  it gained a component test and the F017 placement rule (a single crumb repeats the page title — it renders
  from two up). Checks run: **262 tests across 35 files, all passing**; typecheck exit 0; build exit 0 (the
  placeholder page splits into its own chunk).
- **F016 — navigation registry.** `config/navigation.ts` now holds the whole navigation contract: `RouteDefinition`
  with the §4.7 metadata (including a `:param`-aware breadcrumb factory), `NavigationAccess` + `meetsAccess` as the
  single visibility rule, `visibleNavigation()` (drops empty groups — §4.8), `buildBreadcrumbs()` and
  `buildRouteObjects()`. The router's children are generated from it, pages load lazily (the build emits one chunk
  per page), and the shell filters **once** and passes the same list to the sidebar and palette
  (§4.10). New: `config/modules.ts` (compiled-in `AppModule` slot), `providers/access-provider.tsx` (fail-closed
  anonymous default; F031/F032 supply the real value), `common/permission-gate.tsx` + `secure-link.tsx` (UX only,
  §6.3d), `layout/command-palette.tsx` (Ctrl/Cmd+K; header trigger now renders), `layout/app-breadcrumbs.tsx`
  (finished and tested, **not mounted** — §5.2b gives PageHeader a breadcrumbs slot, so F017 places it).
  `docs/ROUTES_NAVIGATION.md` records the model, the registered route, the access rules and every planned page with
  its owning task. Also dropped one more dead `no-scrollbar` in `ui/command.tsx` (same reason as F015's sidebar).
  Test-round lesson: `<RouterProvider>{extra}</RouterProvider>` silently renders nothing — the extra UI must be
  inside a route element; recorded in `ARCHITECTURE.md` §12. Checks run: **233 tests across 32 files, all
  passing**; typecheck exit 0; build exit 0.
- **F015 — layout shell.** `ui/sidebar.tsx` came from the registry and took four corrections (all in its header
  comment): the §1.2 geometry (260px expanded / 64px rail / 260px drawer — generated defaults were 16rem/3rem),
  no cookie (the preference is the app's, in localStorage; nothing here is server-rendered), `no-scrollbar`
  dropped (that utility lives in `shadcn/tailwind.css`, which we do not import, so it styled nothing), and
  `relative` on the wrapper. That last one is a source bug **not** copied — the reference's `absolute -right-3`
  chevron has no positioned ancestor and escapes to the viewport edge. New `components/layout/`: `app-shell`
  (now the root layout route), `app-sidebar` (collapsible groups, persisted group state, active-row
  `aria-current` + `data-active`, scroll-into-view, rail tooltips, Ctrl/Cmd+B), `app-header` (64px, hamburger +
  brand below `md`), `context-switcher-slot` (§3.2a/ARCHITECTURE §7 — disabled renders nothing; enabled renders
  a working selector), `sidebar-preferences` (also the first-load viewport rule). The theme control moved into
  the header as a sun/moon menu keeping all three modes explicit. The header deliberately renders no search
  trigger, bell or avatar yet — their owners pass real handlers in F016/F046/F032; a dead control would violate
  "no inert buttons". Checks run: **196 tests across 29 files, all passing**; typecheck exit 0; build exit 0.
- **F014 — picker and command primitives.** `select`, `tabs`, `collapsible`, `command` and `calendar` came from the
  registry; **`date-picker` and `time-picker` are not registry items** (the reference hand-built both too), so they
  are composed here from Popover + Calendar and from hour/minute/period columns, with a new `src/lib/format-date.ts`
  storing ISO calendar days rather than `Date` objects. 26 components in `components/ui/`. **G-8 is fixed**: the
  Tooltip now supplies one `useId` per instance through a context, so the trigger's `aria-describedby` resolves to
  the popup's `id` — F013's reasoning that a dangling reference would be "worse than the omission" was over-cautious
  and is corrected in the record. **The generator reverted five more files** this time (`button`, `dialog`, `input`,
  `textarea`, `input-group`), so the whole correction pass is now a single command, `pnpm run fix:ui`. Findings that
  were my assumptions, not defects: Base UI Tabs uses **manual activation** (arrows move focus, Enter selects — a
  valid ARIA pattern); cmdk highlights the first match immediately; jsdom lacks `scrollIntoView` and pointer-capture,
  now shimmed. Checks run: **171 tests across 25 files, all passing**; typecheck exit 0; build exit 0.
- **F013 — overlay primitives** — Dialog, DropdownMenu, Popover, Tooltip, Sheet, ScrollArea with focus/escape tests;
  found that the registry's Tooltip set no `role="tooltip"` and that generators revert dependency components.
  _`git show 3ad6fe8`_
- **F012 — basic UI primitives B** — Card, Separator, Skeleton, Spinner, Progress, Avatar, Breadcrumb.
  _`git show def322e`_
- **Older:** F011 primitives A · F010 theme provider · F009 theme tokens · F008 PostgreSQL · F007 backend
  bootstrap · F006 frontend bootstrap · F005 structure · F004 architecture · F003 stack · F002 traceability ·
  F001 audit. _`git log`_

## 8. Commands — what you can run

Everything listed here works **today**. Each row names the task that made it available. Anything marked
*not yet* has no runner; it arrives with the task shown, and belongs to the owner of that task to add here.
The fuller table (including future suites) lives in `claude_code_pack/OPERATOR_GUIDE.md`.

### Start everything

| What | Command | What you should see |
|---|---|---|
| **Database** (F008) | `cd D:\resors; docker compose up -d --wait` | `resors-postgres  ... Healthy`, published on **5432** |
| **Frontend** (F006) | `cd D:\resors\frontend; pnpm run dev` | `VITE v8.3.4 ready` → open **http://localhost:5173**: `/` redirects to `/dashboard`, rendered **inside the shell** (sidebar + 64px header since F015); **Ctrl+K** opens the palette (F016) |
| **Backend API** (F007) | `cd D:\resors\backend; uv run uvicorn app.main:app --reload --port 8000` | `Application startup complete` → open **http://localhost:8000/docs** |
| **Frontend production build** (F006) | `cd D:\resors\frontend; pnpm run build; pnpm run preview` | serves the built app on **http://localhost:4173** |

All three can run at once (open three terminals). Stop each with `Ctrl+C`. If a port is busy, Vite auto-increments
and prints the real URL; uvicorn fails with a clear error.

**Database control** (F008):

| What | Command | Note |
|---|---|---|
| Stop, keep data | `cd D:\resors; docker compose down` | volume `resors_postgres_data` persists |
| Wipe and start clean | `cd D:\resors; docker compose down -v; docker compose up -d --wait` | **deletes all local data** |
| Logs | `cd D:\resors; docker compose logs -f postgres` | `Ctrl+C` to stop following |
| Open a SQL shell | `docker exec -it resors-postgres psql -U app -d app_dev` | password is in `.env` |

> **Port clash warning:** your other projects also want 5432 — `resourcelense-postgres-1` and `qtc360-db`
> (both currently stopped) publish `5432`. Only one can run at a time. Change `POSTGRES_PORT` in `.env` to run
> them side by side. Do not delete containers belonging to other projects.

### Check the work

| What | Command | Expected |
|---|---|---|
| Frontend types (F006) | `cd D:\resors\frontend; pnpm run typecheck` | exit 0, no output |
| Frontend build (F006) | `cd D:\resors\frontend; pnpm run build` | exit 0, writes `frontend/dist/` |
| **Frontend tests (F011–F017)** | `cd D:\resors\frontend; pnpm run test:run` | **262 passing** across 35 files |
| Frontend tests, watch mode | `cd D:\resors\frontend; pnpm test` | re-runs on save; `q` to quit |
| **Normalise generated UI (F014)** | `cd D:\resors\frontend; pnpm run fix:ui` | restores reverted components, remaps `cn`, strips `"use client"` (run after every `shadcn add`) |
| Frontend coverage | `cd D:\resors\frontend; pnpm run coverage` | prints the v8 report — **262 tests passing**, ~89% statements overall. The threshold gate is F055/F061's; corrected in F015 because the old "100%" claim overstated what this run prints |
| API liveness (F007) | `curl http://localhost:8000/api/v1/health` | `{"status":"ok","name":"Application Platform",...}` |
| **Layout shell (F015)** | open the app, then narrow the window (or use devtools device mode) through **1440px → 900px → 390px** | 1440: 260px sidebar + 64px header. 900: the sidebar starts as the 64px icon rail. 390: no pinned sidebar; a hamburger opens the 260px drawer (Escape closes it) |
| **Sidebar preference (F015)** | click the round chevron on the sidebar edge, then press **F5** | it stays collapsed after reload; console: `localStorage.getItem('app.sidebar')` → `"collapsed"` |
| **Nav behaviour (F015)** | inside the collapsed rail, hover the **Status** row; click the **Foundation** group label | the label appears as a tooltip in the rail; the group collapses/expands and the choice survives **F5** (`app.sidebar.groups`) |
| **Context slot is off (F015)** | look at the header on desktop | **no** context selector is rendered — the slot is disabled by default (BIG-PROMPT §3.2a); it appears only when a module injects an enabled adapter |
| **Command palette (F016)** | press **Ctrl+K** (or Cmd+K), or click the **Search anything** box in the header | the palette opens listing `Overview → Dashboard`; typing filters; **Enter** jumps to the highlighted page; **Escape** closes and focus returns to where it was |
| **Route states (F017)** | visit **`/`**, **`/admin`**, **`/nonexistent`**, **`/403`**, **`/404`** in turn | `/` lands on `/dashboard` — the protected placeholder, which says plainly that the real screen is F047; `/admin` shows the **403** page (no admin route is registered yet, so there is nothing to redirect to); any unknown path shows **404 inside the shell** (navigation still usable); `/403` and `/404` render those pages directly |
| **Nav filtering (F016)** | compare the sidebar with the palette, and inspect the registry in `docs/ROUTES_NAVIGATION.md` §2 | both list exactly the registered pages — today only **Status**. The Administration group is **absent, not empty**: its pages arrive in F034–F044, and an anonymous caller (no session until F032) may see none of them |
| **Theme persists (F010)** | open the app, click the **sun/moon button in the header**, choose **Light / Dark / System**, then press **F5** | the chosen theme is still applied after reload, with **no flash** of the other theme first |
| Inspect the stored theme (F010) | browser console: `localStorage.getItem('app.theme')` | `"light"`, `"dark"` or `"system"` |
| Force a theme by hand (F009) | browser console: `document.documentElement.classList.add('dark')` / `.remove('dark')` | page repaints; a dark scrollbar on a light page would mean the token theme is broken |
| Dependencies current | `cd D:\resors\frontend; pnpm install` · `cd D:\resors\backend; uv sync` | pnpm: "Already up to date" · uv: "Audited 64 packages" |

### Repository

| What | Command | Expected |
|---|---|---|
| History | `git -C D:\resors log --oneline` | one commit per completed task |
| Working tree | `git -C D:\resors status --short` | empty |
| Line endings | `git -C D:\resors ls-files --eol` | every file `i/lf  w/lf` |
| Review a task | `git -C D:\resors show --stat <sha>` | that task's files only |

### Not available yet

| Suite | Arrives with |
|---|---|
| Migrations (`alembic upgrade head`) | F023 |
| Backend unit tests (`uv run pytest`) | F026 (first tests) |
| Frontend lint / format | F055 |
| Backend lint / types (Ruff, mypy) | F056 |
| Postgres integration tests | F008 + F056 |
| End-to-end (Playwright) | F057 |
| Accessibility (axe) | F058 |
| Production Docker Compose | F059 |

Nothing in this table works yet — do not run it. Each row moves up into the sections above as its task lands.

## 9. Accounts and credentials

**No application accounts exist yet** — authentication arrives with F027 (bootstrap admin) and F033 (admin-created
users). This table is filled in from then on.

| Account | Email | Role(s) | Created by | Purpose |
|---|---|---|---|---|
| _(none yet)_ | | | | |

**Passwords are never written here** — this file is committed. The values live in the git-ignored
`D:\resors\LOCAL_CREDENTIALS.md`, which also explains how each account is created. Local database credentials
live in `.env` (also git-ignored).
