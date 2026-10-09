# REPOSITORY AUDIT AND AVAILABILITY — task F001

Audit date: 2026-10-08 (local). Scope: workspace `D:\resors`, the directory Claude Code was launched in.
Authority: `claude_code_pack/CLAUDE_MASTER.md`, `PRODUCT_SPEC.md`, `TASKS.md` (F001).

Revision note: first pass ran with `BIG-PROMPT.txt` absent. The operator supplied it afterwards; sections 3, 4
and 9 were added or rewritten in that revision. On further operator instruction both supplied reference inputs
were then **relocated out of the project folder** to `D:\RESORS_REFERENCE\` (section 7); hashes and archive
integrity were re-verified at the new location and are unchanged. Neither file's content was modified in any pass.

## Method and limits

Read-only inspection. The QTC360 archive was **not extracted to disk and no code from it was executed**.
Selected members were streamed with `unzip -p` (stdout only). No network access, no installs, no repository
writes other than this document and the `STATE.md` update. Every statement below is traceable to a command
in section 10. Anything not observed is marked as not verified.

## 1. Workspace inventory

| Path | Type | Size (bytes) | SHA-256 |
|---|---|---|---|
| `D:\RESORS_REFERENCE\qtc360-main.zip` | file, outside project folder | 1,525,087 | `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05` |
| `D:\RESORS_REFERENCE\BIG-PROMPT.txt` | file, outside project folder | 82,056 | `7c97b4eb649317e7e23766de6e1a354101fcb05270427d5ea54afedefd91a2f2` |
| `claude_code_pack/CLAUDE_MASTER.md` | file | 7,199 | not hashed (pack content, not evidence) |
| `claude_code_pack/PRODUCT_SPEC.md` | file | 13,832 | not hashed |
| `claude_code_pack/TASKS.md` | file | 33,774 | not hashed |
| `claude_code_pack/DECISIONS.md` | file | 4,905 | not hashed |
| `claude_code_pack/OPERATOR_GUIDE.md` | file | 2,967 | not hashed |
| `claude_code_pack/STATE.md` | file | 2,618 | not hashed |
| `docs/REPOSITORY_AUDIT.md` | file | this document | created by F001 |

`BIG-PROMPT.txt` is 622 lines, UTF-8, CRLF line endings, with very long table rows. Both supplied reference
inputs now live **outside the project folder** in `D:\RESORS_REFERENCE\`, so the project tree holds only the
instruction pack and `docs/` — nothing that must be excluded from version control. Later tasks read those two
files by absolute path.

The workspace contains **no application source, no build configuration and no dependency manifests**. There is
nothing yet to typecheck, lint or test; F001's verification is therefore evidence-based, not test-based.

## 2. Presence matrix for referenced material

| Item | Referenced by | Status |
|---|---|---|
| QTC360 source ZIP | `BIG-PROMPT.txt` §0/§1, "Maintainer notes"; `CLAUDE_MASTER.md` | **PRESENT** — `D:\RESORS_REFERENCE\qtc360-main.zip` (outside the project folder) |
| Master prompt text | `CLAUDE_MASTER.md` mission; `OPERATOR_GUIDE.md` setup; F002 requirement source | **PRESENT** — `D:\RESORS_REFERENCE\BIG-PROMPT.txt` (supplied after first pass, then relocated) |
| Git repository | `OPERATOR_GUIDE.md` workflow (`git diff`, manual commits) | **ABSENT** — `git rev-parse` reports "not a git repository" |
| Extracted QTC360 source tree inside the workspace | — | **ABSENT** (archive only; not required) |

### Missing-reference note

1. **No supplied requirement or reference input is missing any longer.** `BIG-PROMPT.txt` line 619 states the
   two inputs a coding agent needs are "the QTC360 ZIP and this prompt"; both are present, in
   `D:\RESORS_REFERENCE\` outside the project folder. A scan of the prompt for other external inputs found
   **none** — the only URL is the placeholder `https://yourdomain.example`, and the "screenshots" it mentions
   (§5.5, §10.4) are Playwright baselines the agent generates itself, not supplied assets.
2. **Filename difference, not a content difference.** The prompt calls the reference `qtc360-main(2).zip`
   (line 43); the file present is `qtc360-main.zip`. Content cross-verification (section 4) shows a match on
   every checkable claim, so this is a download-name artifact. If a second copy named `qtc360-main(2).zip`
   exists elsewhere, it is not needed — the present archive is complete and internally consistent with §1.
3. **No git repository exists.** The one-task protocol depends on operator-side `git diff` review and manual
   commits. Initialisation and the first commit are operator actions; F001 did not run `git init`.
4. **The pack is not at the workspace root** but in `claude_code_pack/`, whereas `OPERATOR_GUIDE.md` says to
   place the pack "at the root of your new repository". Consequence: paths in the pack's instructions are
   relative to a root that does not yet exist. Flagged, not resolved — F005 defines the real structure.
   Note that `docs/` at the workspace root *is* corroborated: `BIG-PROMPT.txt` §11.7/§14 and `TASKS.md`'s gate
   text both refer to `docs/…` paths at the project root, so this document's location is correct.

## 3. Supplied master prompt — status and role

`BIG-PROMPT.txt` is the origin of the foundation requirements: 15 numbered sections (`# 0` non-negotiable
execution instructions through `# 14` required output — execution rules, verified source map, stack, exclusions,
page tree/routing/route states, design system and component work packages, identity/auth/sessions/security,
reusable end-to-end features, backend architecture/schema/API contract, frontend architecture, testing,
Docker/Caddy/operations, ordered phases and gates, definition of done, required output), plus a required
document set and maintainer notes.

Its stated relationship to the pack matches `CLAUDE_MASTER.md`: the pack is the *authoritative operational*
contract (one task at a time, `PRODUCT_SPEC.md` as functional contract, `DECISIONS.md` register), and the
long prompt is background evidence that must **not** be executed as a single run ("Do not repeatedly paste or
re-read all of `BIG-PROMPT.txt`"). The prompt itself is explicit that its "as-of audit examples … are not
implementation-time guarantees" and that versions must be revalidated — consistent with the pack's F003.

Two operational instructions inside the prompt are already satisfied or superseded:

- "Supply the QTC360 ZIP and this prompt together to the coding agent" — satisfied as of this revision.
- "The QTC360 source archive includes historical hard-coded *development* users/passwords. They are **not**
  safe target defaults and must not be imported" (line 621) — **independently corroborated**: the archive
  contains `backend/db_dump/users.csv` whose header includes `hashed_password` and `password_reset_at`
  (5 data rows), plus `employees.csv`, `roles.csv`, `permissions.csv`, `user_roles.csv`, `user_projects.csv`.
  This strengthens the do-not-transplant rule in section 6.

Where the prompt and the pack differ in granularity, the pack governs execution: the prompt describes 8 phases
(§12), while `TASKS.md` decomposes the same work into F001–F063 / D001–D091 micro-tasks. No conflict was found
between the two on stack, exclusions, security or acceptance bar.

## 4. Cross-verification: does the archive match the prompt's source map?

The prompt's §1 inventory claims to be "evidence-backed" and instructs the agent to "reinspect the files
locally before building". That reinspection was performed at metadata/claim level (existence, counts, values)
— not a code review, which later tasks will do.

| Prompt claim | Check performed | Result |
|---|---|---|
| Root folder `qtc360-main/`, archived 2026-06-17 | archive listing | **Match** — single root, all entries `2026-06-17 22:06` |
| `frontend/package.json`: Next 16.2.6, React 19.2.4, TS 5, `next-themes` | streamed manifest | **Match** |
| `backend/pyproject.toml`: Python ≥3.12, FastAPI, async SQLAlchemy 2, asyncpg, Pydantic 2, Alembic, uv | streamed manifest | **Match** |
| 29 named `frontend/src/components/ui/*.tsx` primitives, exact list | count + name comparison | **Match** — 29 files, identical names |
| 7 `frontend/src/components/data-table/*` files | count | **Match** — 7 files (+ `index.ts`) |
| Nav registry at `frontend/src/config/navigation.ts` | path existence | **Found** |
| `frontend/src/lib/api.ts`, `frontend/src/hooks/*` | path existence | **Found** |
| `backend/app/api/v1/{auth,admin}.py`; models `user,rbac,audit_log,user_preference,notification,app_setting`; services `storage,pdf,pdf_merge` | path existence | **All found** |
| Login background `login-bg[-light].svg` | path existence | **Found** (both) |
| Theme values: light bg `oklch(0.995 0 0)`, fg `oklch(0.145 0 0)`, card `oklch(1 0 0)`, primary `oklch(0.488 0.243 264.376)`; dark bg `0.13`, card `0.2`, border `0.28`; `--radius: 0.5rem` + derived tokens; `@custom-variant dark (&:is(.dark *))` | streamed `globals.css` | **Match on every value** |
| Migrations under `backend/migrations/versions/*` | count | **34 revision files** (prompt gives no number) |
| Tests at `backend/tests/e2e/*` | listing | **Found** (suite present) |
| CI at `.github/workflows/{ci,deploy}.yml` | listing | **Found** — exactly those two |
| Compose uses `postgres:16-alpine`; production Gotenberg `:8` but "an older CI service entry says `:7` (a documented inconsistency)" | streamed compose + CI | **Match and confirmed** — `docker-compose.yml`/`.prod`/`.e2e` use `gotenberg/gotenberg:8`, `ci.yml` uses `gotenberg/gotenberg:7` |

The prompt's source map is accurate for every claim checked, including the inconsistency it self-discloses.
**Conclusion: the archive in the workspace is the snapshot the master prompt describes.** No claim was found
that the archive fails to support. Claims about visual geometry and component APIs were not verified here —
they are not checkable from a file listing and belong to the F009–F016 design work.

## 5. QTC360 archive evidence

| Property | Observed value |
|---|---|
| Location | `D:\RESORS_REFERENCE\qtc360-main.zip` (outside the project folder; section 7) |
| File name | `qtc360-main.zip` |
| Size | 1,525,087 bytes (uncompressed content: 4,080,289 bytes) |
| SHA-256 | `f888e940506fc270cfd69d299cd2444eab64c089389e17e88ae6facbe36bfa05` |
| Integrity test | `unzip -t` → exit 0, "No errors detected in compressed data" |
| Entries | 517 total (420 files, 97 directories) |
| Entry timestamps | all `2026-06-17 22:06` — one snapshot, no incremental history |
| Archive comment | `83dcb59f2565e1f9d92f91570cefd9fe5fe087e5` (40 hex chars, shape of a git object id; provenance **not verified**) |

### Structure

| Area | Files | Contents |
|---|---|---|
| `frontend/` | 252 | Next.js App Router app (`src/app/(dashboard)`, `src/components/{ui,layout,form,data-table,providers,approval,qaqc,loaders}`), `src/config/navigation.ts`, `src/lib/*`, `src/hooks/*`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, Dockerfile |
| `backend/` | 236 | FastAPI app (`app/{api,core,models,schemas,repositories,services}`), `pyproject.toml`, `uv.lock`, `alembic.ini`, `migrations/versions/` (34 revisions), `tests/` (incl. `tests/e2e/`), Dockerfile(s), `db_dump/` (29 CSVs), `app/fonts/` (9 TTF), `.venv_old/pyvenv.cfg` |
| `scripts/` | 4 | `run_e2e.ps1`, `run_e2e.sh`, `fix_tags_recalculate.py` |
| `.github/workflows/` | 4 | `ci.yml`, `deploy.yml` |
| `docs/` | 3 | `claude-map.md`, `claude-workflows.md` |
| `.claude/`, `frontend/.claude/` | 6 | agent settings/commands, `CLAUDE.md` files |
| root | 11 | `README.md`, `CLAUDE.md`, `PR1_RESUME_PROMPT.md`, `Caddyfile`, `docker-compose{,.e2e,.prod}.yml`, `.env.example`, `.gitignore`, `.dockerignore`/`.gitattributes`, `.claudeignore` |

### Stack evidence (reference only — target versions are F003's job)

- `frontend/package.json`: **Next.js 16.2.6**, React 19.2.4, TypeScript 5, Tailwind CSS 4, `@base-ui/react` 1.5.0,
  shadcn 4.8.0, TanStack Query 5 / Table 8.21.3 / Virtual 3.14.2, React Hook Form 7, Zod 4, Axios, Recharts,
  Lucide, `date-fns` 4.1.0, `react-day-picker` 9.6.4, `next-themes`, `@dnd-kit/*`, `react-pdf`, `cmdk`, `sonner`.
- `backend/pyproject.toml`: `requires-python >=3.12`; FastAPI `>=0.136.3`, SQLAlchemy 2 async + asyncpg, Alembic,
  Pydantic 2, pydantic-settings, `passlib[bcrypt]`, `python-jose[cryptography]`, ReportLab, OpenPyXL, pypdf,
  PyMuPDF, docxtpl, Pillow, pytesseract, dateparser, pytest/pytest-asyncio, uv lockfile.
- Deployment artifacts present: Dockerfiles, `docker-compose{,.prod,.e2e}.yml`, `Caddyfile`.

**Material divergence from the mandated stack:** the reference frontend is **Next.js (App Router, SSR server
components)** whereas `CLAUDE_MASTER.md` and `BIG-PROMPT.txt` §0.5 both mandate **React + Vite SPA** and forbid
Next.js; Redis is likewise excluded by the prompt (§0.6) as a target-state prohibition, not a source feature.
Frontend routing, data-fetching and layout patterns in the archive are therefore structurally non-portable;
component-level, DataTable, form-framework and backend patterns are the reusable references.

### Domain evidence

`README.md` self-describes the archive as an **"Enterprise QA/QC + Commissioning Management Platform"** with
document approval rounds, checklists, signatures, assets, contractors and projects. It is a *different vertical*
from this project (construction manpower deployment / tender & awarded-project forecasting / manpower cost).
This confirms the pack's and the prompt's premise that the archive is used as a **domain-neutral enterprise
foundation** source, not as a domain to migrate.

### Sensitive or non-portable content found

- `backend/db_dump/` — 29 CSV exports of a populated database, including `users.csv` (header contains
  `hashed_password`, `password_reset_at`; 5 data rows), `employees.csv`, `permissions.csv`, `roles.csv`,
  `user_roles.csv`, `user_projects.csv`. Treated as real credential/PII-bearing material; **not read beyond the
  header row and not copied**. `BIG-PROMPT.txt` line 621 independently warns about exactly these.
- `backend/seed.py`, `seed_demo.py`, `seed_commissioning.py`, `reset_password.py`, `purge_documents.py`,
  `_chk.py`, `backend/.venv_old/pyvenv.cfg` — seed/bootstrap and environment residue.
- `backend/app/fonts/` — 9 decorative TTF signature fonts (~1.4 MB of the archive) tied to the reference's
  signature-capture feature.
- `.env.example` — key names only were inspected (`POSTGRES_*`, `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
  `REFRESH_TOKEN_EXPIRE_DAYS`, `NEXT_PUBLIC_API_URL`, `PGADMIN_*`); no values are present and nothing is reused.
- `.claude/`, `frontend/.claude/`, both `CLAUDE.md` files, `PR1_RESUME_PROMPT.md` — another project's agent
  configuration and working notes.

## 6. Do-not-transplant list

QTC360 branding, names, logos, favicons and README text (prompt §0.2); its `CLAUDE.md`/`.claude` agent config
and prompt notes; the `db_dump` CSVs and any seed credentials, demo accounts or development passwords (prompt
§0.7, line 621); its business-domain models, routes and screens — documents/approval rounds, QA forms,
commissioning, checklists, assets, disciplines, contractors, clients, signatory/delegation rules, report
numbering, drawing bundles (prompt §3.1); the signature fonts; `run_e2e` scripts and QTC360 VPS
paths/hostnames/accounts (prompt §11.6); and its lock files as an authoritative version source. Lock files may
be read only as evidence of what a comparable stack once resolved; actual target versions are established in F003.

## 7. Reference-material location — operator decision, applied

The operator decided the reference inputs must not sit inside the project folder. Both were moved by rename to
a new folder outside the project:

| File | New absolute path |
|---|---|
| `qtc360-main.zip` | `D:\RESORS_REFERENCE\qtc360-main.zip` |
| `BIG-PROMPT.txt` | `D:\RESORS_REFERENCE\BIG-PROMPT.txt` |

Verified after the move: both SHA-256 values identical to the pre-move values recorded in section 1 (so the
move was byte-exact), and `unzip -t` on the archive at its new path returned exit 0, "No errors detected".

Consequences to carry forward:

- **F005 no longer needs to ignore the archive or the prompt** — neither is in the project tree. The ignore
  rules still need to be written for ordinary build artefacts, but the untrusted-archive exclusion is moot.
- Later tasks that need the master prompt or the reference source read them by absolute path
  (`D:\RESORS_REFERENCE\…`); `CLAUDE_MASTER.md`'s instruction to inspect the ZIP "if actually present in the
  workspace" is satisfied by this located, verified copy.
- `OPERATOR_GUIDE.md`'s advice to place the pack "alongside the original `BIG-PROMPT.txt`" is now moot; the
  pack stays where it is. The guideline was not edited — it is the operator's contract document.
- The files remain untrusted reference material wherever they live: still not to be executed, not to be
  transplanted, and `D:\RESORS_REFERENCE\` is outside the repository, so it can never be committed.

## 8. Toolchain availability observed (verification deferred to F003)

Observed on this machine; **compatibility is not asserted here**.

| Tool | Observed |
|---|---|
| git | 2.49.0.windows.1; identity configured (`Lilian Burdianov <lilian.burdianov@gmail.com>`) |
| node / npm | v24.14.0 / present |
| uv | present (`~/.uv/uv`) |
| Python | `py -0`: 3.14 (default), **3.12** and 3.10 installed; uv-managed 3.12.12 and 3.14.0 present |
| unzip | present (Git Bash / MSYS2) |

The mandated `Python >=3.12` is satisfiable locally. Postgres/Docker availability was **not** checked — that
belongs to F008.

## 9. Required documentation set implied by the prompt (input to F002)

`BIG-PROMPT.txt` §11.7 and §14 require these project-root documents: `README.md`, `docs/ARCHITECTURE.md`,
`docs/ROUTES_NAVIGATION.md`, `docs/STACK_VERSIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`,
`docs/BACKUP_RESTORE.md`, `docs/ADDING_A_MODULE.md`, `docs/TESTING.md`, `docs/REFERENCE_PARITY.md`,
`docs/OPENAPI_CLIENT.md`, plus `docs/IMPLEMENTATION_LOG.md`. `TASKS.md` names only `STACK_VERSIONS` (F003) and
`IMPLEMENTATION_LOG` (gate text) explicitly; `PRODUCT_SPEC.md` requires setup/migration/bootstrap/
backup-restore documentation. **F002's traceability table should show where each of these is produced**, so no
required document is silently dropped. Recorded here as an observation, not implemented.

## 10. Reproducible evidence commands

```bash
REF="D:/RESORS_REFERENCE"        # reference inputs live outside the project folder (section 7)
Z="$REF/qtc360-main.zip"
cd /d/resors
unzip -t "$Z"                                 # integrity → exit 0
sha256sum "$Z"                                # hash
sha256sum "$REF/BIG-PROMPT.txt"               # hash
unzip -Z1 "$Z" | wc -l                        # 517 entries
unzip -Z1 "$Z" | awk -F/ 'NF>2 {print $2}' | sort | uniq -c   # per-area file counts
unzip -Z1 "$Z" | grep -cE 'frontend/src/components/ui/.*\.tsx$'   # 29
unzip -Z1 "$Z" | grep -cE 'frontend/src/components/data-table/.*\.tsx$'  # 7
unzip -p "$Z" qtc360-main/README.md | head -30                # self-description
unzip -p "$Z" qtc360-main/backend/pyproject.toml              # backend stack
unzip -p "$Z" qtc360-main/frontend/package.json               # frontend stack
unzip -p "$Z" qtc360-main/frontend/src/app/globals.css | grep -nE '^\s*--(background|primary|radius)'  # theme tokens
unzip -p "$Z" qtc360-main/docker-compose.yml | grep image:    # postgres:16-alpine, gotenberg:8
unzip -p "$Z" qtc360-main/.github/workflows/ci.yml | grep image:  # gotenberg:7 (inconsistency)
unzip -p "$Z" qtc360-main/backend/db_dump/users.csv | head -1 # header row only
grep -cE '^# [0-9]+\. ' "$REF/BIG-PROMPT.txt"                # 15 top-level sections (§0–§14)
git rev-parse --is-inside-work-tree           # "not a git repository"
py -0                                         # installed Python versions
```

## 11. Out-of-scope observations for the operator

- A sibling directory `D:\QTC360` exists **outside** the project folder and is a separate QTC360 working area
  (logo/design assets, `docs/`, `Workshop/`, `QAQC Documents/`, and its own `qtc360/` subfolder). It was not
  inspected and is **not needed**: the relocated archive verified against every checkable claim in
  `BIG-PROMPT.txt` §1, so no task should depend on that copy. It was left untouched.
  *(Update 2026-10-10, operator instruction: `D:\QTC360\qtc360\` is now the designated readable reference
  tree — the extracted app to take hints from (e.g. production Docker). The rest of `D:\QTC360\` stays out of
  scope. See `NEXT_PROMPT.md` §2.)*
- `docs/` was created at the project root by this task so the audit has a home; F005 owns the final structure
  and may relocate the file. Section 2.4 records why the root location is the right default.
- The reference inputs were relocated to `D:\RESORS_REFERENCE\` at operator instruction after the audit was
  first written — see section 7 for the verified move and its consequences.

## 12. F001 conclusion

The project folder contains the instruction pack and this audit document; the two supplied reference inputs —
the master prompt and the QTC360 archive — are present, hash-verified and intact, but deliberately located
outside the project folder in `D:\RESORS_REFERENCE\`. There is no application code and no version control yet.

`TASKS.md` F001 acceptance — "evidence inventory and missing-reference note" — is met:

- **Evidence inventory:** sections 1, 5 (workspace and archive, hashed and reproducible).
- **Missing-reference note:** section 2 — nothing requested by the master prompt is missing; the only residual
  gaps are operational (no git repository; pack not at the final repo root).
- **Inspection of the reference (task instruction "inspect only if present"):** performed read-only. The archive
  is confirmed to be the snapshot `BIG-PROMPT.txt` §1 describes, its stack/domain divergences from the mandated
  target are recorded, and its sensitive and non-portable content is identified before any code is written.
