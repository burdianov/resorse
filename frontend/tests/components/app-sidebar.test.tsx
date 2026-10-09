import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Activity, Users } from 'lucide-react'

import { AppSidebar, isNavItemActive } from '@/components/layout/app-sidebar'
import type { SidebarNavGroup } from '@/components/layout/app-sidebar'
import { SIDEBAR_GROUPS_STORAGE_KEY } from '@/components/layout/sidebar-preferences'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Navigation *mechanics* (BIG-PROMPT §4.9) with fixture groups — the shell is
 * fed its items by the caller, so these tests supply two groups and exercise
 * what the registry (F016) will drive: collapsible groups, persisted state,
 * and the active route staying visible. `AppSidebar` is rendered directly,
 * outside the layout, so no page or header is involved.
 */
const GROUPS: SidebarNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ id: 'home', label: 'Home', path: '/', icon: Activity }],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { id: 'users', label: 'Users', path: '/admin/users', icon: Users },
      { id: 'roles', label: 'Roles', path: '/admin/roles' },
    ],
  },
]

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar groups={GROUPS} />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe('AppSidebar navigation', () => {
  it('renders the groups and items it is given', async () => {
    renderSidebar()

    expect(await screen.findByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roles' })).toBeInTheDocument()
  })

  it('collapses a group on click and persists the state', async () => {
    renderSidebar()
    await screen.findByRole('link', { name: 'Users' })

    await userEvent.click(screen.getByText('Administration'))

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    })
    expect(window.localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY)).toBe('{"admin":false}')
  })

  it('restores a persisted collapsed group on the next mount', async () => {
    window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, '{"admin":false}')
    renderSidebar()

    await screen.findByRole('link', { name: 'Home' })
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
  })

  it('ignores malformed stored group state instead of throwing', async () => {
    window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, 'not json')
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('re-opens the group holding the active route and scrolls it into view', async () => {
    window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, '{"admin":false}')
    renderSidebar('/admin/users')

    // The route is in a group the user had closed: it must surface anyway,
    // otherwise the active location is invisible in the navigation.
    const users = await screen.findByRole('link', { name: 'Users' })
    expect(users).toHaveAttribute('aria-current', 'page')
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
  })
})

describe('isNavItemActive', () => {
  it('matches exactly, matches descendants of a section, and exempts root', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/dashboard', '/')).toBe(false)
    expect(isNavItemActive('/admin/users', '/admin')).toBe(true)
    expect(isNavItemActive('/admin/users/42', '/admin/users')).toBe(true)
    expect(isNavItemActive('/admin', '/admin/users')).toBe(false)
    expect(isNavItemActive('/administration', '/admin')).toBe(false)
  })
})
