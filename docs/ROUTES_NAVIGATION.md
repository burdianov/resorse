# ROUTES AND NAVIGATION — task F016

The navigation registry introduced by F016. Source: `BIG-PROMPT.txt` §4.7–§4.10; `docs/ARCHITECTURE.md` §5, §6, §7.

## 1. One definition, four consumers

`frontend/src/config/navigation.ts` is the only place a page is described. The sidebar, the command palette
(Ctrl/Cmd+K) and breadcrumbs all read it, filtered once per caller by `visibleNavigation(access)` — the shell
computes the filtered result and hands the *same* value to the sidebar and the palette, so the two surfaces cannot
disagree (`BIG-PROMPT` §4.10). Routes themselves are generated from the registry by `buildRouteObjects()`, so a
page is mounted exactly when it is registered.

Every route carries the metadata §4.7 requires:

| Field | Meaning |
|---|---|
| `id` | stable key (React keys, tests, audit) |
| `path` | absolute URL path |
| `label`, `icon` | sidebar/palette presentation |
| `group` | id of the owning group in `NAV_GROUPS` (or a module group) |
| `requiredPermissions` | every code must be held by the caller |
| `adminOnly` | additionally requires administrative authority (see §3) |
| `showInNavigation` | `false` keeps the route mounted but out of the nav |
| `featureFlag` | visible only while the flag is enabled for the caller |
| `breadcrumb` | factory for the current crumb; receives `:param` captures |
| `component` | lazily imported page (the shell wraps pages in `Suspense`) |

**Visibility is presentation, not authorization.** All of this decides what is *shown*; the API decides what is
*allowed*, server-side, and fails closed (`BIG-PROMPT` §6.3d, `ARCHITECTURE.md` §6).

## 2. Registered routes

Only routes whose page exists are registered — a registered route is a real link, and §1.2 forbids dead links.

| Group | Route | Path | Requirements | Since |
|---|---|---|---|---|
| Overview | Dashboard | `/dashboard` | none | F017 (protected placeholder; F047 replaces the page) |
| Overview | Notifications | `/notifications` | `notifications.read` | F046 |
| (avatar menu, not listed) | Profile | `/profile` | own account | F042 |
| (avatar menu, not listed) | Security | `/profile/security` | own account | F042 |
| Administration | Users | `/admin/users` | `users.read` + admin area | F034 |
| Administration | Roles | `/admin/roles` | `roles.read` + admin area | F036 |
| Administration | Permissions | `/admin/permissions` | `permissions.read` + admin area | F038 |
| Administration | Settings | `/admin/settings` | `settings.read` + admin area | F040 |
| Administration | Audit Trail | `/admin/audit` | `audit.read` + admin area | F044 |
| Reference Data | Disciplines | `/masters/disciplines` | `disciplines.read` | D006 |
| Reference Data | Departments | `/masters/departments` | `departments.read` | D006 |
| Reference Data | Designations | `/masters/designations` | `designations.read` + `departments.read` + `disciplines.read` | D006 |
| Tools (dev builds only) | Component Lab | `/tools/components` | dev build + admin area + `dev.tools` | F054 |

The Component Lab's row is the one entry that is **conditional on the build** rather than on the caller: it is
registered from an `import.meta.env.DEV` literal, so a production bundle has no such route at all and the path
answers 404 like any other unknown one. Inside a development build the entry is real, and its link is filtered the
usual way — the Tools group carries `adminOnly` **and** the `dev.tools` flag, so it appears for an administrator
holding the flag and for nobody else. The flag hides the *link*; it does not close the route, because `RouteGuard`
evaluates permissions and `adminOnly`, not flags. That is intended: a developer opens the lab by typing its address.

The groups themselves are also declarative: `Overview` and `Administration` exist from the start, and a group with
no visible item **renders nothing** (§4.8: no fake empty groups) — the Administration group appears for exactly
the callers holding a read code in its namespaces, and is absent (not empty) for everyone else. `Tools` (F054) is
gated twice: it needs administrative authority *and* the `dev.tools` flag, which in practice means a development
build, since `ENABLED_FEATURES` is empty in a production one. **Reference Data** (D006) is the first group that
arrives from a module rather than from `NAV_GROUPS`: it is contributed by the `masters` entry in `APP_MODULES`
(§6), ordered 25 — between Administration (20) and Tools (30) — and it appears for exactly the callers holding one
of the three read codes it declares, which is the grant the seeded `viewer` role already carries. Its third route
declares **three** codes rather than one: the designations screen joins both reference lists into its rows, so it
issues all three requests and the guard reflects what the page actually needs (`ADDING_A_MODULE.md` §3).

`/` is deliberately **not** a registry entry: the router redirects it (§4.1). F032 makes that redirect auth-aware.

## 3. Access model

The model lives in `frontend/src/config/access.ts` — a **leaf module that imports nothing**. It cannot live in
`navigation.ts`: the registry mounts the route guard, the guard reads the access provider, and the provider needs
the anonymous default, so the chain `navigation → route-guard → access-provider → navigation` would close and
native ESM would evaluate it before `ANONYMOUS_ACCESS` exists (a blank page — this was F017's defect, fixed after
it; `tests/lib/module-graph.test.ts` now fails on any cycle). Consumers import it from `@/config/access`
directly; `navigation.ts` deliberately does **not** re-export it, because a re-export would restore the cycle.

`NavigationAccess` carries `{ permissions, isSuperuser, features }`:

- `permissions` — the union of the caller's roles' permission codes, resolved server-side (F031).
- `isSuperuser` — explicit super-admin handling: passes every permission check. Feature flags still apply —
  a flag says the module is off, not that the caller is unprivileged.
- `features` — enabled feature flags. Anything absent is disabled (**fail closed**).

`adminOnly` is the coarse "administration area" gate: a superuser, or a caller holding at least one permission in
an administration namespace (`users.`, `roles.`, `permissions.`, `settings.`, `audit.` — the codes are fixed by
`ARCHITECTURE.md` §6). Items inside an administration group are still filtered individually, so a user with only
`audit.read` sees the group with just the Audit Trail.

Until F032 supplies a session, the shell providers `ANONYMOUS_ACCESS` — no permissions, not a superuser. That is
the *correct* answer for an unauthenticated caller, not a placeholder: the caller genuinely is anonymous.

`PermissionGate` and `SecureLink` (`components/common/`) evaluate the same `meetsAccess` rule for feature UI, and
carry the same warning: they are UX, never the security boundary.

## 4. Route states (implemented in F017)

| State | Behaviour |
|---|---|
| Root `/` | redirects to `/dashboard` (F032 makes it auth-aware: `/login` when there is no session) |
| `/admin` | redirects to the first `/admin/*` section the caller may open, in registry order (Users first), else the 403 page — the true answer, not a workaround |
| `/403`, `/404` | direct-visible state pages; `*` renders the 404 for any unknown path |
| A page that throws | the route error boundary replaces the *page*, never the frame: sidebar, header and navigation stay usable, and the error state offers **Retry** |
| A gated route opened directly | `buildRouteObjects` wraps every route with `requiredPermissions`/`adminOnly` in `RouteGuard`, which renders the 403 — so a route cannot be registered without its denial state |
| Offline / 5xx | `ErrorState variant="offline"` with Retry; the query layer wires its failures into it (F018/F019) |

Two boundaries, on purpose: each registry route carries its own `errorElement` (a page crash keeps the frame),
and the root route carries one that renders full-page (a shell crash has no frame left). None of them display the
thrown error — §6.2f's "no data leak" applies to error UI.

The 403 is **not** the login redirect. A caller with no session belongs at `/login` (F032's guard, §6.2f); a
caller who is signed in but lacks the permission belongs on the 403 page (§4.6). Keeping the two apart is what
stops a permission error from being misread as "log in again".

## 5. Not yet registered (planned pages)

**Nothing is outstanding.** Every page BIG-PROMPT §4 plans is registered — the pages as of F046, and the last one,
the dev-only Component Lab, in **F054** — so §2 is the complete list of *foundation* pages, and the Stage B
screens §6 describes are its complete list of domain ones: Stage B has registered its first three (D006). The
section is kept rather than deleted, so that "not listed here" keeps meaning "not planned" instead of "not looked
for".

## 6. Extension slot

`frontend/src/config/modules.ts` is where a future (Stage B) module registers: its own titled groups, routes with
the same metadata, and *declared* permission codes — permissions are registered server-side, so a module can
never grant itself authority (`ARCHITECTURE.md` §7). Modules are compiled in; there is no runtime loader.
A module-level `featureFlag` keeps the whole module dark until enabled. F063 proves the contract end to end with
a test-only module, and `docs/DOMAIN_ARCHITECTURE.md` §1 (D001) maps the Stage B modules, their routes and their
permission namespaces. **The first real module is D006's** — `masters`, joining the three reference-table screens
above — so §2's rule now has both halves on the record: the proof module that is never in a build, and the one
module that is. **Nothing else from that map is registered here until its page exists** — §5's rule.
