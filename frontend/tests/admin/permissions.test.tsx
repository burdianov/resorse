import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse, PermissionItem } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/admin/permissions` — the dictionary table (F038).
 *
 * Acceptance: CRUD UI tests. The table is client-mode (C25/C26: the list is
 * deliberately unpaginated), so search and sorting assert *rendered* rows,
 * while the mutations assert the requests they produce — and the refusals
 * assert the SERVER'S sentence reaching the right surface: a 422 on the
 * `code` field, a 409 (duplicate or in-use) as the dialog's root alert or
 * the query layer's toast. The page never guesses usage; the tests pin that.
 */

configure({ asyncUtilTimeout: 3000 })

const READ: PermissionItem = {
  id: '20000000-0000-7000-8000-000000000001',
  code: 'users.read',
  description: 'View users.',
}
const DEACTIVATE: PermissionItem = {
  id: '20000000-0000-7000-8000-000000000002',
  code: 'users.deactivate',
  description: null,
}
const GENERATE: PermissionItem = {
  id: '20000000-0000-7000-8000-000000000003',
  code: 'reports.generate',
  description: 'Generate reports.',
}

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    created_at: '2026-01-02T03:04:05Z',
    id: '00000000-0000-7000-8000-000000000009',
    email: 'root@example.com',
    full_name: 'Root Operator',
    phone: null,
    is_superuser: true,
    must_change_password: false,
    roles: ['super_admin'],
    permissions: ['permissions.read', 'permissions.manage'],
    ...overrides,
  }
}

interface Captured {
  creates: Record<string, unknown> | null
  patch: { url: string; body: Record<string, unknown> } | null
  deletes: string[]
}

function renderDictionary(meUser: MeResponse = me()) {
  const captured: Captured = { creates: null, patch: null, deletes: [] }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    // The shell also reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    // The shell's bell polls this on every authenticated page (F046).
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/admin/permissions', () =>
      HttpResponse.json({ items: [GENERATE, DEACTIVATE, READ] }),
    ),
    http.post('/api/v1/admin/permissions', async ({ request }) => {
      captured.creates = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        { id: '20000000-0000-7000-8000-00000000000f', code: 'reports.export', description: null },
        { status: 201 },
      )
    }),
    http.patch('/api/v1/admin/permissions/:id', async ({ request, params }) => {
      captured.patch = {
        url: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      }
      return HttpResponse.json(READ)
    }),
    http.delete('/api/v1/admin/permissions/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/permissions'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

async function waitForTable() {
  await screen.findByRole('heading', { name: 'Permissions' })
  await screen.findByText('users.read')
}

afterEach(() => {
  toast.dismiss()
})

describe('the table', () => {
  it('renders the dictionary with searchable, sortable rows', async () => {
    renderDictionary()
    await waitForTable()

    expect(screen.getByText('users.deactivate')).toBeInTheDocument()
    expect(screen.getByText('Generate reports.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument() // the null description

    // Sorted by code ascending on a header click (client mode).
    await userEvent.click(screen.getByRole('button', { name: /Code/ }))
    const codes = screen.getAllByText(/^(reports|users)\./).map((cell) => cell.textContent)
    expect(codes).toEqual(['reports.generate', 'users.deactivate', 'users.read'])

    // The toolbar search filters the rendered rows.
    await userEvent.type(screen.getByPlaceholderText(/Search codes or descriptions/), 'deactivate')
    await waitFor(() => {
      expect(screen.queryByText('users.read')).toBeNull()
    })
    expect(screen.getByText('users.deactivate')).toBeInTheDocument()
  })

  it('renders no management controls without permissions.manage', async () => {
    renderDictionary(
      me({ permissions: ['permissions.read'], is_superuser: false, roles: ['viewer'] }),
    )
    await waitForTable()

    expect(screen.queryByRole('button', { name: 'Add permission' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })
})

describe('creating', () => {
  it('posts the dialog and closes on success', async () => {
    const { captured } = renderDictionary()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add permission' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'reports.export')
    await userEvent.type(within(dialog).getByLabelText(/^Description/), 'Export reports.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add permission' }))

    await waitFor(() => {
      expect(captured.creates).toEqual({ code: 'reports.export', description: 'Export reports.' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('refuses a malformed code locally, without a request', async () => {
    const { captured } = renderDictionary()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add permission' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'Users.Read')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add permission' }))

    expect(await within(dialog).findByText(/Lowercase `resource\.action`/)).toBeInTheDocument()
    expect(captured.creates).toBeNull()
  })

  it('shows the server duplicate conflict in the dialog', async () => {
    renderDictionary()
    await waitForTable()
    server.use(
      http.post('/api/v1/admin/permissions', () =>
        HttpResponse.json(
          { detail: 'A permission with this code already exists.' },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add permission' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'users.read')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add permission' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A permission with this code already exists.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('editing and deleting', () => {
  it('patches the description of an in-use code', async () => {
    const { captured } = renderDictionary()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for users.read' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const description = within(dialog).getByLabelText(/^Description/)
    await userEvent.clear(description)
    await userEvent.type(description, 'Read the directory.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.patch).toEqual({
        url: READ.id,
        body: { code: 'users.read', description: 'Read the directory.' },
      })
    })
  })

  it('renders the in-use rename refusal inside the dialog', async () => {
    renderDictionary()
    await waitForTable()
    server.use(
      http.patch('/api/v1/admin/permissions/:id', () =>
        HttpResponse.json(
          {
            detail:
              'This permission is granted to roles and cannot be renamed or deleted while it is. Remove it from them first.',
          },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actions for users.read' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const code = within(dialog).getByLabelText(/^Code/)
    await userEvent.clear(code)
    await userEvent.type(code, 'users.view')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot be renamed or deleted',
    )
  })

  it('deletes behind the confirmation with the server as the judge', async () => {
    const { captured } = renderDictionary()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for reports.generate' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(captured.deletes).toEqual([GENERATE.id])
    })
  })

  it('surfaces an in-use delete refusal as the server sentence', async () => {
    renderDictionary()
    await waitForTable()
    server.use(
      http.delete('/api/v1/admin/permissions/:id', () =>
        HttpResponse.json(
          {
            detail:
              'This permission is granted to roles and cannot be renamed or deleted while it is. Remove it from them first.',
          },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actions for users.read' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    // The confirm closes; the refusal arrives as the query layer's toast —
    // the page never guessed usage, it showed what the server said.
    expect(await screen.findByText(/cannot be renamed or deleted/)).toBeInTheDocument()
  })
})
