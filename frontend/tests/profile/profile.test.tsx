import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/profile` and `/profile/security` (F042).
 *
 * Acceptance: save/error tests. The save goes through the real `PATCH
 * /auth/me` and then through `auth.refresh()` — so the tests assert both the
 * request and that the session's identity (what the header menu reads) moved
 * with it. The error side is the F018/F019 chain as usual: the server's 422
 * lands on the field that produced it.
 *
 * The security page reuses F032's `ChangePasswordForm` — asserted here as a
 * real submit over the wire, because "reused" must mean "works", not
 * "imported".
 */

configure({ asyncUtilTimeout: 3000 })

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: '00000000-0000-7000-8000-000000000009',
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: '+971 50 000 0000',
    is_superuser: false,
    must_change_password: false,
    created_at: '2026-10-01T08:00:00Z',
    roles: ['admin', 'viewer'],
    permissions: ['reports.generate', 'roles.read', 'users.read'],
    ...overrides,
  }
}

interface Captured {
  patch: Record<string, unknown> | null
  passwordChanges: number
  passwordBody: Record<string, unknown> | null
}

function renderApp(initialPath: string, meUser: MeResponse = me()) {
  const captured: Captured = { patch: null, passwordChanges: 0, passwordBody: null }
  let current = meUser
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(current)),
    // The shell reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.patch('/api/v1/auth/me', async ({ request }) => {
      captured.patch = (await request.json()) as Record<string, unknown>
      current = { ...current, ...(captured.patch as Partial<MeResponse>) }
      return HttpResponse.json(current)
    }),
    http.post('/api/v1/auth/change-password', async ({ request }) => {
      captured.passwordChanges += 1
      captured.passwordBody = (await request.json()) as Record<string, unknown>
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: [initialPath] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

afterEach(() => {
  toast.dismiss()
})

describe('the profile page', () => {
  it('renders identity, account facts, roles and grouped permissions', async () => {
    renderApp('/profile')

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    // Editable, seeded from the session.
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText(/Phone/)).toHaveValue('+971 50 000 0000')
    // Read-only facts.
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('01.10.2026')).toBeInTheDocument() // member since, dd.MM.yyyy
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('viewer')).toBeInTheDocument()
    // Permissions grouped by namespace, mono codes.
    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText('users.read')).toBeInTheDocument()
    expect(screen.getByText('reports.generate')).toBeInTheDocument()
  })

  it('saves the owned fields and refreshes the session identity', async () => {
    const { captured } = renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })

    const name = screen.getByLabelText(/Full name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Ada Byron')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(captured.patch).toEqual({ full_name: 'Ada Byron', phone: '+971 50 000 0000' })
    })
    expect(await screen.findByText('Profile updated')).toBeInTheDocument()

    // The session refresh pulled the new name — visible in the account menu.
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument()
  })

  it('clears the phone by saving it empty', async () => {
    const { captured } = renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })

    const phone = screen.getByLabelText(/Phone/)
    await userEvent.clear(phone)
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(captured.patch).toEqual({ full_name: 'Ada Lovelace', phone: null })
    })
  })

  it('maps a server refusal onto the field it names', async () => {
    renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })
    server.use(
      http.patch('/api/v1/auth/me', () =>
        HttpResponse.json(
          {
            detail: [
              { type: 'value_error', loc: ['body', 'full_name'], msg: 'That name is not allowed.' },
            ],
          },
          { status: 422 },
        ),
      ),
    )

    const name = screen.getByLabelText(/Full name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('That name is not allowed.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('is not a navigation entry, and the menu leads to it', async () => {
    const { router } = renderApp('/dashboard')
    await screen.findByRole('heading', { name: 'Dashboard' })

    // Behind the avatar, never in the sidebar (§4's nav spec).
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Profile' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/profile')
    })
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
  })

  it('still bounces a forced-change user away (the F032 gate outranks profile)', async () => {
    const { router } = renderApp('/profile', me({ must_change_password: true }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/change-password')
    })
  })
})

describe('the security page', () => {
  it('reuses the password form for a real submit', async () => {
    const { captured } = renderApp('/profile/security')

    expect(await screen.findByRole('heading', { name: 'Security' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/^Current password/), 'temporary-secret')
    await userEvent.type(screen.getByLabelText(/^New password/), 'my own correct horse')
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'my own correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => {
      expect(captured.passwordChanges).toBe(1)
    })
    expect(captured.passwordBody).toEqual({
      current_password: 'temporary-secret',
      new_password: 'my own correct horse',
    })
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
  })

  it('is reachable from the account menu', async () => {
    const { router } = renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change password' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/profile/security')
    })
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Current password/)).toBeInTheDocument()
  })
})
