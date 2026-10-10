# ADDING A MODULE

How to add a bounded feature area — a Stage B domain module, or any later extension — to this
foundation. The extension points are described in [`ARCHITECTURE.md`](ARCHITECTURE.md) §7; this
document is the working recipe.

**The short version.** A module is *compiled in*. It contributes navigation, routes and permission
*declarations* through one frontend registry (`frontend/src/config/modules.ts`), and it implements its
API as an ordinary backend router with server-side guards. There is no runtime plugin loader, no
remote code, and **a frontend module can never grant itself authority** — permissions are registered
server-side.

The example below is a neutral `demo_records` module: one table, one route, one nav item, one
permission. It is the shape F063 builds as a test-only proof of this contract; keep any real proof
module out of production navigation.

## 1. Decide the permission codes first

Everything else depends on the codes, so name them before writing code. The conventions this
foundation uses (`app/core/permissions.py`): namespaced `resource.action`, lowercase, machine-stable,
one `.read` code per resource and specific verbs for mutations — never a wildcard.

For `demo_records`: `demo_records.read`, `demo_records.create`, `demo_records.update`,
`demo_records.delete`.

Then add them to the vocabulary in `backend/app/core/permissions.py`:

```python
class PermissionCode(StrEnum):
    ...
    DEMO_RECORDS_READ = "demo_records.read"
    DEMO_RECORDS_CREATE = "demo_records.create"
```

and a description for each in `PERMISSION_DESCRIPTIONS` — a test enforces that every member has one,
because a code without a description is a row the permission dictionary renders blank.
`ALL_PERMISSION_CODES` is derived from the enum, so it picks the new members up automatically.

**What the seed does, and does not do, with a new code** (`DECISIONS.md` C16):

- `super_admin` holds every registered code and its grant set is **re-asserted on every seed run**, so
  the new codes reach the protected role the next time anyone runs `python -m app.seed` — but the
  seed creates what is missing and never edits existing rows, so it does not run by itself on deploy.
  Bootstrap runs it once; after that, run it deliberately.
- `admin` is defined as *all codes minus* `roles.manage` / `permissions.manage` — computed **at
  creation**. An `admin` role that already exists is never touched (`viewer`'s grants are an explicit
  read set for the same reason), so on a deployed system a new code reaches `super_admin` only until
  someone grants it through the roles matrix (F036) as a super-admin.
- A permission a module declares is still only *declared*; whoever holds `roles.manage` decides who
  gets it.

## 2. The backend, in this order

One module per concern, named after the resource. Nothing here is special to a "module" — it is the
same path every built-in feature took.

| Step | File | What goes in it |
|---|---|---|
| Model | `backend/app/models/demo_records.py` | The SQLAlchemy table(s), inheriting `UUIDPrimaryKeyMixin` / `TimestampMixin` from `app/core/database.py`; constraints and indexes on the model |
| Export | `backend/app/models/__init__.py` | Import and `__all__` the new models — Alembic's autogenerate only sees what has been imported |
| Migration | `backend/migrations/versions/0010_demo_records.py` | `uv run alembic revision -m "demo records" --rev-id 0010`, then hand-write the upgrade/downgrade. Hand-numbered so the directory reads in order; applies to an empty database; **never edited once applied** |
| Schemas | `backend/app/schemas/demo_records.py` | Pydantic request/response types. Never leak internal fields (F050's `FileItem` deliberately carries no object key) |
| Service | `backend/app/services/demo_records.py` | The rules and the queries. Mutations call `audit.record(...)` **inside the caller's transaction** — it adds a row and never commits |
| Router | `backend/app/api/v1/demo_records.py` | The endpoints, each guarded. No commit in a router other than the endpoint half that owns it |
| Registration | `backend/app/api/v1/router.py` | `include_router(demo_records.router, tags=["demo-records"])` |

Guards are not optional, and they are the security boundary (BIG-PROMPT §6.3d — hiding a nav item is
not authorization):

```python
from app.api.v1.dependencies import current_session, require_permission
from app.core.permissions import PermissionCode

@router.get("/demo-records", dependencies=[Depends(require_permission(PermissionCode.DEMO_RECORDS_READ))])
async def list_demo_records(session: AsyncSession = Depends(get_session)) -> ...: ...

@router.post("/demo-records", dependencies=[Depends(require_permission(PermissionCode.DEMO_RECORDS_CREATE))])
async def create_demo_record(...) -> ...: ...
```

- Use **`current_session`** (the default) for anything a signed-in user may call. It is
  `authenticated_session` plus the forced-password-change gate, which answers 403 while
  `must_change_password` is set. `authenticated_session` is for routes on the auth router's exemption
  list only. A module that needs a *specific* right uses `require_permission(code)`.
- **Cross-user and cross-project isolation belongs in SQL**, in the same predicate as the lookup —
  never a filter over unrestricted rows in Python. The established shape is `(id AND owner_id)` in one
  `WHERE`, so a foreign id resolves to **404, not 403** (a 403 would confirm it exists).
- **Audit every mutation** through `services/audit.record`, inside the mutation's transaction, with
  minimal changed-only diffs. Credential-shaped keys are refused at the door. Reads are not audited.
- **Commit belongs to the endpoint**, once, at the end of the unit of work — not to the service.

Then regenerate the contract artefacts (`docs/OPENAPI_CLIENT.md`):

```bash
cd backend  && uv run python -m scripts.export_openapi
cd frontend && pnpm run api:types
```

Both files are generated. Never hand-edit them; call the API through `frontend/src/lib/api.ts`.

### Project or business-unit scoping

Not built. `ARCHITECTURE.md` §7 sketches the intended seam:

```python
class ScopePolicy(Protocol[TResource]):
    def can_access(self, user: AuthenticatedUser, action: str, resource: TResource) -> bool: ...
```

When Stage B needs "this user may only see their own projects", that is where the policy lands, and
membership must be resolved server-side. Until it exists, do not invent a scoping mechanism inside a
module: use the ownership predicate above and record the limitation.

## 3. The frontend, in one file

Routes are registered in exactly one place — `frontend/src/config/navigation.ts` — and pages must
exist before they are registered ("never register a page that does not exist"): a registered route is
a real link, and a link that 404s is the dead link the requirements forbid.

A module contributes through `frontend/src/config/modules.ts`:

```ts
// frontend/src/config/modules.ts
export const APP_MODULES: readonly AppModule[] = [
  {
    id: 'demo_records',
    navigation: [{ id: 'demo-records', label: 'Records', order: 40 }],
    routes: [
      {
        id: 'demo-records',
        path: '/records',
        label: 'Records',
        icon: FileText,
        group: 'demo-records',
        requiredPermissions: ['demo_records.read'],
        component: DemoRecordsPage,
      },
    ],
    permissions: [
      { code: 'demo_records.read', description: 'View demo records.' },
    ],
  },
]
```

The three metadata types (all in `frontend/src/config/`):

- **`NavGroup`** (`navigation.ts`) — `{ id, label, order, adminOnly?, featureFlag? }`. Groups are
  sorted by `order` and a group with no visible items is dropped, so a titled empty group never
  renders.
- **`RouteDefinition`** (`navigation.ts`) — extends `AccessRequirement` and adds `id`, `path`,
  `label`, `icon`, `group`, an optional `showInNavigation` (default true) and a `breadcrumb` factory.
- **`AccessRequirement`** (`access.ts`) — `requiredPermissions?: readonly string[]` (all must be
  held), `adminOnly?: boolean`, `featureFlag?: string`.

Three rules that decide the metadata:

1. **`requiredPermissions` must be the codes the API actually enforces**, not a loose approximation.
   The nav filter is a *mirror*; the API is the boundary. If the endpoint demands two codes, the route
   demands two codes.
2. **`adminOnly` is coarse** — it means "has any permission in the `users`/`roles`/`permissions`/
   `settings`/`audit` namespaces", plus every superuser. A module in its own namespace (like
   `demo_records`) that is not administration must **not** set it.
3. **`featureFlag` fails closed and gates even a superuser** — a flag says the module is off, not that
   the caller is unprivileged. `RouteGuard` evaluates `requiredPermissions` and `adminOnly` but
   *ignores* flags, so a flag is not a way to close a route inside a build that contains it.

`allRoutes()` and `allNavGroups()` fold a module-level `featureFlag` down onto its routes and groups;
`visibleNavigation()` applies `meetsAccess` and drops empty groups. The sidebar, the command palette,
the breadcrumbs and the route guards all read that same filtered definition — configure the route
once, and it appears everywhere.

**The developer-only exclusion.** If a module must never ship (a lab, a proof module), the exclusion
is the module graph, not a hidden link: register it from an `import.meta.env.DEV` literal with the
page reference *inside* the folded branch, then prove it against the build — `pnpm run build` and a
search of `dist/` for a page-only string. F054's `AppModule`-free lab is the worked example, and
`docs/ARCHITECTURE.md` §7 records the 449 kB the wrong shape shipped.

## 4. Tests and the gate

A module is not done until it is tested and the gate considers it:

- **Backend:** a test file per subject under `backend/tests/`. **Any test that reaches the database
  must carry `@pytest.mark.integration`** (`backend/tests/test_markers.py` fails it in both
  directions — see [`TESTING.md`](TESTING.md) §3). Cover the refusal paths: the missing permission
  (403), the forced-change gate, and cross-user access answering 404. Each mutation's test asserts the
  audit event it wrote.
- **Frontend:** a component test under `frontend/tests/`, mirroring the source path. If the module
  renders a table, remember every `DataTable` column whose header is a component must declare
  `meta.label`, or the view-options menu prints a raw column id.
- **Contract:** re-run the OpenAPI export and `pnpm run api:types` and commit both artefacts.
- **Coverage:** the new code is measured whether or not a test reaches it. Do not narrow an exclusion
  or lower a threshold to absorb it.

## 5. What is not negotiable

- **No domain code in Stage A.** F001–F063 build the foundation; construction models and screens
  arrive in Stage B (D001+). A module added *now* must be a neutral proof module, kept out of
  production.
- **No runtime loading of remote code.** Modules are compiled into the bundle.
- **No permission declared by the frontend is ever trusted.** The server registers the vocabulary and
  enforces it per request.
- **No inert controls and no fake data.** A button either does the thing its label says or it is not
  rendered; a page either shows real API data or an honest empty/error state.
- **One route definition per page**, in the registry, and the page exists.
- **No new dependency without a recorded reason** — and no Redis, no Next.js, ever.

## 6. How this contract is proven

`docs/ARCHITECTURE.md` §7 and BP-9.7 require the extension contract to be proven by a **test-only**
module that registers one route, nav item, permission, model, migration and endpoint — and is then
removed from production navigation. **F063 owns that proof**; this document is the recipe it follows,
and any divergence between the two is a defect in one of them worth recording rather than smoothing
over.
