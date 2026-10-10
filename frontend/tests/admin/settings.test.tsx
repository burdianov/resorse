import { configure, render, screen, waitFor, within } from '@testing-library/react'
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
 * `/admin/settings` — the settings editor (F040).
 *
 * Acceptance: validation/reload tests. "Reload" is proven the way a test
 * can: the page seeds from the API's snapshot (a fresh mount shows persisted
 * values, defaults included), and a save re-seeds from the response — the
 * restart-across-processes half is F039's own test. "Validation" is proven
 * twice over: client-side shape rules refuse obvious mistakes without a
 * request, and the server's per-key 422s land on the field named after the
 * registry key — no translation table, which is the point of C28's
 * bare-map contract.
 */

configure({ asyncUtilTimeout: 3000 })

const SNAPSHOT = {
  'branding.app_name': 'Application Platform',
  'branding.app_description': '',
  'display.date_format': 'DD.MM.YYYY',
  'display.timezone': 'Asia/Dubai',
}

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: '00000000-0000-7000-8000-000000000009',
    email: 'root@example.com',
    full_name: 'Root Operator',
    phone: null,
    is_superuser: true,
    must_change_password: false,
    roles: ['super_admin'],
    permissions: ['settings.read', 'settings.manage'],
    ...overrides,
  }
}

interface Captured {
  puts: number
  body: Record<string, unknown> | null
}

function renderSettings(options: { meUser?: MeResponse; snapshot?: Record<string, unknown> } = {}) {
  const captured: Captured = { puts: 0, body: null }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(options.meUser ?? me())),
    // The shell also reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    // The shell's bell polls this on every authenticated page (F046).
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/admin/settings', () =>
      HttpResponse.json({ values: { ...SNAPSHOT, ...(options.snapshot ?? {}) } }),
    ),
    http.put('/api/v1/admin/settings', async ({ request }) => {
      captured.puts += 1
      captured.body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ values: { ...SNAPSHOT, ...(captured.body as object) } })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/settings'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

async function waitForForm() {
  await screen.findByRole('heading', { name: 'Settings' })
  const name = await screen.findByLabelText(/Application name/)
  await waitFor(() => {
    expect(name).toHaveValue('Application Platform')
  })
}

afterEach(() => {
  toast.dismiss()
})

describe('reload: the form is seeded from the server', () => {
  it('shows persisted values and defaults on first render', async () => {
    renderSettings({ snapshot: { 'branding.app_name': 'Acme Manpower', 'display.date_format': 'YYYY-MM-DD' } })

    await screen.findByRole('heading', { name: 'Settings' })
    // The page renders the form first and seeds it when the snapshot lands
    // (one `reset`); wait for the seed instead of racing it — a cold-cache
    // run exposed the race because the label exists a beat before the value.
    const appName = await screen.findByLabelText(/Application name/)
    await waitFor(() => {
      expect(appName).toHaveValue('Acme Manpower')
    })
    expect(screen.getByLabelText(/Date format/)).toHaveTextContent('YYYY-MM-DD')
    expect(screen.getByLabelText(/Timezone/)).toHaveValue('Asia/Dubai')
    // Card sections, both present.
    expect(screen.getByRole('heading', { name: 'Branding' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument()
  })

  it('re-seeds the form from the save response', async () => {
    renderSettings()
    await waitForForm()

    const name = screen.getByLabelText(/Application name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed App')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Application name/)).toHaveValue('Renamed App')
    })
    expect(await screen.findByText('Settings saved')).toBeInTheDocument()
  })
})

describe('validation', () => {
  it('refuses a too-short name locally, without a request', async () => {
    const { captured } = renderSettings()
    await waitForForm()

    const name = screen.getByLabelText(/Application name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'ab')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Use at least 3 characters.')).toBeInTheDocument()
    expect(captured.puts).toBe(0)
  })

  it('maps the server timezone refusal onto the field named after the registry key', async () => {
    renderSettings()
    await waitForForm()
    server.use(
      http.put('/api/v1/admin/settings', () =>
        HttpResponse.json(
          {
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'display.timezone'],
                msg: 'Choose a valid IANA timezone, e.g. `Asia/Dubai`.',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    )

    const timezone = screen.getByLabelText(/Timezone/)
    await userEvent.clear(timezone)
    await userEvent.type(timezone, 'Mars/Olympus')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // The loc path IS the field name — no translation anywhere.
    expect(
      await screen.findByText('Choose a valid IANA timezone, e.g. `Asia/Dubai`.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Timezone/)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('saving', () => {
  it('sends one bare-map PUT with every registry key', async () => {
    const { captured } = renderSettings()
    await waitForForm()

    const description = screen.getByLabelText(/Description/)
    await userEvent.type(description, 'Manpower, deployed.')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.puts).toBe(1)
    })
    expect(captured.body).toEqual({
      'branding.app_name': 'Application Platform',
      'branding.app_description': 'Manpower, deployed.',
      'display.date_format': 'DD.MM.YYYY',
      'display.timezone': 'Asia/Dubai',
    })
  })

  it('renders the values read-only without settings.manage', async () => {
    renderSettings({ meUser: me({ permissions: ['settings.read'], is_superuser: false, roles: ['viewer'] }) })

    await waitForForm()

    expect(screen.getByLabelText(/Application name/)).toBeDisabled()
    expect(screen.getByLabelText(/Timezone/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })
})
