import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Activity } from 'lucide-react'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import type { RouteDefinition } from '@/config/navigation'

/**
 * The breadcrumb renderer of F016 (its trail logic is covered in
 * navigation.test.ts) — plus the F017 placement rule: a trail of one crumb is
 * the page's own title, so the bar appears only when there is a hierarchy to
 * show. F016's handoff said this component was "tested"; the builder was, the
 * renderer was not, and that is corrected here.
 */
const Noop = () => null

function route(path: string, label: string, extra: Partial<RouteDefinition> = {}): RouteDefinition {
  return { id: path, path, label, icon: Activity, group: 'overview', component: Noop, ...extra }
}

const ROUTES: RouteDefinition[] = [
  route('/dashboard', 'Dashboard'),
  route('/admin', 'Administration'),
  route('/admin/users', 'Users'),
  route('/admin/users/:id', 'User detail', {
    breadcrumb: (params) => `User ${params.id ?? ''}`,
  }),
]

function renderCrumbs(pathname: string) {
  const router = createMemoryRouter([{ path: '*', element: <AppBreadcrumbs routes={ROUTES} /> }], {
    initialEntries: [pathname],
  })
  return render(<RouterProvider router={router} />)
}

describe('AppBreadcrumbs', () => {
  it('links the ancestors and marks the current page', () => {
    renderCrumbs('/admin/users')

    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(nav).toBeInTheDocument()
    // Ancestors are links; the current page is text with aria-current (§1.2).
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(screen.getByText('Users')).toHaveAttribute('aria-current', 'page')
  })

  it('uses the route’s breadcrumb factory for a detail page', () => {
    renderCrumbs('/admin/users/42')

    expect(screen.getByText('User 42')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('stays out of the way when there is no hierarchy to show', () => {
    // One crumb repeats the page title; no trail is drawn for it.
    renderCrumbs('/dashboard')

    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull()
  })

  it('renders nothing for a path the registry does not know', () => {
    renderCrumbs('/nowhere')

    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull()
  })

  it('publishes router links, so an ancestor crumb is navigable', async () => {
    renderCrumbs('/admin/users/42')

    const users = screen.getByRole('link', { name: 'Users' })
    expect(users).toHaveAttribute('href', '/admin/users')
    // It is a real link, not a styled span: pressing it would route there.
    await userEvent.click(users)
    expect(users).toHaveAttribute('href', '/admin/users')
  })
})
