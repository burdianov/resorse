import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Activity } from 'lucide-react'
import type { ComponentType } from 'react'

import { buildAppRoutes } from '@/app/router'
import { AccessProvider } from '@/components/providers/access-provider'
import { RouteGuard } from '@/components/layout/route-guard'
import { ThemeProvider } from '@/components/providers/theme-provider'
import type { NavigationAccess, RouteDefinition } from '@/config/navigation'

/**
 * The F017 route states, exercised through the **real** route table (`appRoutes`)
 * rather than a re-declaration, so what ships is what is asserted:
 * the root redirect, `/admin` → 403 while it has no target, the 404 catch-all,
 * direct 403, the route error boundary, and the automatic guard/permission
 * wiring `buildRouteObjects` applies to registry routes.
 */
function renderApp(initialPath: string) {
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: [initialPath] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

const Noop = () => <p>the page</p>

function route(
  definition: Partial<RouteDefinition> & { id: string; path: string },
): RouteDefinition {
  return { label: definition.id, icon: Activity, group: 'overview', component: Noop, ...definition }
}

/**
 * The real table, but built from fixture routes and (when given) a fixture
 * access — the same `buildAppRoutes` the app ships, so the route states under
 * test are the ones that run.
 */
function renderRoutes(
  routes: readonly RouteDefinition[],
  initialPath: string,
  access?: NavigationAccess,
) {
  const router = createMemoryRouter(buildAppRoutes(access, routes), {
    initialEntries: [initialPath],
  })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

afterEach(() => {
  window.localStorage.clear()
})

describe('root redirect', () => {
  it('sends / to /dashboard', async () => {
    const router = renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('renders the registered dashboard inside the shell and marks it active', async () => {
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    // The placeholder is honest about itself — no fabricated KPI tiles (§3.2b).
    expect(screen.getByText(/arrives in F047/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('/admin redirect', () => {
  it('shows the 403 for a caller with no administration route to open', async () => {
    const router = renderApp('/admin')

    expect(await screen.findByRole('heading', { name: '403 — Not authorised' })).toBeInTheDocument()
    // A denial, not a redirect into a login flow — those stay distinct (§4.6).
    expect(router.state.location.pathname).toBe('/admin')
  })

  it('redirects to the first permitted administration route', async () => {
    const adminRoute = route({
      id: 'users',
      path: '/admin/users',
      label: 'Users',
      group: 'administration',
      requiredPermissions: ['users.read'],
      adminOnly: true,
    })
    const router = renderRoutes([adminRoute], '/admin', {
      permissions: new Set(['users.read']),
      isSuperuser: false,
    })

    expect(await screen.findByText('the page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/users')
  })
})

describe('not found', () => {
  it('renders the 404 page for an unknown path, inside the shell', async () => {
    renderApp('/nothing/here')

    expect(await screen.findByRole('heading', { name: '404 — Page not found' })).toBeInTheDocument()
    // The frame survives: a mistyped URL costs a click, not a reload.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders the same page on a direct visit to /404', async () => {
    renderApp('/404')

    expect(await screen.findByRole('heading', { name: '404 — Page not found' })).toBeInTheDocument()
  })

  it('renders the 403 page on a direct visit to /403', async () => {
    renderApp('/403')

    expect(await screen.findByRole('heading', { name: '403 — Not authorised' })).toBeInTheDocument()
  })
})

describe('route guard', () => {
  it('denies a direct visit to a permission-gated route', async () => {
    const gated = route({
      id: 'users',
      path: '/admin/users',
      label: 'Users',
      group: 'administration',
      requiredPermissions: ['users.read'],
    })

    renderRoutes([gated], '/admin/users')

    expect(await screen.findByRole('heading', { name: '403 — Not authorised' })).toBeInTheDocument()
    expect(screen.queryByText('the page')).toBeNull()
  })

  it('renders the page when the caller holds the permission', async () => {
    const gated = route({
      id: 'users',
      path: '/admin/users',
      label: 'Users',
      group: 'administration',
      requiredPermissions: ['users.read'],
    })

    renderRoutes([gated], '/admin/users', {
      permissions: new Set(['users.read']),
      isSuperuser: false,
    })

    expect(await screen.findByText('the page')).toBeInTheDocument()
  })

  it('evaluates through AccessProvider when rendered directly', () => {
    const granted: NavigationAccess = { permissions: new Set(['audit.read']), isSuperuser: false }
    const denied: NavigationAccess = { permissions: new Set(), isSuperuser: false }

    function Harness({ access }: { access: NavigationAccess }) {
      return (
        // The 403 page contains router links, so even this unit test needs a router.
        <MemoryRouter>
          <AccessProvider access={access}>
            <RouteGuard permissions={['audit.read']}>
              <p>audit list</p>
            </RouteGuard>
          </AccessProvider>
        </MemoryRouter>
      )
    }

    const { unmount } = render(<Harness access={granted} />)
    expect(screen.getByText('audit list')).toBeInTheDocument()
    unmount()

    render(<Harness access={denied} />)
    expect(screen.queryByText('audit list')).toBeNull()
    expect(screen.getByRole('heading', { name: '403 — Not authorised' })).toBeInTheDocument()
  })
})

describe('route error boundary', () => {
  it('keeps the shell and offers Retry when a page throws', async () => {
    // React logs the caught render error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const Exploding: ComponentType = () => {
      throw new Error('boom')
    }
    const bomb = route({ id: 'bomb', path: '/bomb', component: Exploding })

    renderRoutes([bomb], '/bomb')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // The frame is intact — the navigation still renders around the failure.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()

    // Nothing from the thrown error is displayed (§6.2f, no leak).
    expect(screen.queryByText(/boom/)).toBeNull()
  })
})
