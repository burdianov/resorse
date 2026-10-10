import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { AuditItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/admin/audit` (F044).
 *
 * The acceptance is "admin-only UI tests": the route holds `audit.read` (the
 * server refuses regardless — F031's guard is the boundary), the table is
 * server-mode with the F034 shape, the filter options come from the
 * response's own vocabulary (C33), and the detail modal renders the row it
 * already has — before/after diffs included, correlation id shown. There is
 * deliberately nothing to test about mutations: the trail has no write path,
 * and the screen renders none.
 */

configure({ asyncUtilTimeout: 3000 })

const ACTIONS = ['user.create', 'user.update', 'setting.update']
const ENTITY_TYPES = ['user', 'setting']

function item(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: '30000000-0000-7000-8000-000000000001',
    created_at: '2026-10-10T09:30:00Z',
    user_id: '00000000-0000-7000-8000-000000000009',
    actor_email: 'root@example.com',
    action: 'user.update',
    entity_type: 'user',
    entity_id: '00000000-0000-7000-8000-000000000002',
    summary: 'Updated user ada@example.com.',
    details: { before: { full_name: 'Ada Lovelace' }, after: { full_name: 'Ada Byron' } },
    correlation_id: 'req-42',
    ...overrides,
  }
}

function me(): MeResponse {
  return {
    id: '00000000-0000-7000-8000-000000000009',
    email: 'root@example.com',
    full_name: 'Root Operator',
    phone: null,
    is_superuser: true,
    must_change_password: false,
    created_at: '2026-10-01T08:00:00Z',
    roles: ['super_admin'],
    permissions: ['audit.read'],
  }
}

interface Captured {
  params: URLSearchParams[]
}

function renderAudit(items: AuditItem[] = [item()], total = items.length) {
  const captured: Captured = { params: [] }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(me())),
    // The shell also reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    // The shell's bell polls this on every authenticated page (F046); this
    // file does not exercise notifications, so it stands at zero.
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/admin/audit', ({ request }) => {
      const params = new URL(request.url).searchParams
      captured.params.push(params)
      return HttpResponse.json({
        items,
        total,
        page: Number(params.get('page') ?? '1'),
        page_size: Number(params.get('page_size') ?? '25'),
        actions: ACTIONS,
        entity_types: ENTITY_TYPES,
      })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/audit'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

function lastParams(captured: Captured): URLSearchParams {
  const params = captured.params.at(-1)
  if (!params) throw new Error('no audit request captured')
  return params
}

async function waitForRows(summary = 'Updated user ada@example.com.') {
  await screen.findByRole('heading', { name: 'Audit Trail' })
  await screen.findByText(summary)
}

afterEach(() => {
  // Nothing global to clean; teardown lives in src/testing/setup.ts.
})

describe('the trail table', () => {
  it('renders the events, read-only, with no sort buttons', async () => {
    renderAudit()
    await waitForRows()

    expect(screen.getByText('user.update')).toBeInTheDocument()
    expect(screen.getByText('root@example.com')).toBeInTheDocument()
    // Fixed chronological order: the time header is a label, not a button.
    expect(screen.queryByRole('button', { name: /Time/ })).toBeNull()
    // Read-only by construction: no creation or destructive controls exist.
    expect(screen.queryByRole('button', { name: /Add|Delete/ })).toBeNull()
  })

  it('sends the filters from the server vocabulary and page state', async () => {
    const { captured } = renderAudit()
    await waitForRows()

    await userEvent.click(screen.getByLabelText('Action'))
    await userEvent.click(await screen.findByRole('option', { name: 'user.create' }))
    await waitFor(() => {
      expect(lastParams(captured).get('action')).toBe('user.create')
    })

    await userEvent.click(screen.getByLabelText('Entity'))
    await userEvent.click(await screen.findByRole('option', { name: 'setting' }))
    await waitFor(() => {
      expect(lastParams(captured).get('entity_type')).toBe('setting')
    })

    await userEvent.click(screen.getByLabelText('Period'))
    await userEvent.click(await screen.findByRole('option', { name: 'Last 24 hours' }))
    await waitFor(() => {
      const since = lastParams(captured).get('since')
      expect(since).not.toBeNull()
      expect(new Date(since as string).getTime()).toBeLessThan(Date.now())
    })

    await userEvent.type(screen.getByPlaceholderText(/Search summaries or actors/), 'ada')
    await waitFor(() => {
      expect(lastParams(captured).get('search')).toBe('ada')
    })
  })

  it('paginates through the server with its total', async () => {
    const { captured } = renderAudit([item()], 30)
    await waitForRows()
    expect(screen.getByText(/of 30/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => {
      expect(lastParams(captured).get('page')).toBe('2')
    })
  })
})

describe('the detail modal', () => {
  it('renders the sanitized diff and the correlation id from the row', async () => {
    renderAudit()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: /Actions for Updated user/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'View details' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Before')).toBeInTheDocument()
    expect(within(dialog).getByText('After')).toBeInTheDocument()
    expect(within(dialog).getByText(/Ada Lovelace/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Ada Byron/)).toBeInTheDocument()
    expect(within(dialog).getByText('req-42')).toBeInTheDocument()
    // No second request: the modal rendered the row it had.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders the per-key changes shape (matrix/settings saves)', async () => {
    renderAudit([
      item({
        id: '30000000-0000-7000-8000-000000000002',
        action: 'setting.update',
        entity_type: 'setting',
        entity_id: null,
        summary: 'Updated application settings (1 key(s) changed).',
        details: { changes: { 'branding.app_name': { before: 'Old', after: 'New' } } },
        correlation_id: null,
      }),
    ])
    await waitForRows('Updated application settings (1 key(s) changed).')

    await userEvent.click(
      screen.getByRole('button', { name: /Actions for Updated application settings/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'View details' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('branding.app_name')).toBeInTheDocument()
    expect(within(dialog).getByText(/Old/)).toBeInTheDocument()
    expect(within(dialog).getByText(/New/)).toBeInTheDocument()
    // A service-level event says so instead of inventing an id.
    expect(within(dialog).getByText('— (no request)')).toBeInTheDocument()
  })
})
