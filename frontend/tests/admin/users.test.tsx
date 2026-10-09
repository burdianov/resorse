import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { AdminUserItem, MeResponse, RoleItem } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/admin/users` — the directory UI against the real API contract (F034).
 *
 * The acceptance is "UI/API integration tests", so nothing here stubs a
 * component: the page renders through the **real** route table and provider
 * stack (the F032 harness), every interaction crosses `lib/api.ts` — CSRF
 * header and all — into MSW, and the assertions are on the requests the screen
 * actually sends and the responses it actually renders. The only stand-in is
 * the network itself.
 *
 * What the file pins, in the order of what would break silently:
 *
 * - **The server-mode wiring**: page/sort/search/status are request
 *   parameters, not client-side slicing — each control's test asserts the
 *   query string it produced.
 * - **The one-time password contract** (F033/C22): the temporary is shown
 *   once with the warning, and nothing re-fetches it.
 * - **Server-authoritative errors**: the 409 lands in the dialog as the
 *   server's sentence.
 * - **The permission mirrors**: controls the caller cannot use are absent, and
 *   the self-row's deactivate/delete are disabled — the UI never invites a
 *   refusal it knows is coming (the server remains the boundary).
 */

configure({ asyncUtilTimeout: 3000 })

const ME_ID = '00000000-0000-7000-8000-000000000001'
const ADA_ID = '00000000-0000-7000-8000-000000000002'
const GRACE_ID = '00000000-0000-7000-8000-000000000003'
const VIEWER_ROLE: RoleItem = {
  id: '10000000-0000-7000-8000-000000000001',
  name: 'viewer',
  description: 'Read-only access.',
  is_system: false,
  permission_codes: ['reports.generate'],
}
const ADMIN_ROLE: RoleItem = {
  id: '10000000-0000-7000-8000-000000000002',
  name: 'admin',
  description: null,
  is_system: false,
  permission_codes: [],
}

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: ME_ID,
    email: 'root@example.com',
    full_name: 'Root Operator',
    phone: null,
    is_superuser: false,
    must_change_password: false,
    roles: ['admin'],
    permissions: [
      'users.read',
      'users.create',
      'users.update',
      'users.deactivate',
      'users.reset_password',
    ],
    ...overrides,
  }
}

function userItem(overrides: Partial<AdminUserItem> = {}): AdminUserItem {
  return {
    id: ADA_ID,
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: null,
    is_active: true,
    is_deleted: false,
    is_superuser: false,
    must_change_password: false,
    last_login_at: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
    roles: [VIEWER_ROLE],
    ...overrides,
  }
}

interface CapturedRequests {
  listParams: URLSearchParams[]
  create?: Record<string, unknown>
  patch?: { url: string; body: Record<string, unknown> }
  deletes: string[]
  resets: string[]
}

interface DirectoryFixture {
  requests: CapturedRequests
}

function directoryHandlers(
  rows: AdminUserItem[],
  total = rows.length,
  meUser: MeResponse = me(),
): { handlers: ReturnType<typeof http.get>[]; requests: CapturedRequests } {
  const requests: CapturedRequests = { listParams: [], deletes: [], resets: [] }
  const handlers = [
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    http.get('/api/v1/admin/roles', () => HttpResponse.json({ items: [ADMIN_ROLE, VIEWER_ROLE] })),
    http.get('/api/v1/admin/users', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.listParams.push(params)
      return HttpResponse.json({
        items: rows,
        total,
        page: Number(params.get('page') ?? '1'),
        page_size: Number(params.get('page_size') ?? '25'),
      })
    }),
    http.post('/api/v1/admin/users', async ({ request }) => {
      requests.create = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        {
          user: userItem({ email: 'new@example.com', full_name: 'New Person' }),
          temporary_password: 'generated-pass-123',
        },
        { status: 201 },
      )
    }),
    http.patch('/api/v1/admin/users/:id', async ({ request, params }) => {
      requests.patch = {
        url: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      }
      return HttpResponse.json(userItem())
    }),
    http.post('/api/v1/admin/users/:id/reset-password', ({ params }) => {
      requests.resets.push(String(params.id))
      return HttpResponse.json({ temporary_password: 'reset-pass-456' })
    }),
    http.delete('/api/v1/admin/users/:id', ({ params }) => {
      requests.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  ] as ReturnType<typeof http.get>[]
  return { handlers, requests }
}

function renderDirectory(init: { rows?: AdminUserItem[]; total?: number; meUser?: MeResponse } = {}) {
  const { handlers, requests } = directoryHandlers(
    init.rows ?? [userItem(), userItem({ id: GRACE_ID, email: 'grace@example.com', full_name: 'Grace Hopper', is_active: false })],
    init.total,
    init.meUser ?? me(),
  )
  server.use(...handlers)
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/users'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, requests }
}

async function waitForRows() {
  await screen.findByRole('heading', { name: 'Users' })
  await screen.findByText('Ada Lovelace')
}

function lastParams(requests: CapturedRequests): URLSearchParams {
  const params = requests.listParams.at(-1)
  if (!params) throw new Error('no list request captured')
  return params
}

afterEach(() => {
  toast.dismiss()
})

describe('the directory table', () => {
  it('renders the API rows with roles, status and the server default query', async () => {
    const { requests } = renderDirectory()

    await waitForRows()

    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getAllByText('viewer').length).toBeGreaterThan(0) // role badges
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    // The first request is the page's default: newest first, page one.
    const params = lastParams(requests)
    expect(params.get('sort')).toBe('created_at')
    expect(params.get('order')).toBe('desc')
    expect(params.get('page')).toBe('1')
    expect(params.get('page_size')).toBe('25')
    expect(params.get('search')).toBeNull()
    expect(params.get('is_active')).toBeNull()
  })

  it('sends the search term (debounced) and filters by status', async () => {
    const { requests } = renderDirectory()

    await waitForRows()
    await userEvent.type(screen.getByPlaceholderText(/Search name or email/), 'ada')

    await waitFor(() => {
      expect(lastParams(requests).get('search')).toBe('ada')
    })

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Inactive' }))

    await waitFor(() => {
      expect(lastParams(requests).get('is_active')).toBe('false')
    })
  })

  it('sorts through the server when a header is clicked', async () => {
    const { requests } = renderDirectory()

    await waitForRows()
    await userEvent.click(screen.getByRole('button', { name: /Full name/ }))

    await waitFor(() => {
      const params = lastParams(requests)
      expect(params.get('sort')).toBe('full_name')
      expect(params.get('order')).toBe('asc')
    })
  })

  it('paginates through the server and counts from its total', async () => {
    const { requests } = renderDirectory({ rows: [userItem()], total: 30 })

    await waitForRows()
    expect(screen.getByText(/of 30/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => {
      expect(lastParams(requests).get('page')).toBe('2')
    })
  })

  it('shows the empty state when the directory has no users', async () => {
    renderDirectory({ rows: [], total: 0 })

    await screen.findByRole('heading', { name: 'Users' })

    expect(await screen.findByText('No users yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument()
  })
})

describe('creating a user', () => {
  it('posts the dialog and shows the generated password exactly once', async () => {
    const { requests } = renderDirectory()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: 'Add user' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'new@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Full name/), 'New Person')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'viewer' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await waitFor(() => {
      expect(requests.create).toEqual({
        email: 'new@example.com',
        full_name: 'New Person',
        phone: null,
        password: null, // empty means "generate one"
        role_ids: [VIEWER_ROLE.id],
      })
    })

    // The one-time notice (F033/C22): the value, the warning, and a way out.
    expect(await screen.findByText('This password is shown once.')).toBeInTheDocument()
    expect(screen.getByText('generated-pass-123')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(screen.queryByText('generated-pass-123')).toBeNull()
  })

  it('shows the server conflict in the dialog and stays open', async () => {
    renderDirectory()
    await waitForRows()

    // Override the create handler: the email is taken (the real 409).
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          { detail: 'A user with this email address already exists.' },
          { status: 409 },
        ),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'ada@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Full name/), 'Ada Again')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('A user with this email address already exists.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('editing a user', () => {
  it('patches the complete editable set from the edit dialog', async () => {
    const { requests } = renderDirectory()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText(/^Full name/)
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Ada Renamed')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(requests.patch).toEqual({
        url: ADA_ID,
        body: {
          email: 'ada@example.com',
          full_name: 'Ada Renamed',
          phone: null,
          is_active: true,
          role_ids: [VIEWER_ROLE.id],
        },
      })
    })
  })

  it('disables the roles and active controls when editing yourself', async () => {
    // The signed-in account is the first row (F033's self rule, C22).
    const self = userItem({ id: ME_ID, email: 'root@example.com', full_name: 'Root Operator' })
    renderDirectory({ rows: [self], meUser: me() })
    await screen.findByRole('heading', { name: 'Users' })
    await screen.findByText('Root Operator')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Root Operator' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')

    expect(screen.getByText(/cannot change your own roles or account status/)).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'admin' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(dialog).getByRole('checkbox', { name: 'Account is active' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('the row actions', () => {
  it('resets a password behind its confirmation and shows the temporary once', async () => {
    const { requests } = renderDirectory()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset password' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/signed out everywhere/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => {
      expect(requests.resets).toEqual([ADA_ID])
    })
    expect(await screen.findByText('reset-pass-456')).toBeInTheDocument()
    expect(screen.getByText('This password is shown once.')).toBeInTheDocument()
  })

  it('deactivates only after the confirmation', async () => {
    const { requests } = renderDirectory()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))

    const dialog = await screen.findByRole('dialog')
    expect(requests.patch).toBeUndefined() // nothing before the confirm
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      expect(requests.patch).toEqual({ url: ADA_ID, body: { is_active: false } })
    })
  })

  it('deletes behind the destructive confirmation', async () => {
    const { requests } = renderDirectory()
    await waitForRows()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Grace Hopper' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(requests.deletes).toEqual([GRACE_ID])
    })
  })

  it('disables deactivate and delete on your own row', async () => {
    const self = userItem({ id: ME_ID, email: 'root@example.com', full_name: 'Root Operator' })
    renderDirectory({ rows: [self], meUser: me() })
    await screen.findByText('Root Operator')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Root Operator' }))
    expect(await screen.findByRole('menuitem', { name: 'Deactivate' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('the permission mirrors', () => {
  it('renders no controls the caller cannot use', async () => {
    renderDirectory({
      meUser: me({ permissions: ['users.read'], roles: ['viewer'] }),
    })

    await waitForRows()

    expect(screen.queryByRole('button', { name: 'Add user' })).toBeNull()
    // Reading only: no row menu at all, because every item needs a code.
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })
})
