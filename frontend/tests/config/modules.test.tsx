import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import { ANONYMOUS_ACCESS } from '@/config/access'
import type { NavigationAccess } from '@/config/access'
import { APP_MODULES } from '@/config/modules'
import { allNavGroups, allRoutes, visibleNavigation } from '@/config/navigation'
import type { MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

import { DEMO_MODULE } from './demo-module'

/**
 * The extension contract, proven end to end (F063 — BP-9.6, BP-9.7, BP-12-P7).
 *
 * `docs/ARCHITECTURE.md` §7 and the guide's §6 ask for one thing: a **test-only
 * module** that registers one route, nav item, permission and page, driven
 * through the real registry and the real route table, and then shown to be
 * absent from what the application actually compiles in. `demo-module.tsx` is
 * that module; this file is the proof, in three layers:
 *
 * 1. **The registry** — the module contributes its group and its route, the nav
 *    filter shows the item to a holder and drops the empty group for everyone
 *    else, and the *declaration* the module makes grants nobody anything.
 * 2. **The route table** — mounted through `buildAppRoutes(undefined, routes)`,
 *    the same function the browser runs, with the session boundary in front:
 *    the page renders for a caller the server grants, `/records` answers the 403
 *    page for a signed-in caller without the code, and an anonymous visitor goes
 *    to the login screen rather than to 403.
 * 3. **Production** — `APP_MODULES` and the tables derived from it contain none
 *    of it, which is what "kept out of production navigation" means here.
 *
 * The backend half of the same contract is `backend/tests/test_extension_contract.py`.
 */

const HOLDER: MeResponse = {
  created_at: '2026-01-02T03:04:05Z',
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  phone: null,
  is_superuser: false,
  must_change_password: false,
  roles: ['records-reader'],
  permissions: ['files.read'],
}

/** Signed in, allowed on ordinary pages — but not on this module's. */
const WITHOUT: MeResponse = {
  ...HOLDER,
  id: '00000000-0000-7000-8000-000000000002',
  email: 'grace@example.com',
  full_name: 'Grace Hopper',
  roles: ['viewer'],
  permissions: ['users.read', 'reports.generate'],
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

/** The module's contribution, as the registry folds it in. */
const registry = { groups: allNavGroups([DEMO_MODULE]), routes: allRoutes([DEMO_MODULE]) }

function recordsGroup(subject: NavigationAccess) {
  return visibleNavigation(subject, registry).find((group) => group.id === 'records')
}

describe('the module in the registry', () => {
  it('contributes its group and its route, and leaves the built-in ones alone', () => {
    const route = registry.routes.find((entry) => entry.path === '/records')

    expect(route?.id).toBe('demo-records')
    expect(route?.group).toBe('records')
    expect(route?.requiredPermissions).toEqual(['files.read'])

    const groups = registry.groups.map((group) => group.id)
    expect(groups).toContain('records')
    // A module adds to the registry; it does not replace it.
    expect(groups).toContain('overview')
    expect(groups).toContain('administration')
  })

  it('shows its nav item to a holder, and drops the titled group for everyone else', () => {
    const holder = recordsGroup(access({ permissions: ['files.read'] }))
    expect(holder?.items.map((item) => item.path)).toEqual(['/records'])
    expect(holder?.items[0]?.label).toBe('Records')

    // A superuser passes every `requiredPermissions` check…
    expect(recordsGroup(access({ isSuperuser: true }))?.items.map((item) => item.path)).toEqual([
      '/records',
    ])

    // …and a caller without the code gets no item *and* no empty group: the
    // group is dropped rather than rendered as a heading with nothing under it.
    expect(recordsGroup(access({ permissions: ['users.read'] }))).toBeUndefined()
    expect(recordsGroup(ANONYMOUS_ACCESS)).toBeUndefined()
  })

  it('is not granted by the permission the module declares', () => {
    // The module declares `demo_records.read` and requires `files.read`. Nothing
    // in the registry reads the declaration — access is what `/auth/me` reports,
    // which is the server's answer — so a caller holding exactly the declared
    // code and nothing the server granted sees nothing.
    expect(recordsGroup(access({ permissions: ['demo_records.read'] }))).toBeUndefined()
  })

  it('is absent from what the application compiles in', () => {
    expect(APP_MODULES).toEqual([])
    expect(allRoutes().some((entry) => entry.path === '/records')).toBe(false)
    expect(allNavGroups().map((group) => group.id)).not.toContain('records')
  })
})

function renderRoute(initialPath: string, me: MeResponse | null) {
  server.use(
    http.get('/api/v1/auth/me', () =>
      me
        ? HttpResponse.json(me)
        : HttpResponse.json({ detail: 'Not authenticated.' }, { status: 401 }),
    ),
    // The shell reads the account's preferences once per session (F048) and the
    // header's bell polls the unread count (F046).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
  )

  // `undefined` for `access`: the real session boundary, exactly as the browser
  // gets it — the caller's rights come from `/auth/me` through the providers, so
  // what is being tested is the route table rather than an injected fixture.
  const router = createMemoryRouter(buildAppRoutes(undefined, allRoutes([DEMO_MODULE])), {
    initialEntries: [initialPath],
  })
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('/records in the real route table', () => {
  it('renders the module’s page for a caller the server grants the code', async () => {
    renderRoute('/records', HOLDER)

    expect(await screen.findByRole('heading', { name: 'Records' })).toBeInTheDocument()
  })

  it('answers the 403 page for a signed-in caller without the code', async () => {
    renderRoute('/records', WITHOUT)

    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Records' })).toBeNull()
    // The denial is the route-level 403, not the anonymous redirect: a caller
    // who is signed in and not permitted belongs here (§4.6).
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  it('sends an anonymous visitor to the login screen instead', async () => {
    renderRoute('/records', null)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /403/ })).toBeNull()
  })
})
