import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import { api, CSRF_COOKIE_NAME, readCsrfToken } from '@/lib/api'
import type { MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * The browser auth flows (F032, BIG-PROMPT §6.2e/§7.1) — the acceptance's
 * "browser auth flow test", run through the **real** route table, the real
 * provider stack and the real `api.ts` (MSW standing in for the network).
 * Playwright arrives with F057; until then this is the closest thing to a
 * browser the project owns, and it exercises the same wiring a browser would:
 * the session boundary, the login form, the forced-change step, the account
 * menu, the registered 401 re-resolution, and the CSRF header.
 *
 * What each test pins is in its name; two deserve a sentence here:
 *
 * - **Network failure is not a logout** (§6.2e): an unreachable `/auth/me`
 *   shows Retry and *stays* where the user was — only a clear 401 redirects.
 * - **The 401 re-resolution is the real handler**: `AuthProvider` registers it
 *   with `api.ts`; the test then drives a plain request into a 401 and watches
 *   the session re-resolve and the request retry once.
 */

// Budget: these tests type whole passwords keystroke by keystroke and cross
// two network round trips per action; on a cold transform cache the full flow
// legitimately takes longer than RTL's 1 s default, and a suite that flakes
// under load is the failure mode this project refuses to ship. Vitest isolates
// module state per test file, so this default is scoped to this file.
configure({ asyncUtilTimeout: 3000 })

const ME: MeResponse = {
  created_at: '2026-01-02T03:04:05Z',
  id: '0192acde-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  phone: null,
  is_superuser: false,
  must_change_password: false,
  roles: ['viewer'],
  permissions: ['reports.generate'],
}

type MeAnswer = MeResponse | 'unauthorized'

/** Answers successive `/auth/me` calls from a queue; the last answer repeats. */
function meQueue(...answers: MeAnswer[]) {
  let index = 0
  return http.get('/api/v1/auth/me', () => {
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    if (answer === 'unauthorized' || answer === undefined) {
      return HttpResponse.json({ detail: 'Not authenticated.' }, { status: 401 })
    }
    return HttpResponse.json(answer)
  })
}

function renderApp(initialPath = '/dashboard') {
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: [initialPath] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

async function signIn() {
  await userEvent.type(screen.getByLabelText(/Email/), 'ada@example.com')
  await userEvent.type(screen.getByLabelText(/^Password/), 'correct horse battery staple')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

afterEach(() => {
  toast.dismiss()
  vi.restoreAllMocks()
})

/** The shell reads the account's preferences once per session (F048). None of
 * these flows store one, so the snapshot is empty for every test here. */
beforeEach(() => {
  server.use(http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })))
})

describe('the session boundary', () => {
  it('sends an anonymous visitor to the login page and back to where they were going', async () => {
    server.use(
      meQueue('unauthorized', ME),
      http.post('/api/v1/auth/login', () => HttpResponse.json({})),
    )
    const router = renderApp('/admin')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    await signIn()

    // /admin has no registered administration route, so its redirect lands on
    // the 403 — the point is that it landed on /admin, not /dashboard: the
    // intended path survived the login round trip.
    expect(await screen.findByRole('heading', { name: '403 — Not authorised' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
  })

  it('shows Retry — not the login page — when the session cannot be checked', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()))
    const router = renderApp('/dashboard')

    // §6.2e: a network failure is not a logout.
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
    expect(router.state.location.pathname).toBe('/dashboard')

    // The server comes back; Retry resolves the session and enters the app.
    server.use(meQueue(ME))
    await userEvent.click(retry)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('routes an authenticated visit to /login straight through', async () => {
    server.use(meQueue({ ...ME, must_change_password: true }))
    const router = renderApp('/login')

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/change-password')
  })
})

describe('signing in', () => {
  it('shows the server refusal on the form and stays put', async () => {
    server.use(
      meQueue('unauthorized'),
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 401 }),
      ),
    )
    const router = renderApp()
    await screen.findByRole('heading', { name: 'Sign in' })

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid email or password.')
    expect(router.state.location.pathname).toBe('/login')
  })

  it('validates the empty form locally, without a request', async () => {
    let loginCalls = 0
    server.use(
      meQueue('unauthorized'),
      http.post('/api/v1/auth/login', () => {
        loginCalls += 1
        return HttpResponse.json({})
      }),
    )
    renderApp()
    await screen.findByRole('heading', { name: 'Sign in' })

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(loginCalls).toBe(0)
  })
})

describe('the forced password change', () => {
  it('lands on the change step and bounces attempts to leave', async () => {
    server.use(meQueue('unauthorized', { ...ME, must_change_password: true }))
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.json({})))
    const router = renderApp()

    await screen.findByRole('heading', { name: 'Sign in' })
    await signIn()

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/must set its own password before continuing/)).toBeInTheDocument()

    await router.navigate('/dashboard')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/change-password')
    })
  })

  it('completes the change, carries the CSRF header, and enters the app', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(`${CSRF_COOKIE_NAME}=csrf-token-1`)
    let csrfSeen: string | null = null
    server.use(
      meQueue('unauthorized', { ...ME, must_change_password: true }, ME),
      http.post('/api/v1/auth/login', () => HttpResponse.json({})),
      http.post('/api/v1/auth/change-password', ({ request }) => {
        csrfSeen = request.headers.get('x-csrf-token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp()

    await screen.findByRole('heading', { name: 'Sign in' })
    await signIn()
    await screen.findByRole('heading', { name: 'Choose a new password' })

    await userEvent.type(screen.getByLabelText(/^Current password/), 'temporary-secret')
    await userEvent.type(screen.getByLabelText(/^New password/), 'my own correct horse')
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'my own correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
    // The double-submit rode the request (F029's middleware would 403 without it).
    expect(csrfSeen).toBe('csrf-token-1')
  })

  it('maps the server 422s onto the inputs', async () => {
    server.use(
      meQueue('unauthorized', { ...ME, must_change_password: true }),
      http.post('/api/v1/auth/login', () => HttpResponse.json({})),
      http.post('/api/v1/auth/change-password', () =>
        HttpResponse.json(
          {
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'current_password'],
                msg: 'Current password is incorrect.',
              },
              {
                type: 'value_error',
                loc: ['body', 'new_password'],
                msg: 'Password must be at least 12 characters long.',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const router = renderApp()

    await screen.findByRole('heading', { name: 'Sign in' })
    await signIn()
    await screen.findByRole('heading', { name: 'Choose a new password' })

    await userEvent.type(screen.getByLabelText(/^Current password/), 'wrong')
    await userEvent.type(screen.getByLabelText(/^New password/), 'short')
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    // Field-addressable, exactly as F030 built them: each message sits next
    // to the input whose 422 `loc` names it.
    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 12 characters long.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Current password/)).toHaveAttribute('aria-invalid', 'true')
    expect(router.state.location.pathname).toBe('/change-password')
  })

  it('refuses a mismatched confirmation without asking the server', async () => {
    let changeCalls = 0
    server.use(
      meQueue('unauthorized', { ...ME, must_change_password: true }),
      http.post('/api/v1/auth/login', () => HttpResponse.json({})),
      http.post('/api/v1/auth/change-password', () => {
        changeCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp()

    await screen.findByRole('heading', { name: 'Sign in' })
    await signIn()
    await screen.findByRole('heading', { name: 'Choose a new password' })

    await userEvent.type(screen.getByLabelText(/^Current password/), 'temporary-secret')
    await userEvent.type(screen.getByLabelText(/^New password/), 'one correct horse')
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'another horse')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/confirmation does not match/)).toBeInTheDocument()
    expect(changeCalls).toBe(0)
  })
})

describe('signing out', () => {
  it('signs out from the account menu', async () => {
    server.use(
      meQueue(ME),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    )
    const router = renderApp('/dashboard')
    await screen.findByRole('heading', { name: 'Dashboard' })

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })

  it('ends every session only behind the confirmation', async () => {
    let logoutAllCalls = 0
    server.use(
      meQueue(ME),
      http.post('/api/v1/auth/logout-all', () => {
        logoutAllCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/dashboard')
    await screen.findByRole('heading', { name: 'Dashboard' })

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Sign out everywhere/ }))

    // Nothing happened yet — the dialog asks first.
    expect(logoutAllCalls).toBe(0)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(logoutAllCalls).toBe(1)
  })
})

describe('the 401 re-resolution (F018 machinery, F032 handler)', () => {
  it('re-checks the session and retries the original request once', async () => {
    let meCalls = 0
    let secureCalls = 0
    server.use(
      http.get('/api/v1/auth/me', () => {
        meCalls += 1
        return HttpResponse.json(ME)
      }),
      http.get('/api/v1/secure', () => {
        secureCalls += 1
        if (secureCalls === 1) {
          return HttpResponse.json({ detail: 'Not authenticated.' }, { status: 401 })
        }
        return HttpResponse.json({ ok: true })
      }),
    )
    renderApp('/dashboard')
    await screen.findByRole('heading', { name: 'Dashboard' })

    const result = await api.get<{ ok: boolean }>('/api/v1/secure')

    expect(result).toEqual({ ok: true })
    expect(secureCalls).toBe(2) // original + one retry
    expect(meCalls).toBe(2) // mount resolution + the 401 re-resolution
  })
})

describe('readCsrfToken', () => {
  it('extracts the companion cookie from a cookie header', () => {
    expect(readCsrfToken(`other=1; ${CSRF_COOKIE_NAME}=abc123; more=2`)).toBe('abc123')
  })

  it('returns null when the cookie is absent', () => {
    expect(readCsrfToken('other=1')).toBeNull()
    expect(readCsrfToken('')).toBeNull()
  })
})
