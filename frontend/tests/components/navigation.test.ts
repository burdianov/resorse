import { describe, expect, it } from 'vitest'
import { Activity } from 'lucide-react'

import {
  ANONYMOUS_ACCESS,
  allNavGroups,
  allRoutes,
  buildBreadcrumbs,
  buildRouteObjects,
  matchRoute,
  meetsAccess,
  visibleNavigation,
} from '@/config/navigation'
import type { NavGroup, NavigationAccess, RouteDefinition } from '@/config/navigation'
import type { AppModule } from '@/config/modules'

/**
 * The registry rules themselves (BIG-PROMPT §4.7–§4.10), exercised with fixture
 * definitions so every combination is reachable — the shipped registry holds one
 * route until its pages land.
 */
const Noop = () => null

function route(definition: Partial<RouteDefinition> & { id: string; path: string }): RouteDefinition {
  return {
    label: definition.id,
    icon: Activity,
    group: 'overview',
    component: Noop,
    ...definition,
  }
}

function access(init: {
  permissions?: readonly string[]
  isSuperuser?: boolean
  features?: readonly string[]
}): NavigationAccess {
  const resolved: NavigationAccess = {
    permissions: new Set(init.permissions ?? []),
    isSuperuser: init.isSuperuser ?? false,
  }
  return init.features ? { ...resolved, features: new Set(init.features) } : resolved
}

const GROUPS: NavGroup[] = [
  { id: 'overview', label: 'Overview', order: 10 },
  { id: 'administration', label: 'Administration', order: 20, adminOnly: true },
]

const ROUTES: RouteDefinition[] = [
  route({ id: 'dashboard', path: '/dashboard' }),
  route({
    id: 'users',
    path: '/admin/users',
    label: 'Users',
    group: 'administration',
    requiredPermissions: ['users.read'],
    adminOnly: true,
  }),
  route({
    id: 'audit',
    path: '/admin/audit',
    label: 'Audit Trail',
    group: 'administration',
    requiredPermissions: ['audit.read'],
    adminOnly: true,
  }),
  route({
    id: 'settings',
    path: '/admin/settings',
    label: 'Settings',
    group: 'administration',
    adminOnly: true,
    featureFlag: 'settings-v2',
  }),
  route({ id: 'secret', path: '/secret', showInNavigation: false }),
  route({
    id: 'user-detail',
    path: '/admin/users/:id',
    label: 'User detail',
    group: 'administration',
    showInNavigation: false,
    breadcrumb: (params) => `User ${params.id ?? ''}`,
  }),
]

const options = { groups: GROUPS, routes: ROUTES }

describe('meetsAccess', () => {
  it('requires every listed permission', () => {
    const users = ROUTES[1] as RouteDefinition
    expect(meetsAccess(users, ANONYMOUS_ACCESS)).toBe(false)
    expect(meetsAccess(users, access({ permissions: ['reports.generate'] }))).toBe(false)
    expect(meetsAccess(users, access({ permissions: ['users.read'] }))).toBe(true)
  })

  it('lets a superuser through without permissions', () => {
    expect(meetsAccess(ROUTES[1] as RouteDefinition, access({ isSuperuser: true }))).toBe(true)
  })

  it('gates adminOnly on administrative authority, not on any permission', () => {
    // The audit route needs `audit.read`; reports.generate is a real permission
    // but belongs to no administration namespace.
    const audit = ROUTES[2] as RouteDefinition
    expect(meetsAccess(audit, access({ permissions: ['reports.generate'] }))).toBe(false)
    expect(meetsAccess(audit, access({ permissions: ['audit.read'] }))).toBe(true)
    expect(meetsAccess(audit, access({ isSuperuser: true }))).toBe(true)
  })

  it('hides flagged routes until the flag is enabled, even for a superuser', () => {
    // The flag gates whether the module is active at all, so it applies before
    // any (or no) permission check.
    const settings = ROUTES[3] as RouteDefinition
    expect(meetsAccess(settings, access({ isSuperuser: true, features: [] }))).toBe(false)
    expect(meetsAccess(settings, access({ isSuperuser: true, features: ['settings-v2'] }))).toBe(true)
  })

  it('ignores malformed permission codes', () => {
    expect(meetsAccess({ adminOnly: true }, access({ permissions: ['read'] }))).toBe(false)
  })
})

describe('visibleNavigation', () => {
  it('shows an anonymous caller only the routes that require nothing', () => {
    const groups = visibleNavigation(ANONYMOUS_ACCESS, options)

    expect(groups.map((group) => group.id)).toEqual(['overview'])
    expect(groups[0]?.items.map((item) => item.path)).toEqual(['/dashboard'])
  })

  it('drops the administration group for callers without administrative authority', () => {
    const groups = visibleNavigation(access({ permissions: ['reports.generate'] }), options)

    expect(groups.map((group) => group.id)).toEqual(['overview'])
  })

  it('shows only the permitted items inside the administration group', () => {
    const groups = visibleNavigation(
      access({ permissions: ['users.read', 'audit.read'] }),
      options,
    )

    // Settings stays hidden: it also needs the disabled `settings-v2` flag.
    expect(groups.map((group) => group.id)).toEqual(['overview', 'administration'])
    expect(groups[1]?.items.map((item) => item.path)).toEqual(['/admin/users', '/admin/audit'])
  })

  it('omits routes with showInNavigation false but keeps them mounted', () => {
    const everything = visibleNavigation(access({ isSuperuser: true, features: ['settings-v2'] }), options)

    const paths = everything.flatMap((group) => group.items.map((item) => item.path))
    expect(paths).not.toContain('/secret')
    expect(paths).not.toContain('/admin/users/:id')
    // Reachable by URL: they are real routes, just not navigation entries.
    expect(buildRouteObjects(ROUTES).some((object) => object.path === 'secret')).toBe(true)
  })

  it('never renders an empty group', () => {
    const groups: NavGroup[] = [
      { id: 'overview', label: 'Overview', order: 10 },
      { id: 'empty', label: 'Empty', order: 20 },
    ]
    expect(visibleNavigation(access({ isSuperuser: true }), { groups, routes: ROUTES }).map((g) => g.id)).toEqual([
      'overview',
    ])
  })

  it('orders groups by their `order` value', () => {
    const groups: NavGroup[] = [
      { id: 'administration', label: 'Administration', order: 20 },
      { id: 'overview', label: 'Overview', order: 10 },
    ]
    const visible = visibleNavigation(access({ isSuperuser: true }), { groups, routes: ROUTES })
    expect(visible.map((group) => group.id)).toEqual(['overview', 'administration'])
  })

  it('merges module navigation and keeps a flagged module dark until enabled', () => {
    const module: AppModule = {
      id: 'demo',
      featureFlag: 'demo-module',
      navigation: [{ id: 'demo', label: 'Demo', order: 30 }],
      routes: [route({ id: 'demo-records', path: '/demo/records', label: 'Records', group: 'demo' })],
    }

    const anonymousGroups = visibleNavigation(ANONYMOUS_ACCESS, {
      groups: allNavGroups([module]),
      routes: allRoutes([module]),
    })
    expect(anonymousGroups.flatMap((group) => group.items.map((item) => item.id))).not.toContain('demo-records')

    const enabledGroups = visibleNavigation(access({ features: ['demo-module'] }), {
      groups: allNavGroups([module]),
      routes: allRoutes([module]),
    })
    expect(enabledGroups.map((group) => group.id)).toEqual(['overview', 'demo'])
    expect(enabledGroups[1]?.items.map((item) => item.path)).toEqual(['/demo/records'])
  })
})

describe('matchRoute', () => {
  it('matches literal segments and captures params', () => {
    expect(matchRoute('/admin/users', '/admin/users')).toEqual({})
    expect(matchRoute('/admin/users/:id', '/admin/users/42')).toEqual({ id: '42' })
    expect(matchRoute('/admin/users/:id', '/admin/roles/42')).toBeNull()
    expect(matchRoute('/admin/users', '/admin/users/42')).toBeNull()
  })
})

describe('buildBreadcrumbs', () => {
  it('links the registered ancestors and marks the current page', () => {
    const trail = buildBreadcrumbs('/admin/users', ROUTES)

    expect(trail.map((crumb) => crumb.label)).toEqual(['Users'])
    expect(trail[0]).toMatchObject({ path: '/admin/users', current: true })
  })

  it('uses the breadcrumb factory and its params for a detail path', () => {
    const trail = buildBreadcrumbs('/admin/users/42', ROUTES)

    expect(trail.map((crumb) => crumb.label)).toEqual(['Users', 'User 42'])
    expect(trail[1]).toMatchObject({ path: '/admin/users/42', current: true })
  })

  it('returns no trail for a path the registry does not know', () => {
    expect(buildBreadcrumbs('/nothing/here', ROUTES)).toEqual([])
  })

  it('treats the root route as a sibling, not an ancestor', () => {
    expect(buildBreadcrumbs('/', ROUTES)).toEqual([])
    // …but it is a page of its own in the real registry.
    expect(buildBreadcrumbs('/').map((crumb) => crumb.label)).toEqual(['Status'])
  })
})

describe('buildRouteObjects', () => {
  it('mounts every registered route, including the ones kept out of the nav', () => {
    const objects = buildRouteObjects(ROUTES)

    expect(objects).toHaveLength(ROUTES.length)
    expect(objects.find((object) => object.path === 'admin/users')).toMatchObject({ path: 'admin/users' })
    expect(objects.find((object) => object.path === 'secret')).toBeDefined()
  })

  it('maps the root path to the shell layout index', () => {
    const objects = buildRouteObjects([
      route({ id: 'home', path: '/' }),
      route({ id: 'other', path: '/other' }),
    ])

    expect(objects[0]).toMatchObject({ index: true })
    expect(objects[1]).toMatchObject({ path: 'other' })
  })
})
