import { createElement, lazy } from 'react'
import type { ComponentType } from 'react'
import { Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RouteObject } from 'react-router'

import { APP_MODULES } from './modules'
import type { AppModule } from './modules'

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

export interface RouteDefinition {
  id: string
  /** Absolute path, as it appears in the URL. */
  path: string
  label: string
  icon: LucideIcon
  /** Id of the owning group in `NAV_GROUPS` (or a module group). */
  group: string
  /** Every code must be held (the union across roles is resolved upstream). */
  requiredPermissions?: readonly string[]
  /** Additionally requires administrative authority — see `hasAdministrationAccess`. */
  adminOnly?: boolean
  /** Defaults to true; false keeps the route mounted but out of the nav. */
  showInNavigation?: boolean
  /** Visible only while this flag is enabled for the caller. */
  featureFlag?: string
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

/** What the caller may see. Resolved once per session and supplied downstream. */
export interface NavigationAccess {
  /** Union of the roles' permission codes (ARCHITECTURE §6). */
  permissions: ReadonlySet<string>
  /** Explicit super-admin handling: everything passes except disabled flags. */
  isSuperuser: boolean
  /** Enabled feature flags; anything absent is disabled (fail closed). */
  features?: ReadonlySet<string>
}

/** No session exists yet — and an anonymous caller correctly sees almost nothing. */
export const ANONYMOUS_ACCESS: NavigationAccess = {
  permissions: new Set(),
  isSuperuser: false,
}

/**
 * Permission namespaces that make a caller "administrative" for the coarse
 * `adminOnly` gate. The authoritative codes live in ARCHITECTURE §6; F031
 * resolves the effective set and F036 refines the admin screens.
 */
const ADMINISTRATION_NAMESPACES: readonly string[] = [
  'users',
  'roles',
  'permissions',
  'settings',
  'audit',
]

export function hasAdministrationAccess(access: NavigationAccess): boolean {
  if (access.isSuperuser) return true
  for (const permission of access.permissions) {
    const separator = permission.indexOf('.')
    if (separator <= 0) continue
    if (ADMINISTRATION_NAMESPACES.includes(permission.slice(0, separator))) return true
  }
  return false
}

/**
 * The single visibility rule, shared by the registry and `PermissionGate`
 * (BIG-PROMPT §6.3d: same registry, never the security boundary).
 */
export function meetsAccess(
  requirement: Pick<RouteDefinition, 'requiredPermissions' | 'adminOnly' | 'featureFlag'>,
  access: NavigationAccess,
): boolean {
  if (requirement.featureFlag && !access.features?.has(requirement.featureFlag)) return false
  if (requirement.adminOnly && !hasAdministrationAccess(access)) return false
  if (access.isSuperuser) return true
  return (requirement.requiredPermissions ?? []).every((code) => access.permissions.has(code))
}

/** Built-in groups; modules add theirs through `AppModule.navigation`. */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'overview', label: 'Overview', order: 10 },
  // Present from the start so admin routes have their home; it renders only
  // once it holds visible items (§4.8: no fake empty groups).
  { id: 'administration', label: 'Administration', order: 20, adminOnly: true },
]

const FoundationStatus = lazy(async () => {
  const module = await import('@/pages/foundation-status')
  return { default: module.FoundationStatus }
})

/**
 * Built-in routes. Today this is the foundation status page at `/`; F017 adds
 * the root/`/admin` redirects and the route states, and each later screen adds
 * its own entry here as it is built.
 */
export const APP_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'status',
    path: '/',
    label: 'Status',
    icon: Activity,
    group: 'overview',
    component: FoundationStatus,
  },
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

/** Router children for the registry. `/` becomes the layout route's index. */
export function buildRouteObjects(routes: readonly RouteDefinition[] = allRoutes()): RouteObject[] {
  return routes.map((route): RouteObject => {
    const element = createElement(route.component)
    return route.path === '/'
      ? { index: true, element }
      : { path: route.path.replace(/^\//, ''), element }
  })
}
