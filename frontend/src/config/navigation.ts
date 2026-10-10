import { createElement, lazy } from 'react'
import type { ComponentType } from 'react'
import { Bell, FileText, FlaskConical, LayoutDashboard, Lock, Settings, Shield, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RouteObject } from 'react-router'

import { RouteError } from '@/components/layout/route-error'
import { RouteGuard } from '@/components/layout/route-guard'

// The access model lives in a leaf module — see its header for the cycle that
// moving it here would close. Re-exporting it from this file would restore
// that cycle, so consumers import it from `@/config/access` directly.
import { hasAdministrationAccess, meetsAccess } from './access'
import type { AccessRequirement, NavigationAccess } from './access'
import { APP_MODULES } from './modules'
import type { AppModule } from './modules'
import { DEV_TOOLS_FLAG } from './features'

/**
 * The one navigation registry (BIG-PROMPT §4.7–§4.10).
 *
 * The sidebar, the command palette and breadcrumbs all read **this** definition,
 * filtered once per caller by `visibleNavigation()` — so they can never disagree
 * about what exists or who may see it. Route visibility here is presentation
 * only: the security boundary is the API (ARCHITECTURE §6, BIG-PROMPT §6.3d).
 *
 * Metadata supported, per §4.7: `id`, `path`, `label`, `icon`, `group`,
 * `requiredPermissions`, `adminOnly`, `showInNavigation`, `featureFlag`, a
 * breadcrumb factory and a component (lazy — the shell wraps pages in Suspense).
 *
 * **Only routes whose page exists are registered.** The target entries of §4
 * (`/dashboard`, `/admin/users`, …) join as their tasks land — a registered
 * route is a real link, and a link that 404s is exactly the "dead link" §1.2
 * tells us never to show.
 */

/** Access metadata (`requiredPermissions`, `adminOnly`, `featureFlag`) comes from `AccessRequirement`. */
export interface RouteDefinition extends AccessRequirement {
  id: string
  /** Absolute path, as it appears in the URL. */
  path: string
  label: string
  icon: LucideIcon
  /** Id of the owning group in `NAV_GROUPS` (or a module group). */
  group: string
  /** Defaults to true; false keeps the route mounted but out of the nav. */
  showInNavigation?: boolean
  /** Label for the current breadcrumb; params come from `:segment` path parts. */
  breadcrumb?: (params: Readonly<Record<string, string>>) => string
  component: ComponentType
}

export interface NavGroup {
  id: string
  label: string
  /** Lower sorts first. */
  order: number
  /** Administration groups are hidden from callers without administrative authority. */
  adminOnly?: boolean
  featureFlag?: string
}

/** Filtered, render-ready shape handed to the sidebar and the palette. */
export interface NavItemView {
  id: string
  label: string
  path: string
  icon?: LucideIcon
}

export interface NavGroupView {
  id: string
  label: string
  items: NavItemView[]
}

/** Built-in groups; modules add theirs through `AppModule.navigation`. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'overview', label: 'Overview', order: 10 },
  // Present from the start so admin routes have their home; it renders only
  // once it holds visible items (§4.8: no fake empty groups).
  { id: 'administration', label: 'Administration', order: 20, adminOnly: true },
  // The developer-only Tools group (F054, §4.5). Flagged rather than merely
  // dev-registered: `visibleNavigation` drops the group for any caller whose
  // feature set lacks the flag — which, in a production build, is every
  // caller, since nothing registers a route into it either.
  { id: 'tools', label: 'Tools', order: 30, adminOnly: true, featureFlag: DEV_TOOLS_FLAG },
]

const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard')
  return { default: module.DashboardPage }
})

const NotificationsPage = lazy(async () => {
  const module = await import('@/pages/notifications')
  return { default: module.NotificationsPage }
})

const AdminUsersPage = lazy(async () => {
  const module = await import('@/pages/admin/users')
  return { default: module.AdminUsersPage }
})

const AdminRolesPage = lazy(async () => {
  const module = await import('@/pages/admin/roles')
  return { default: module.AdminRolesPage }
})

const AdminPermissionsPage = lazy(async () => {
  const module = await import('@/pages/admin/permissions')
  return { default: module.AdminPermissionsPage }
})

const AdminSettingsPage = lazy(async () => {
  const module = await import('@/pages/admin/settings')
  return { default: module.AdminSettingsPage }
})

const AdminAuditPage = lazy(async () => {
  const module = await import('@/pages/admin/audit')
  return { default: module.AdminAuditPage }
})

const ProfilePage = lazy(async () => {
  const module = await import('@/pages/profile')
  return { default: module.ProfilePage }
})

const ProfileSecurityPage = lazy(async () => {
  const module = await import('@/pages/profile-security')
  return { default: module.ProfileSecurityPage }
})

/**
 * The developer-only component lab (BIG-PROMPT §4.5, §12 Phase 5; F054).
 *
 * **Registration is what excludes it, and the flag is what hides its link.** The
 * two are different jobs and it is worth being exact about which one does which.
 *
 * - **`import.meta.env.DEV` below** is the exclusion. Vite replaces the
 *   expression with a literal while it builds, so a production bundle gets an
 *   empty `DEV_ROUTES`: the entry is not in the registry, the sidebar never
 *   learns of a Tools group with items, and `/tools/components` is an ordinary
 *   404 — the same answer as any other unregistered path.
 * - **`adminOnly`** — the lab drives real components, including the file
 *   dropzone that stores bytes in this deployment, so it needs the authority
 *   those calls need. A viewer who could open it would find half a screen of
 *   refusals.
 * - **`featureFlag`** — the sidebar entry and its group are dropped for every
 *   caller whose feature set lacks the flag (`meetsAccess` is fail-closed, and
 *   `visibleNavigation` honours the flag on the group as well as the item), so
 *   in a development build only an administrator with the flag sees the link.
 *
 * **Why the `lazy()` call is written inside the array rather than beside it.**
 * The page, the chart library it draws with and the file components it
 * demonstrates are meant to be absent from a production `dist/` altogether, and
 * that is a fact about the *graph*, not about the registry. A `const
 * ComponentLabPage = lazy(...)` declared next to this comment reads as harmless,
 * and is not: when the DEV literal folds the branch away the binding becomes
 * unused, and the bundler drops the binding but keeps the call, because
 * `lazy(...)` is a call it cannot prove free of side effects. The call it keeps
 * still mentions `import('@/pages/tools/components')`, so the module stays in the
 * graph and ships as an unreachable chunk — 449 kB of lab and recharts in the
 * first build of this page, which is how the mistake was found. Written inside
 * the array, the whole object literal is inside the dead branch, the dynamic
 * import is gone from the graph, and neither the chunk nor the library is
 * emitted. `pnpm run build` followed by a search of `dist/` for a sentence from
 * the page is how that is checked rather than believed.
 *
 * **What the flag does not do**, stated because a reader will assume it does:
 * `RouteGuard` evaluates permissions and `adminOnly`, not flags, so inside a
 * development build `/tools/components` is reachable by typing it — for an
 * administrator. That is the intent: the lab exists to be opened by address.
 * Closing the *route* is the DEV literal's job, and it does it in production,
 * where there is no route to guard.
 */
const DEV_ROUTES: readonly RouteDefinition[] = import.meta.env.DEV
  ? [
      {
        id: 'tools-components',
        path: '/tools/components',
        label: 'Component Lab',
        icon: FlaskConical,
        group: 'tools',
        adminOnly: true,
        featureFlag: DEV_TOOLS_FLAG,
        component: lazy(async () => {
          const module = await import('@/pages/tools/components')
          return { default: module.ComponentLabPage }
        }),
      },
    ]
  : []

/**
 * Built-in routes. `/dashboard` renders the home screen (F047, which replaced
 * the F017 placeholder component, not the entry, so the navigation, the palette
 * and the route states never noticed). F034 registered `/admin/users`
 * and F036 adds `/admin/roles` (the permission matrix): `/admin` redirects to
 * the first permitted administration route in registry order, and the
 * Administration group appears for exactly the callers holding a read code in
 * its namespaces (the filter and the guard read the same `meetsAccess`,
 * §4.10). The registry deliberately has no `/` entry: the router redirects the
 * root (§4.1), auth-aware since F032.
 */
export const APP_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    group: 'overview',
    component: DashboardPage,
  },
  {
    // The inbox (F046, §7.7/BP-4.3): a protected user page in the Overview
    // group. `notifications.read` is what the API enforces on the list and
    // the count (F045); the guard and the visibility rule read the same
    // code, so a caller without it sees neither the entry nor a working
    // inbox — and the server would refuse regardless (§6.3d).
    id: 'notifications',
    path: '/notifications',
    label: 'Notifications',
    icon: Bell,
    group: 'overview',
    requiredPermissions: ['notifications.read'],
    component: NotificationsPage,
  },
  {
    id: 'admin-users',
    path: '/admin/users',
    label: 'Users',
    icon: Users,
    group: 'administration',
    adminOnly: true,
    requiredPermissions: ['users.read'],
    component: AdminUsersPage,
  },
  {
    id: 'admin-roles',
    path: '/admin/roles',
    label: 'Roles',
    icon: Shield,
    group: 'administration',
    adminOnly: true,
    requiredPermissions: ['roles.read'],
    component: AdminRolesPage,
  },
  {
    id: 'admin-audit',
    path: '/admin/audit',
    label: 'Audit Trail',
    icon: FileText,
    group: 'administration',
    adminOnly: true,
    requiredPermissions: ['audit.read'],
    component: AdminAuditPage,
  },
  {
    // Personal pages: any signed-in user, never in the navigation (§4's nav
    // spec — profile lives behind the avatar menus, wired in F042's
    // `UserMenu`). `requiredPermissions: []` deliberately: the routes are
    // session-gated by the shell's boundary, and no *permission* governs a
    // user's own profile.
    id: 'profile',
    path: '/profile',
    label: 'Profile',
    icon: UserRound,
    group: 'overview',
    showInNavigation: false,
    component: ProfilePage,
  },
  {
    id: 'profile-security',
    path: '/profile/security',
    label: 'Security',
    icon: ShieldCheck,
    group: 'overview',
    showInNavigation: false,
    breadcrumb: () => 'Security',
    component: ProfileSecurityPage,
  },
  {
    id: 'admin-permissions',
    path: '/admin/permissions',
    label: 'Permissions',
    icon: Lock,
    group: 'administration',
    adminOnly: true,
    requiredPermissions: ['permissions.read'],
    component: AdminPermissionsPage,
  },
  {
    id: 'admin-settings',
    path: '/admin/settings',
    label: 'Settings',
    icon: Settings,
    group: 'administration',
    adminOnly: true,
    requiredPermissions: ['settings.read'],
    component: AdminSettingsPage,
  },
  ...DEV_ROUTES,
]

/** Built-ins plus module contributions, with module flags folded in. */
export function allNavGroups(modules: readonly AppModule[] = APP_MODULES): NavGroup[] {
  return [
    ...NAV_GROUPS,
    ...modules.flatMap((module) =>
      (module.navigation ?? []).map((group) =>
        group.featureFlag === undefined && module.featureFlag !== undefined
          ? { ...group, featureFlag: module.featureFlag }
          : { ...group },
      ),
    ),
  ]
}

export function allRoutes(modules: readonly AppModule[] = APP_MODULES): RouteDefinition[] {
  return [
    ...APP_ROUTES,
    ...modules.flatMap((module) =>
      module.routes.map((route) =>
        route.featureFlag === undefined && module.featureFlag !== undefined
          ? { ...route, featureFlag: module.featureFlag }
          : { ...route },
      ),
    ),
  ]
}

function isGroupVisible(group: NavGroup, access: NavigationAccess): boolean {
  if (group.featureFlag && !access.features?.has(group.featureFlag)) return false
  if (group.adminOnly && !hasAdministrationAccess(access)) return false
  return true
}

/**
 * The shared, permission-filtered navigation. Empty groups are dropped — §4.8
 * forbids rendering a titled group with nothing in it.
 */
export function visibleNavigation(
  access: NavigationAccess,
  options: { groups?: readonly NavGroup[]; routes?: readonly RouteDefinition[] } = {},
): NavGroupView[] {
  const groups = options.groups ?? allNavGroups()
  const routes = options.routes ?? allRoutes()

  return groups
    .slice()
    .sort((first, second) => first.order - second.order)
    .filter((group) => isGroupVisible(group, access))
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: routes
        .filter(
          (route) =>
            route.group === group.id &&
            route.showInNavigation !== false &&
            meetsAccess(route, access),
        )
        .map((route) => ({ id: route.id, label: route.label, path: route.path, icon: route.icon })),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * Segment-wise match of a `:param` path pattern. Returns the captured params,
 * or null when the path does not match.
 */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = pathname.split('/').filter(Boolean)
  if (patternSegments.length !== pathSegments.length) return null

  const params: Record<string, string> = {}
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index] ?? ''
    const pathSegment = pathSegments[index] ?? ''
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = pathSegment
    } else if (patternSegment !== pathSegment) {
      return null
    }
  }
  return params
}

export interface Breadcrumb {
  id: string
  label: string
  path: string
  current: boolean
}

function segments(path: string): number {
  return path.split('/').filter(Boolean).length
}

function isSegmentPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Trail for a path, from the registry only — ancestors first, then the current
 * page (its `breadcrumb` factory wins over its label, so a detail page can name
 * the record it shows). Unknown paths produce no trail rather than a guess.
 *
 * `/` is treated as a sibling of every route, not an ancestor: today it is the
 * status page, and a home redirect (F017) has no business appearing in the
 * middle of an administrator's trail.
 */
export function buildBreadcrumbs(
  pathname: string,
  routes: readonly RouteDefinition[] = allRoutes(),
): Breadcrumb[] {
  const current = findCurrent(pathname, routes)
  const ancestors = routes
    .filter(
      (route) =>
        route.path !== '/' &&
        !route.path.includes(':') &&
        route.path !== current?.route.path &&
        isSegmentPrefix(route.path, pathname),
    )
    .sort((first, second) => segments(first.path) - segments(second.path))

  const trail: Breadcrumb[] = ancestors.map((route) => ({
    id: route.id,
    label: route.label,
    path: route.path,
    current: false,
  }))

  if (current) {
    trail.push({
      id: current.route.id,
      label: current.route.breadcrumb?.(current.params) ?? current.route.label,
      path: pathname,
      current: true,
    })
  }
  return trail
}

function findCurrent(
  pathname: string,
  routes: readonly RouteDefinition[],
): { route: RouteDefinition; params: Record<string, string> } | null {
  let parameterised: { route: RouteDefinition; params: Record<string, string> } | null = null
  for (const route of routes) {
    const params = matchRoute(route.path, pathname)
    if (!params) continue
    // A literal match always beats a `:param` one.
    if (!route.path.includes(':')) return { route, params }
    if (!parameterised || segments(route.path) > segments(parameterised.route.path)) {
      parameterised = { route, params }
    }
  }
  if (parameterised) return parameterised

  // A detail URL (`/admin/users/42`) keeps the deepest registered section crumb.
  const sections = routes
    .filter((route) => !route.path.includes(':') && route.path !== '/' && isSegmentPrefix(route.path, pathname))
    .sort((first, second) => segments(second.path) - segments(first.path))
  const section = sections[0]
  return section ? { route: section, params: {} } : null
}

/**
 * The first `/admin/*` **section** the caller may open, in registry order — the
 * target of the `/admin` redirect (§4.4). Detail routes are skipped: a redirect
 * cannot land on a page that needs an id. `null` means the caller has no
 * administration page at all, which is an honest 403 rather than a redirect
 * into a denial.
 */
export function firstPermittedAdminPath(
  access: NavigationAccess,
  routes: readonly RouteDefinition[] = allRoutes(),
): string | null {
  const permitted = routes.filter(
    (route) =>
      route.path.startsWith('/admin/') &&
      route.showInNavigation !== false &&
      meetsAccess(route, access),
  )
  return permitted[0]?.path ?? null
}

/**
 * Router children for the registry. `/` becomes the layout route's index.
 *
 * Every route gets the route error boundary, and every route that declares
 * `requiredPermissions`/`adminOnly` is wrapped in `RouteGuard` — so a page
 * cannot be registered without its 403 and error states, and no screen has to
 * remember to add them (BIG-PROMPT §4.6, §7.4c).
 */
export function buildRouteObjects(routes: readonly RouteDefinition[] = allRoutes()): RouteObject[] {
  return routes.map((route): RouteObject => {
    const page = createElement(route.component)
    const needsGuard = route.adminOnly === true || (route.requiredPermissions?.length ?? 0) > 0
    const element = needsGuard
      ? createElement(RouteGuard, {
          ...(route.requiredPermissions !== undefined
            ? { permissions: route.requiredPermissions }
            : {}),
          ...(route.adminOnly === true ? { adminOnly: true } : {}),
          children: page,
        })
      : page
    const errorElement = createElement(RouteError)

    return route.path === '/'
      ? { index: true, element, errorElement }
      : { path: route.path.replace(/^\//, ''), element, errorElement }
  })
}
