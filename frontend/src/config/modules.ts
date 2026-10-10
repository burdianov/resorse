import { lazy } from 'react'
import { Briefcase, Building2, FolderKanban, Wrench } from 'lucide-react'

import type { NavGroup, RouteDefinition } from './navigation'

/**
 * The module extension slot (BIG-PROMPT §4.8 "Future Modules", §9.6).
 *
 * Stage B (and any future bounded feature area) contributes navigation, routes
 * and permission *declarations* through this interface. The shape follows
 * ARCHITECTURE §7, which is binding in intent: modules are **compiled in** —
 * there is no runtime loader and no remote code — and permissions are only
 * *declared* here; they are registered server-side, so a module can never grant
 * itself authority.
 *
 * `APP_MODULES` is the single registration point. A module with a
 * `featureFlag` stays dark until that flag is enabled for the caller (F016
 * evaluates it per request via `NavigationAccess.features`). F063 proves the
 * whole contract end to end with a test-only module.
 */
export interface AppModule {
  /** Stable identifier, e.g. `demo_records`. */
  id: string
  /** Extra titled groups for the navigation (§4.8). */
  navigation?: readonly NavGroup[]
  /** Routes mounted under the app shell, same metadata contract as the built-ins. */
  routes: readonly RouteDefinition[]
  /** Declared permission codes; the server owns the registry (ARCHITECTURE §6). */
  permissions?: readonly PermissionDefinition[]
  /** Keeps the whole module dark until the flag is enabled. */
  featureFlag?: string
}

export interface PermissionDefinition {
  /** Machine-stable `resource.action` code. */
  code: string
  /** Human description for the permission dictionary (F037/F038). */
  description: string
}

/**
 * The reference tables (D006) — the first entry `APP_MODULES` has ever held.
 *
 * **One module, one group, three routes.** `docs/ADDING_A_MODULE.md` §3 is the
 * recipe and this follows it: the group is titled "Reference Data" because the
 * three tables are exactly that — small, operator-curated vocabularies the rest
 * of the product references — and because the phrase Stage A's boundary scan
 * forbids must not appear in shipped frontend source.
 *
 * **No `adminOnly`, deliberately.** §3's rule is that `adminOnly` names the
 * `users`/`roles`/`permissions`/`settings`/`audit` namespaces; a module living
 * in its own namespace must not claim it. These screens are governed by their
 * own codes — whoever the server grants `disciplines.read` to may read the
 * list, and the sidebar and the guard read that same code (§6.3d).
 *
 * **`requiredPermissions` are the codes the *page's calls* need**, not just the
 * one in its title. `/masters/designations` renders two joined names, so it
 * reads the department and discipline lists too and declares all three read
 * codes; declaring only `designations.read` would mount a page whose two other
 * requests the server refuses.
 *
 * **The pages are `lazy()` calls written inside the route objects** — the shape
 * `navigation.ts`'s `DEV_ROUTES` explains at length. A binding declared beside
 * the array would put all three screens (and the table machinery they share)
 * into the entry chunk instead of one chunk per screen.
 *
 * The permission declarations are the server's own sentences
 * (`app/core/permissions.py`), copied rather than paraphrased: this list feeds
 * the dictionary UI, and two wordings for one code is how a dictionary starts
 * lying. Declaring them here grants nothing — the registry is the server's
 * (ARCHITECTURE §6).
 */
const MASTERS_MODULE: AppModule = {
  id: 'masters',
  navigation: [{ id: 'masters', label: 'Reference Data', order: 25 }],
  routes: [
    {
      id: 'masters-disciplines',
      path: '/masters/disciplines',
      label: 'Disciplines',
      icon: Wrench,
      group: 'masters',
      requiredPermissions: ['disciplines.read'],
      component: lazy(async () => {
        const module = await import('@/pages/masters/disciplines')
        return { default: module.DisciplinesPage }
      }),
    },
    {
      id: 'masters-departments',
      path: '/masters/departments',
      label: 'Departments',
      icon: Building2,
      group: 'masters',
      requiredPermissions: ['departments.read'],
      component: lazy(async () => {
        const module = await import('@/pages/masters/departments')
        return { default: module.DepartmentsPage }
      }),
    },
    {
      id: 'masters-designations',
      path: '/masters/designations',
      label: 'Designations',
      icon: Briefcase,
      group: 'masters',
      // Three codes, not one: the page joins both reference lists into its rows.
      requiredPermissions: ['designations.read', 'departments.read', 'disciplines.read'],
      component: lazy(async () => {
        const module = await import('@/pages/masters/designations')
        return { default: module.DesignationsPage }
      }),
    },
  ],
  permissions: [
    { code: 'disciplines.read', description: 'View the discipline list.' },
    { code: 'disciplines.manage', description: 'Add, edit and deactivate disciplines.' },
    { code: 'departments.read', description: 'View the department list.' },
    { code: 'departments.manage', description: 'Add, edit and deactivate departments.' },
    { code: 'designations.read', description: 'View the designation list.' },
    { code: 'designations.manage', description: 'Add, edit and deactivate designations.' },
  ],
}

/**
 * The project register (D009) — the second entry, and the first module over a
 * *working* table rather than a curated vocabulary.
 *
 * **Two routes, one group, and the second route is not in the navigation.**
 * `/projects` is the register; `/projects/:projectId` is one project's record
 * and the place its status is changed. A detail route is reached from the row
 * that names it, so `showInNavigation: false` — the same metadata the profile
 * pages use — keeps the group's one link from being two.
 *
 * **Both routes require `projects.read`, and neither requires more.** §3's rule
 * is that `requiredPermissions` are the codes the route's *calls* need: this
 * screen's reads are `projects.read` (D008's list, detail and every field they
 * carry), and the status control's write is `projects.update` — which the
 * control itself gates on, exactly as the user directory gates its row actions
 * on their own codes while the route demands only the read. Putting
 * `projects.update` on the route would hide the register from the readers who
 * are most of its audience; leaving it off the control would render a button
 * that always 403s. Only the three codes D008 registers are declared:
 * `projects.responsibility` exists in §3's matrix and not in
 * `app/core/permissions.py` (D019 adds it), and a declaration for a code the
 * server does not have is a row the permission dictionary would render blank.
 *
 * **No `adminOnly`**, for the reason the reference tables record: the flag
 * names the `users`/`roles`/`permissions`/`settings`/`audit` namespaces, and a
 * module in its own namespace must not claim it. **No `featureFlag`** — the
 * module ships on.
 *
 * The declarations are the server's sentences from `app/core/permissions.py`,
 * copied rather than paraphrased (the dictionary UI renders them). Declaring
 * them grants nothing; the registry is the server's.
 */
const PROJECTS_MODULE: AppModule = {
  id: 'projects',
  navigation: [{ id: 'projects', label: 'Projects', order: 26 }],
  routes: [
    {
      id: 'projects-list',
      path: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      group: 'projects',
      requiredPermissions: ['projects.read'],
      component: lazy(async () => {
        const module = await import('@/pages/projects')
        return { default: module.ProjectsPage }
      }),
    },
    {
      // Out of the sidebar: a record is opened from the register's row that
      // names it, and the route is guarded by the same read code.
      id: 'projects-detail',
      path: '/projects/:projectId',
      label: 'Project',
      icon: FolderKanban,
      group: 'projects',
      showInNavigation: false,
      requiredPermissions: ['projects.read'],
      component: lazy(async () => {
        const module = await import('@/pages/projects/detail')
        return { default: module.ProjectDetailPage }
      }),
    },
  ],
  permissions: [
    { code: 'projects.read', description: "View the project list and a project's details." },
    { code: 'projects.create', description: 'Create projects.' },
    { code: 'projects.update', description: 'Edit a project and its lifecycle status.' },
  ],
}

/** Compiled-in modules. Stage A shipped none; D006 registers the first, D009 the second. */
export const APP_MODULES: readonly AppModule[] = [MASTERS_MODULE, PROJECTS_MODULE]
