# DOMAIN ARCHITECTURE — task D001

The map Stage B builds against: the bounded modules, the data model they share, and the actions each of them
authorizes — written **before the first domain table exists**, so that D002–D091 add tables to a plan rather
than arrive at one.

**D001 ships no code.** No table, no route, no permission code, no navigation entry — because each would be a
claim with no consumer, and both of the two shapes this foundation already forbids would be created by adding
them early: a nav group whose page does not exist is the dead link `ROUTES_NAVIGATION.md` §1 forbids, and a
permission code no route enforces is a code the roles matrix (F036) would offer an operator as if it did
something. The machine copy of the vocabulary is `app/core/permissions.py` (F027) and it gains its first domain
member in the task that enforces it — `ADDING_A_MODULE.md` §1 names the codes first *for its own module*, not
for the whole product. Verified 2026-10-10, at this commit: `APP_MODULES` is `[]`
(`frontend/src/config/modules.ts`), `PermissionCode` carries no domain member, `uv run alembic heads` reads
`0009 (head)`, and `ARCHITECTURE.md` §8 ends with "No domain table is created in Stage A."

## 1. The module boundaries

A module is a bounded feature area with its own tables, its own permission namespace and its own screens —
compiled in, registered through the one frontend registry, and implemented as ordinary routers with
server-side guards (`ADDING_A_MODULE.md`). Nine areas, in the order the task list takes them:

| Module | Owning tasks | Tables it owns | Screens (planned) | Permission namespace |
|---|---|---|---|---|
| `masters` | D002–D006, D011–D013, D018 | `disciplines`, `departments`, `designations`, `employees` | `/masters/{disciplines,departments,designations}`, `/employees` | `disciplines.*`, `departments.*`, `designations.*`, `employees.*` |
| `rates` | D014–D017 | `designation_rates`, `employee_rates` | `/rates` (history grids) | `rates.*` |
| `projects` | D007–D010, D019 | `projects`, `cost_centres`, `project_memberships` | `/projects`, `/projects/:id` | `projects.*` |
| `forecasts` | D020–D039 | `forecasts`, `forecast_revisions`, `forecast_positions`, `forecast_position_months` | `/projects/:id/tender`, `/projects/:id/awarded` | `forecast_tender.*`, `forecast_awarded.*` |
| `actuals` | D040–D063 | `assignments`, `assignment_shares`, `transfer_requests`, `transfer_request_events`, `leave_records`, `employee_events` | `/assignments`, `/transfers`, `/leave` | `assignments.*`, `transfers.*`, `leave.*` |
| `costing` | D054–D057, D064–D070 | `project_month_actuals`, `cost_recalculation_runs`, `cost_recalculation_changes` | `/reports/project-cost`, `/reports/cost-at-completion` | `costs.*` |
| `consolidation` | D071–D079 | **none** — it aggregates and writes nothing | `/consolidation`, `/consolidation/reports` | `consolidation.*` |
| — authorization | D080–D082 | none of its own: it extends the foundation's `roles`/`permissions` rows and implements `ScopePolicy` | — | the vocabulary itself |
| — cross-cutting | D083–D091 | none: audit vocabulary, contract, suites, gates, performance, release | — | — |

The last two rows are deliberately **not** modules: authorization changes how every module is reached rather
than adding an area of its own, and D083–D091 change the whole application's contracts. A "module" here means
something that can be added or removed without the others noticing, which is exactly what F063 proved
(`docs/FOUNDATION_REPORT.md` §2).

Every module takes the same shape, so this map does not repeat it per row — `ADDING_A_MODULE.md` §2 is the
recipe: model + migration (`UUIDPrimaryKeyMixin`/`TimestampMixin`), schema, service (with `audit.record`
inside the caller's transaction), guarded router, registration in `app/api/v1/router.py`; and on the frontend
one `AppModule` in `frontend/src/config/modules.ts` whose routes carry the **same** codes the API enforces.
The paths each task chooses are its own; where a name here and a name in the tree disagree, the tree wins and
this document is corrected in that task's commit (§5).

### What may depend on what

The boundary that matters is the **write** direction, because a module that writes another module's tables is
not a module — it is a second owner of the same facts, and the first divergence between them is a defect
nobody can place:

| Module | Reads | Writes | Never |
|---|---|---|---|
| `masters` | — | its own four tables | reads no domain table at all — it is the root |
| `rates` | `masters` | its own two tables | invents a rate for a designation that has none; resolves a missing rate silently |
| `projects` | `masters` | its own three tables | deletes a project that has forecasts or assignments (identity is preserved, not recycled) |
| `forecasts` | `masters`, `rates`, `projects` | its own four tables | carries an employee id on a tender row; mutates a published revision |
| `actuals` | `masters`, `rates`, `projects` | its own six tables | **writes `forecasts`** — O09's recommendation is that a transfer does not rewrite a plan; D064 shows the discrepancy and D065 offers the explicit reconciliation |
| `costing` | everything above | `project_month_actuals`, its version tables | computes an actual cost from a forecast percentage (PRODUCT_SPEC §7); keeps an employee-month ledger |
| `consolidation` | everything above | **nothing** | offers an inline mutation ("read-only means no hidden inline mutations", §9) |

This is the boundary D081 makes enforceable in SQL and D085's tests assert across modules; recorded here so
that a later task needing a cross-module write has to say so out loud rather than import a service.

## 2. The ERD

The foundation's own tables (`users`, `roles`, `permissions`, `audit_logs`, `file_assets`,
`notifications`, `user_preferences`, `app_settings`, `sessions`) are described in `ARCHITECTURE.md` §8 and are
not repeated. Domain tables hang off exactly two of them: `users` (who may act) and, for generated documents,
`file_assets`. `──<` is one-to-many; `UQ` is a unique constraint; `[Ox]` is an OPEN decision that moves the
shape (§4).

```text
MASTERS (D002–D006, D011–D013)
disciplines (code UQ, name, active)
departments (code UQ, name, classification HEAD_OFFICE|SITE, active)
designations (code UQ, name, department_id → departments, discipline_id → disciplines, active)
employees (employee_id UQ, full_name, designation_id → designations, status, hire/end dates)
    └─ user_id → users.id      NULLABLE, UNIQUE — a login link, not an identity (§3)
    a designation's department and discipline are single-valued (§3 of the spec)

RATES (D014–D017)
designations ──< designation_rates   (rate_per_hour NUMERIC, effective_from, ends where the next row starts)
employees    ──< employee_rates      (rate_per_hour NUMERIC, effective_from, …) — overrides when effective

PROJECTS (D007–D010, D019)
projects (code UQ, name, status tender|awarded, start_date, contractual_completion, forecast_completion,
          responsible_user_id → users NULLABLE)
    one row for a project's whole life: awarding it does not create a second project (§5 of the spec — the
    tender is where it came from, the awarded plan is what it has now)
cost_centres (kind HEAD_OFFICE|PROJECT, project_id → projects UQ when kind = PROJECT, name)
    exactly one HEAD_OFFICE row; every project has exactly one — no invented legal entities or currencies
project_memberships (project_id, user_id, UQ together)   the row ScopePolicy reads (D019 → D081)

FORECASTS (D020–D039)
forecasts (project_id → projects, kind TENDER|AWARDED, at most one of each per project)
    └─< forecast_revisions (revision_no, status draft|published, created_by, published_at)      [O04]
          └─< forecast_positions (stable UUID, department_id, designation_id,
                  employee_id → employees NULLABLE — CHECK: NULL on a TENDER revision,
                  start_date, end_date, display_order)          duplicate designation rows allowed
                └─< forecast_position_months (month, percentage NUMERIC, source DEFAULT|MANUAL|COPIED)
                      UQ (position_id, month)      the cell's provenance survives a date change (§4 of spec)

ACTUALS (D040–D063)
employees ──< assignments >── cost_centres   (start_date, end_date NULLABLE + provisional flag)     [O07]
    ├─< assignment_shares >── cost_centres   (effective-dated slices; the day's shares sum to 100)  [O06]
    └─ a transfer closes one and opens the next in one transaction (D047) — never an overlapping pair
transfer_requests (employee_id, source_cost_centre_id, destination_cost_centre_id, effective dates,
                   reason, status, requester_id → users)
    └─< transfer_request_events (actor_id → users, at, from_status, to_status, note)   the approval history
leave_records (employee_id, leave_type, start_date, end_date, status)          inclusive both ends
employee_events (employee_id, kind: shift|secondment|hire|return|demobilisation|termination, effective_from)

COSTING (D054–D057, D064–D070)
projects ──< project_month_actuals (month, amount_aed NUMERIC, calculation_version, computed_at)
    the AGGREGATE is the ledger. There is deliberately no employee-month actual-cost table (§7 of the spec);
    per-employee intermediates exist during a calculation and are not persisted as a ledger
    └─< cost_recalculation_changes (before, after, actor_id → users, at, reason)   D057's visible diff
cost_recalculation_runs (requested_by, cutoff_month, status, started_at, finished_at)
```

### The rules the schema carries

The requirements that are constraints rather than conventions, and where each one lands:

| Rule (source) | Where it is enforced | Owner |
|---|---|---|
| Business codes are unique (`disciplines`, `departments`, `designations`, `projects`, `employees.employee_id`) | a unique constraint on the code column, not a service check | D002–D004, D007, D011 |
| A rate row's validity ends where the next begins; no overlap, no duplicate effective date | an exclusion constraint over `daterange(effective_from, effective_to, '[)')` per resource (PostgreSQL needs `btree_gist` for the equality half — the migration adds the extension or the task records why it did not) | D014, D015 |
| Money and rates are `NUMERIC`/`Decimal`, never float; percentages are decimal with a stated scale and rounding rule | column types, plus the arithmetic in D025/D055 | D014, D025, D055 |
| A tender position row carries no employee | `CHECK (kind = 'AWARDED' OR employee_id IS NULL)` — the revision's kind, not the caller's claim | D021 |
| A designation's department and discipline are single-valued unless explicitly revised | two non-null FKs, one row per designation | D004 |
| No employee-month actual-cost ledger; project-month aggregates only | asserted by the absence of the table **and** by a test, because a rule proved by a missing table is a rule nobody can see | D056 |
| Missing end date is never "complete" | `end_date IS NULL` requires the provisional flag (`[O07]` — the column set cannot be finalised before it is answered) | D040 |
| Daily shares for one employee never exceed 100% across projects | a service check inside the transaction plus a test — SQL cannot express the sum over a day's slices in a constraint | D050, D052 |
| No overlapping full-time assignments for one employee | an exclusion constraint over the date range — **and it cannot be written before O06 and O12 are answered**, because shared assignments make overlap legal and O12 decides whether ranges are `[]` or `[)` | D040 |
| At most one published revision per forecast feeds reporting | a partial unique index (`WHERE status = 'published'`) — **shape depends on O04** | D029, D031 |

**Migration numbering.** The next revision is always `max(head) + 1` from the directory
(`ARCHITECTURE.md` §9), hand-numbered so it reads in order. This map reserves no numbers: a reservation the
tree does not honour is drift, and the first task to add a table (`D002`) takes `0010`. D001 adds no revision,
so the head stays `0009` until D002 lands — deliberate, and worth knowing before any later check reads
`alembic current` and wonders where the domain went.

## 3. The action/scope matrix

The actions each module authorizes, the scope each one is limited by, and the task that owns it. The **codes
are the plan** — `ADDING_A_MODULE.md` §1's convention (`resource.action`, lowercase, specific verbs, never a
wildcard) applied to the domain, with the managing verb chosen per resource. D080 registers them with
descriptions and role bindings; until a task enforces one, it exists only here.

Four scope kinds, and the dimension they add to the usual role→permission answer
(`ARCHITECTURE.md` §6, BP-6.3):

| Scope | Means | Resolution |
|---|---|---|
| `global` | the action has no project dimension | the code alone |
| `project` | the caller may act only on projects they are a member of or oversee | `ScopePolicy` (D081), membership read in SQL from `project_memberships` — role membership alone never authorizes an unrelated project (§10 of the spec) |
| `own-project` | the caller is the **responsible person** of the project the action touches | resolved against `projects.responsible_user_id` **as of the effective date**, not as of the request (§7 of the spec) |
| `self` | the caller's own rows only | the SQL predicate, the way `notifications.manage_own` already works (F045) |

| Action | Planned code | Scope | Owning task | Notes |
|---|---|---|---|---|
| View disciplines / departments / designations | `disciplines.read`, `departments.read`, `designations.read` | global | D005 | one `.read` per resource; the masters are not sensitive |
| Edit a discipline / department / designation | `*.manage` for each of the three | global | D005 | the spec asks for a "safe administrative editing policy" — deactivation over deletion where a row is referenced |
| View the employee directory | `employees.read` | project **or** global | D012 | O16 does not gate the directory, but the screen shows rates only behind `rates.read` |
| Create / edit an employee | `employees.create`, `employees.update` | project | D012 | "sensitive field scope tests" is D012's own acceptance |
| Deactivate an employee | `employees.deactivate` | project | D012 | never a delete: history is the point of the record |
| Bulk-import masters | `employees.import`, `designations.import` | global | D018 | the import is atomic — a bad row rolls the file back |
| View rate history | `rates.read` | **O16** | D016 | the *values* are the sensitive part; the spec's "least privilege" applies |
| Edit rate history (effective-dated) | `rates.manage` | global | D016 | no overlap, no duplicate effective date, no silent retroactive rewrite |
| View projects | `projects.read` | project | D008 | |
| Create / edit a project, its lifecycle status | `projects.create`, `projects.update` | project | D008 | awarding preserves identity (D033) |
| Set a project's responsible person | `projects.responsibility` | global | D019 | the row `own-project` resolves against |
| View a tender plan / an awarded plan | `forecast_tender.read`, `forecast_awarded.read` | project | D021, D035 | two codes, not one: the spec distinguishes tender edit from awarded forecast edit |
| Edit a plan, its rows, its cells | `forecast_tender.edit`, `forecast_awarded.edit` | project | D021, D035 | |
| Import a plan from Excel | `*.import` on the two | project | D028, D036 | preview, validation, atomic |
| Create a revision, publish one | `*.publish` | project | D029, D030 | the immutable-published policy is O04's |
| Export a plan (A3/A4 PDF) | `reports.generate` **and** the module's `.read` | project | D038, D039 | F053's precedent: generating and reading are different grants, and a report must not be a side door to rows the caller cannot list |
| View assignments | `assignments.read` | project | D042 | |
| Create / edit / end an assignment | `assignments.manage` | project | D042 | |
| Maintain an assignment end date | `assignments.end_date` | `own-project` | D042 | the responsible person's own grant — separate from `assignments.manage` |
| Request a transfer | `transfers.request` | project | D045 | a resource manager, or the *requesting* project's responsible person |
| Approve / reject a transfer | `transfers.approve` | `own-project` | D046 | the **source** project's responsible person on the effective date — a rule about which row, not merely which code |
| Record leave | `leave.manage` | project | D059 | |
| Record a shift, secondment, termination | `employee_events.manage` | project | D062, D063 | premium economics are O13's; D062 records the fact and nothing more |
| View actual cost / cost at completion | `costs.view` | **O16** | D067, D069 | |
| Recalculate actual cost | `costs.recalculate` | global | D057 | versioned, with a visible diff, never a silent rewrite |
| View the consolidation cockpit | `consolidation.view` | project | D071 | read-only throughout |
| Export a consolidated report | `reports.generate` **and** `consolidation.view` | project | D079 | |
| View the audit trail | `audit.read` | global | exists (F043) | D083 extends the **audit action** vocabulary, not the permissions |
| Generate the generic user-directory PDF | `reports.generate` **and** `users.read` | global | exists (F053) | |

**Two rows are Open, on purpose.** `rates.read` and `costs.view` are the spec's own confidentiality question
(O16: which roles may see designation and employee rates, cost breakdowns and executive PDFs). D001 maps the
actions — because a permission map that omitted them would pretend the question does not exist — and decides
nothing about them: the recommended default, recorded in `DECISIONS.md` as a *recommendation* and not a rule,
is the least-privilege reading (rate values behind their own code, held by the commercial and resource
functions, with Directors read-only and everyone else without it), and D082 is the task that hides protected
fields in API, UI and PDF. D012 and D082 must stop if O16 is still open when they land.

### The role catalog, which this map does *not* decide

`PRODUCT_SPEC.md` §10 *suggests* a catalog — Super Admin/Admin, Resource Manager, Project Manager, Project
Director, Commercial/Estimation, Timekeeper, Viewer/Management — and §12 of the same document says a
suggested detail is **not an approved rule**. So D001 lists it as the shape the actions above were derived
from, and leaves the binding to D080 ("Domain actions and multiple role mappings"), which is where a role's
grant set becomes real. Two facts make that safe to defer: the foundation's own roles (`super_admin`,
`admin`, `viewer`) already exist and are seeded (C16), and an operator can create a role and grant codes
through `/admin/roles` today (F036) — so nothing in Stage B waits on a seed.

## 4. Open decisions this map does not resolve

Every one of these is `OPEN` in `DECISIONS.md` and none of them is answered here. What this section adds is
**where** each one bites, so that the task which hits it stops for one precise question instead of guessing:

| Decision | What it moves in this map | The task that must stop on it |
|---|---|---|
| O04 — revision draft/publish semantics | whether `forecast_revisions` carries mutable drafts beside immutable published rows, and therefore the partial unique index in §2 | D029, D031 |
| O05 — do old revisions keep their rate snapshots | whether the snapshot lives on `forecast_positions`/`forecast_position_months` or is re-derived | D031 |
| O06 — shared actual assignments | whether `assignments` may overlap (making the exclusion constraint in §2 illegal) and how shares are approved | D040, D043, D050 |
| O07 — missing end date | the `assignments` end-date column set (provisional date + `end_date_confirmed=false`, or nullable with an alert) | D040, D041 |
| O09 — does a transfer rewrite a forecast | whether `actuals` writes anything in `forecasts` — the table above says never, and this decision could change it | D064, D065 |
| O12 — assignment day boundary | `[]` or `[)` in the interval constraint, and whether a transfer starts the day after the source ends | D037, D042 |
| O16 — rate confidentiality | the two Open rows in §3, and which layer strips the fields | D012, D082 |
| O01, O02, O03, O08, O10, O11, O13, O14, O15, O17, O18 | no entity in this map moves — these are calculation, calendar, costing and workflow rules that live inside a module's service and its tests | the tasks `DECISIONS.md` already names for each |

## 5. Keeping this map true

- **The owning task corrects this document in its own commit.** A name, a column or a code that lands
  differently is not a defect in the task — it is a defect in whichever of the two is wrong, and the rule
  `ADDING_A_MODULE.md` §6 records for the extension recipe applies here unchanged: a divergence found later is
  worth recording rather than smoothing over.
- **What this map cannot check.** It is prose about tables that do not exist yet, so nothing in it is
  executable. What *is* executable arrives with each task: D084 re-checks the API contract and the typed
  client, D085–D087 are the three suites, and D091 ("production-like deployment smoke and known limitations",
  "no unverified success claims") is the gate that reads this document against the shipped product.
- **What is already checked, at this commit.** `APP_MODULES` is empty; `PermissionCode` has no domain member;
  `alembic heads` is `0009`; `docs/FOUNDATION_REPORT.md` §3's boundary scan finds no construction vocabulary in
  anything the foundation ships. Those four facts are why D001 could be a document, and they are the four that
  stop being true, one task at a time, from D002 onward.

## 6. Where this document sits

| Document | Its job, and how it differs from this one |
|---|---|
| `ARCHITECTURE.md` §7 | the **extension interfaces** (how a module is added) — this document is what Stage B adds through them |
| `ARCHITECTURE.md` §8 | the **foundation's** tables — this document is the domain's, hung off them |
| `ADDING_A_MODULE.md` | the **recipe** for one module — this document is the whole set at once, with the boundaries between them |
| `PRODUCT_SPEC.md` §3–§10 | the **requirements** — this document is their shape in tables and codes, and it adds no rule of its own |
| `DECISIONS.md` | the **confirmed** decisions (C11–C51) and the open ones (O01–O18) — this document defers to it at every point marked `[Ox]` |
