import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { PermissionGate } from '@/components/common/permission-gate'
import { SecureLink } from '@/components/common/secure-link'
import { AccessProvider } from '@/components/providers/access-provider'
import { ANONYMOUS_ACCESS } from '@/config/access'
import type { NavigationAccess } from '@/config/access'

/**
 * `PermissionGate` and `SecureLink` (BIG-PROMPT §5.2b) — UX only, never the
 * security boundary (§6.3d). They evaluate the registry's `meetsAccess` rule, so
 * they cannot disagree with the navigation filter.
 */
function access(init: {
  permissions?: readonly string[]
  isSuperuser?: boolean
}): NavigationAccess {
  return {
    permissions: new Set(init.permissions ?? []),
    isSuperuser: init.isSuperuser ?? false,
  }
}

function renderWith(accessValue: NavigationAccess, ui: React.ReactNode) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AccessProvider access={accessValue}>
            {ui}
            <LocationProbe />
          </AccessProvider>
        ),
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('PermissionGate', () => {
  it('hides a gated element from an anonymous caller', () => {
    renderWith(ANONYMOUS_ACCESS, (
      <PermissionGate permissions={['users.read']}>Payroll</PermissionGate>
    ))

    expect(screen.queryByText('Payroll')).toBeNull()
  })

  it('renders ungated children for everyone — an empty requirement is public', () => {
    renderWith(ANONYMOUS_ACCESS, <PermissionGate>Public notice</PermissionGate>)

    expect(screen.getByText('Public notice')).toBeInTheDocument()
  })

  it('renders the fallback when the check fails', () => {
    renderWith(ANONYMOUS_ACCESS, (
      <PermissionGate permissions={['users.read']} fallback={<span>Not available</span>}>
        Payroll
      </PermissionGate>
    ))

    expect(screen.queryByText('Payroll')).toBeNull()
    expect(screen.getByText('Not available')).toBeInTheDocument()
  })

  it('requires every listed permission', () => {
    renderWith(access({ permissions: ['users.read'] }), (
      <PermissionGate permissions={['users.read', 'users.update']}>Payroll</PermissionGate>
    ))

    expect(screen.queryByText('Payroll')).toBeNull()
  })

  it('renders the children once the permissions are held', () => {
    renderWith(access({ permissions: ['users.read', 'users.update'] }), (
      <PermissionGate permissions={['users.read', 'users.update']}>Payroll</PermissionGate>
    ))

    expect(screen.getByText('Payroll')).toBeInTheDocument()
  })

  it('enforces the adminOnly gate against administrative authority', () => {
    // reports.generate is real but not an administration namespace.
    renderWith(access({ permissions: ['reports.generate'] }), (
      <PermissionGate adminOnly>Role matrix</PermissionGate>
    ))
    expect(screen.queryByText('Role matrix')).toBeNull()

    renderWith(access({ permissions: ['roles.manage'] }), (
      <PermissionGate adminOnly>Role matrix</PermissionGate>
    ))
    expect(screen.getByText('Role matrix')).toBeInTheDocument()
  })
})

describe('SecureLink', () => {
  it('renders nothing when the caller lacks the permission', () => {
    renderWith(ANONYMOUS_ACCESS, (
      <SecureLink to="/admin/users" permissions={['users.read']}>
        Users
      </SecureLink>
    ))

    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
  })

  it('renders a working link when the caller holds it', async () => {
    renderWith(access({ isSuperuser: true }), (
      <SecureLink to="/admin/users" permissions={['users.read']}>
        Users
      </SecureLink>
    ))

    await userEvent.click(screen.getByRole('link', { name: 'Users' }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/users')
    })
  })

  it('renders the fallback instead of the link', () => {
    renderWith(ANONYMOUS_ACCESS, (
      <SecureLink to="/admin/users" adminOnly fallback={<span>Ask an administrator</span>}>
        Users
      </SecureLink>
    ))

    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(screen.getByText('Ask an administrator')).toBeInTheDocument()
  })
})
