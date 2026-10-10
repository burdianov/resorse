import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { AdminUserItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * F048's acceptance: **cross-account reload**.
 *
 * The column layout lives in the account's `user_preferences` now, so the two
 * things that must hold are the ones F021's local store could not promise:
 * a layout survives a reload on *another machine* (here: a fresh mount reading
 * the server, not `localStorage`), and two accounts on one machine never see
 * each other's layout. Nothing is stubbed below the network — the screen runs
 * through the real provider stack, the real table and the real preferences API.
 *
 * The MSW handlers keep the server's preference rows in a plain object, which
 * is the whole point: the "reload" is an unmount and a remount against the same
 * object, and the account switch is a second object.
 */

configure({ asyncUtilTimeout: 3000 })

const ADA_ID = '00000000-0000-7000-8000-000000000001'
const GRACE_ID = '00000000-0000-7000-8000-000000000003'

/** The server's `user_preferences` rows for one account, keyed as the API keys them. */
type PreferenceRows = Record<string, unknown>

interface Captured {
  puts: { key: string; value: unknown }[]
  deletes: string[]
}

function me(id: string, email: string, fullName: string): MeResponse {
  return {
    id,
    email,
    full_name: fullName,
    phone: null,
    is_superuser: false,
    must_change_password: false,
    roles: ['admin'],
    permissions: ['users.read'],
  }
}

function userItem(overrides: Partial<AdminUserItem> = {}): AdminUserItem {
  return {
    id: GRACE_ID,
    email: 'grace@example.com',
    full_name: 'Grace Hopper',
    phone: null,
    is_active: true,
    is_deleted: false,
    is_superuser: false,
    must_change_password: false,
    last_login_at: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
    roles: [],
    ...overrides,
  }
}

function handlers(options: { meUser: MeResponse; rows: PreferenceRows; captured: Captured }) {
  const { meUser, rows, captured } = options
  return [
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    // The snapshot the shell hydrates the table store from.
    http.get('/api/v1/auth/me/preferences', () =>
      HttpResponse.json({
        items: Object.entries(rows).map(([key, value]) => ({ key, value })),
      }),
    ),
    http.put('/api/v1/auth/me/preferences/:key', async ({ request, params }) => {
      const body = (await request.json()) as { value: unknown }
      const key = String(params.key)
      rows[key] = body.value
      captured.puts.push({ key, value: body.value })
      return HttpResponse.json({ key, value: body.value })
    }),
    http.delete('/api/v1/auth/me/preferences/:key', ({ params }) => {
      const key = String(params.key)
      delete rows[key]
      captured.deletes.push(key)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('/api/v1/admin/roles', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/admin/users', () =>
      HttpResponse.json({
        items: [userItem({ id: ADA_ID, email: 'ada@example.com', full_name: 'Ada Lovelace' })],
        total: 1,
        page: 1,
        page_size: 25,
      }),
    ),
  ] as ReturnType<typeof http.get>[]
}

function renderDirectory(options: { meUser: MeResponse; rows: PreferenceRows }): {
  captured: Captured
  unmount: () => void
} {
  const captured: Captured = { puts: [], deletes: [] }
  server.use(...handlers({ ...options, captured }))
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/users'] })
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { captured, unmount: result.unmount }
}

function headerLabels(): string[] {
  return within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((header) => header.textContent ?? '')
}

async function waitForDirectory() {
  await screen.findByRole('heading', { name: 'Users' })
  await screen.findByText('Ada Lovelace')
}

async function openViewOptions() {
  await userEvent.click(screen.getByRole('button', { name: 'View options' }))
}

afterEach(() => {
  window.localStorage.clear()
})

describe('the account stores its column layout', () => {
  it('writes a hidden column to the account, and a reload brings it back', async () => {
    const rows: PreferenceRows = {}
    const first = renderDirectory({ meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'), rows })
    await waitForDirectory()
    expect(headerLabels()).toContain('Email')

    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'email' }))
    await waitFor(() => {
      expect(headerLabels()).not.toContain('Email')
    })

    // The write went to the account's preference key, and nowhere else.
    await waitFor(() => {
      expect(first.captured.puts).toHaveLength(1)
    })
    expect(first.captured.puts[0]?.key).toBe('app.table.admin-users')
    expect(first.captured.puts[0]?.value).toEqual({
      columnVisibility: { email: false },
      columnOrder: [],
    })
    // The key carries no user id: the API is scoped by the session (F041).
    expect(first.captured.puts[0]?.key).not.toContain(ADA_ID)

    // Reload — a fresh mount, reading the server, not localStorage.
    first.unmount()
    renderDirectory({ meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'), rows })
    await waitForDirectory()

    expect(headerLabels()).not.toContain('Email')
  })

  it('Reset columns deletes the stored layout and restores every column', async () => {
    const rows: PreferenceRows = {
      'app.table.admin-users': { columnVisibility: { email: false }, columnOrder: [] },
    }
    const { captured } = renderDirectory({
      meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'),
      rows,
    })
    await waitForDirectory()
    // The stored layout was applied before the first table render.
    expect(headerLabels()).not.toContain('Email')

    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset columns' }))

    await waitFor(() => {
      expect(captured.deletes).toEqual(['app.table.admin-users'])
    })
    await waitFor(() => {
      expect(headerLabels()).toContain('Email')
    })
    // "No preference" is the honest record: the row is gone, not the defaults.
    expect(rows).not.toHaveProperty('app.table.admin-users')
  })
})

describe('cross-account isolation', () => {
  it('keeps two accounts on one machine apart', async () => {
    const adaRows: PreferenceRows = {}
    // Grace's account already holds a layout — and a different one, so "her
    // layout is hers" cannot pass by both sides falling back to the defaults.
    const graceRows: PreferenceRows = {
      'app.table.admin-users': { columnVisibility: { roles: false }, columnOrder: [] },
    }

    const ada = renderDirectory({ meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'), rows: adaRows })
    await waitForDirectory()
    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'email' }))
    await waitFor(() => {
      expect(ada.captured.puts).toHaveLength(1)
    })
    // The edit went to Ada's account, not to a shared place on the machine.
    expect(adaRows['app.table.admin-users']).toEqual({
      columnVisibility: { email: false },
      columnOrder: [],
    })
    ada.unmount()

    // Grace signs in on the same machine. Her own layout applies and Ada's
    // hidden column is visible again — nothing carried over.
    renderDirectory({ meUser: me(GRACE_ID, 'grace@example.com', 'Grace Hopper'), rows: graceRows })
    await waitForDirectory()

    expect(headerLabels()).toContain('Email')
    expect(headerLabels()).not.toContain('Roles')
  })
})

describe('the account theme', () => {
  it('adopts the stored theme once the snapshot lands', async () => {
    const rows: PreferenceRows = { 'app.theme': 'dark' }
    renderDirectory({ meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'), rows })
    await waitForDirectory()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('writes a theme the user chooses back to the account', async () => {
    const rows: PreferenceRows = { 'app.theme': 'light' }
    const { captured } = renderDirectory({
      meUser: me(ADA_ID, 'ada@example.com', 'Ada Lovelace'),
      rows,
    })
    await waitForDirectory()

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    await waitFor(() => {
      expect(captured.puts).toContainEqual({ key: 'app.theme', value: 'dark' })
    })
  })
})
