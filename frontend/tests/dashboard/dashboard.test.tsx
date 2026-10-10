import { configure, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/dashboard` (F047) through the real route table, providers and `api.ts`,
 * with MSW standing in for the network. The page must show only what the
 * session and the API say: identity from `/auth/me`, the unread count from the
 * bell's own query, and quick links from the navigation registry.
 *
 * Pinned here: the identity and permission summary, quick links filtered by
 * permission (and never the Dashboard entry itself), the unread count equal to
 * the bell's badge from one shared request, the absence of the notice card
 * without `notifications.read`, and the inline error with a working retry.
 */

configure({ asyncUtilTimeout: 3000 })

const USER_ID = '00000000-0000-7000-8000-000000000021'

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: USER_ID,
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: null,
    is_superuser: false,
    must_change_password: false,
    created_at: '2026-10-01T08:00:00Z',
    roles: ['viewer'],
    permissions: ['notifications.read', 'notifications.manage_own'],
    ...overrides,
  }
}

interface Fixture {
  unreadCountCalls: () => number
}

/** Stub the two endpoints the dashboard and the header bell read. */
function signIn(user: MeResponse, unread: { status?: number; count?: number } = {}): Fixture {
  let calls = 0
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(user)),
    // The shell reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => {
      calls += 1
      if (unread.status !== undefined) {
        return HttpResponse.json({ detail: 'Unavailable.' }, { status: unread.status })
      }
      return HttpResponse.json({ unread_count: unread.count ?? 0 })
    }),
  )
  return { unreadCountCalls: () => calls }
}

function renderDashboard() {
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/dashboard'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

function cardFor(title: string): HTMLElement {
  const card = screen.getByRole('heading', { name: title }).closest('[data-slot="card"]')
  if (card === null) throw new Error(`no card for ${title}`)
  return card as HTMLElement
}

describe('identity', () => {
  it('shows the signed-in name, email, roles and a namespace permission summary', async () => {
    signIn(
      me({
        roles: ['viewer', 'auditor'],
        permissions: ['notifications.read', 'audit.read', 'audit.export'],
      }),
      {
        count: 0,
      },
    )
    renderDashboard()

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Ada Lovelace' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('viewer')).toBeInTheDocument()
    expect(screen.getByText('auditor')).toBeInTheDocument()
    // Counts per namespace, not a list of raw codes.
    expect(screen.getByText('audit (2)')).toBeInTheDocument()
    expect(screen.getByText('notifications (1)')).toBeInTheDocument()
  })

  it('says so plainly when the account has no roles or permissions', async () => {
    signIn(me({ roles: [], permissions: [] }))
    renderDashboard()

    expect(await screen.findByText('No roles are assigned to your account.')).toBeInTheDocument()
    expect(screen.getByText('No permissions are granted to your account.')).toBeInTheDocument()
  })

  it('states the super-administrator grant instead of listing codes', async () => {
    signIn(me({ is_superuser: true, roles: ['super_admin'], permissions: [] }), { count: 0 })
    renderDashboard()

    expect(
      await screen.findByText('Super-administrator: every permission is granted to this account.'),
    ).toBeInTheDocument()
  })
})

describe('quick links', () => {
  it('shows only the pages the caller may open, and never the Dashboard entry', async () => {
    signIn(me({ permissions: ['notifications.read'] }), { count: 0 })
    renderDashboard()

    const links = within(await waitForQuickLinks())
    expect(links.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    )
    expect(links.queryByRole('link', { name: 'Dashboard' })).toBeNull()
    expect(links.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(links.queryByRole('link', { name: 'Roles' })).toBeNull()
    expect(links.queryByRole('link', { name: 'Audit Trail' })).toBeNull()
  })

  it('opens the administration pages a permitted caller holds, grouped as in the sidebar', async () => {
    signIn(me({ permissions: ['users.read', 'audit.read'] }), { count: 0 })
    renderDashboard()

    const links = within(await waitForQuickLinks())
    expect(links.getByRole('heading', { name: 'Administration' })).toBeInTheDocument()
    expect(links.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users')
    expect(links.getByRole('link', { name: 'Audit Trail' })).toHaveAttribute('href', '/admin/audit')
    expect(links.queryByRole('link', { name: 'Roles' })).toBeNull()
  })

  it('says there is nothing to open when no page is visible', async () => {
    signIn(me({ roles: [], permissions: [] }))
    renderDashboard()

    expect(await screen.findByText('No other pages are open to your account')).toBeInTheDocument()
  })
})

describe('unread notices', () => {
  it('shows the count the bell shows, from one shared request', async () => {
    const fixture = signIn(me(), { count: 7 })
    renderDashboard()

    expect(
      await screen.findByRole('button', { name: 'Notifications, 7 unread' }),
    ).toBeInTheDocument()
    expect(await within(cardFor('Unread notifications')).findByText('7')).toBeInTheDocument()
    // One query key feeds the badge and the card: the endpoint is read once.
    expect(fixture.unreadCountCalls()).toBe(1)
  })

  it('links to the inbox', async () => {
    signIn(me(), { count: 2 })
    renderDashboard()

    await screen.findByRole('heading', { name: 'Unread notifications' })
    const card = cardFor('Unread notifications')
    expect(await within(card).findByRole('link', { name: 'Open notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    )
  })

  it('is absent, with no request, when the caller cannot read notifications', async () => {
    const fixture = signIn(me({ permissions: [] }))
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Quick links' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Unread notifications' })).toBeNull()
    expect(fixture.unreadCountCalls()).toBe(0)
  })

  it('shows an inline error with a working retry, not a made-up number', async () => {
    // The app retries a 5xx once silently (query-provider), so the endpoint
    // must keep failing through that retry for the error to reach the card.
    let failing = true
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(me())),
      http.get('/api/v1/notifications/unread-count', () => {
        if (failing) return HttpResponse.json({ detail: 'Unavailable.' }, { status: 500 })
        return HttpResponse.json({ unread_count: 3 })
      }),
    )
    renderDashboard()

    await screen.findByRole('heading', { name: 'Unread notifications' })
    const card = cardFor('Unread notifications')
    expect(await within(card).findByText('Something went wrong')).toBeInTheDocument()
    expect(within(card).queryByText(/^\d+$/)).toBeNull()

    failing = false
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(await within(card).findByText('3')).toBeInTheDocument()
  })
})

/** The dashboard renders its cards once `/auth/me` has answered; wait for that. */
async function waitForQuickLinks(): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: 'Quick links' })
  return cardFor('Quick links')
}
