import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse, PermissionItem, RoleItem } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/admin/roles` — the permission matrix against the real contract (F036).
 *
 * The acceptance is "save/reload/error tests", and the file is shaped around
 * those three words: a tick is **draft state only** (no request — that is the
 * C24 discipline made visible), **Save** sends the whole matrix in one `PUT`
 * (the unchanged system column included, per F035/C24) and a success re-reads
 * the catalogue, and every failure — the 422 with its per-entry path, the rule
 * 403 — renders the server's sentence in the save bar **with the draft intact**.
 *
 * Everything runs through the real route table, providers and `api.ts`, with
 * MSW as the only stand-in (the F032/F034 harness).
 */

configure({ asyncUtilTimeout: 3000 })

const VIEWER: RoleItem = {
  id: '10000000-0000-7000-8000-000000000001',
  name: 'viewer',
  description: 'Read-only access.',
  is_system: false,
  permission_codes: ['reports.generate', 'users.read'],
}
const ADMIN: RoleItem = {
  id: '10000000-0000-7000-8000-000000000002',
  name: 'admin',
  description: null,
  is_system: false,
  permission_codes: ['users.read'],
}
const SUPER: RoleItem = {
  id: '10000000-0000-7000-8000-000000000003',
  name: 'super_admin',
  description: null,
  is_system: true,
  permission_codes: ['reports.generate', 'users.read'],
}

const PERMISSIONS: PermissionItem[] = [
  { id: '20000000-0000-7000-8000-000000000001', code: 'reports.generate', description: 'Generate reports.' },
  { id: '20000000-0000-7000-8000-000000000002', code: 'roles.read', description: 'View roles.' },
  { id: '20000000-0000-7000-8000-000000000003', code: 'users.read', description: 'View users.' },
]

function me(): MeResponse {
  return {
    id: '00000000-0000-7000-8000-000000000009',
    email: 'root@example.com',
    full_name: 'Root Operator',
    phone: null,
    is_superuser: true,
    must_change_password: false,
    roles: ['super_admin'],
    permissions: ['roles.read', 'roles.manage', 'permissions.read', 'users.read'],
  }
}

interface Captured {
  matrixBody: Record<string, unknown> | null
  puts: number
  rolesCalls: number
  creates: Record<string, unknown> | null
  patch: { url: string; body: Record<string, unknown> } | null
  deletes: string[]
}

interface MatrixFixture {
  matrixResponse?: () => Response
}

function handlers(captured: Captured, fixture: MatrixFixture = {}) {
  return [
    http.get('/api/v1/auth/me', () => HttpResponse.json(me())),
    http.get('/api/v1/admin/roles', () => {
      captured.rolesCalls += 1
      return HttpResponse.json({ items: [VIEWER, ADMIN, SUPER] })
    }),
    http.get('/api/v1/admin/permissions', () => HttpResponse.json({ items: PERMISSIONS })),
    http.put('/api/v1/admin/roles/matrix', async ({ request }) => {
      captured.puts += 1
      captured.matrixBody = (await request.json()) as Record<string, unknown>
      return fixture.matrixResponse?.() ?? new HttpResponse(null, { status: 204 })
    }),
    http.post('/api/v1/admin/roles', async ({ request }) => {
      captured.creates = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...VIEWER, name: 'new-role', permission_codes: [] }, { status: 201 })
    }),
    http.patch('/api/v1/admin/roles/:id', async ({ request, params }) => {
      captured.patch = { url: String(params.id), body: (await request.json()) as Record<string, unknown> }
      return HttpResponse.json(VIEWER)
    }),
    http.delete('/api/v1/admin/roles/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  ] as ReturnType<typeof http.get>[]
}

function renderMatrix(fixture: MatrixFixture = {}) {
  const captured: Captured = {
    matrixBody: null,
    puts: 0,
    rolesCalls: 0,
    creates: null,
    patch: null,
    deletes: [],
  }
  server.use(...handlers(captured, fixture))
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/admin/roles'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

async function waitForMatrix() {
  await screen.findByRole('heading', { name: 'Roles' })
  await screen.findByRole('checkbox', { name: 'viewer: users.read' })
}

function box(role: string, code: string) {
  return screen.getByRole('checkbox', { name: `${role}: ${code}` })
}

afterEach(() => {
  toast.dismiss()
})

describe('the matrix', () => {
  it('renders every permission grouped by namespace against every role', async () => {
    renderMatrix()
    await waitForMatrix()

    // Namespace group rows.
    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText('reports')).toBeInTheDocument()
    expect(screen.getByText('roles')).toBeInTheDocument()
    // Codes with descriptions.
    expect(screen.getByText('users.read')).toBeInTheDocument()
    expect(screen.getByText('Generate reports.')).toBeInTheDocument()
    // The grid reflects the catalogue: viewer holds both, admin only users.read.
    expect(box('viewer', 'users.read')).toBeChecked()
    expect(box('viewer', 'reports.generate')).toBeChecked()
    expect(box('admin', 'users.read')).toBeChecked()
    expect(box('admin', 'reports.generate')).not.toBeChecked()
    expect(box('admin', 'roles.read')).not.toBeChecked()
  })

  it('renders the seed-owned column read-only', async () => {
    renderMatrix()
    await waitForMatrix()

    expect(box('super_admin', 'users.read')).toHaveAttribute('aria-disabled', 'true')
    expect(box('super_admin', 'reports.generate')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByLabelText('Managed by the seed')).toBeInTheDocument()
  })
})

describe('the draft and the save', () => {
  it('keeps a tick as unsaved state until Save — no request per cell', async () => {
    const { captured } = renderMatrix()
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))

    expect(await screen.findByText('1 unsaved change in 1 role')).toBeInTheDocument()
    expect(captured.puts).toBe(0)
    expect(captured.matrixBody).toBeNull()
    // The tick is real and in place.
    expect(box('admin', 'reports.generate')).toBeChecked()
  })

  it('saves the whole matrix in one call, system column included unchanged', async () => {
    const { captured } = renderMatrix()
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.puts).toBe(1)
    })
    const body = captured.matrixBody as { roles: { role_id: string; permission_codes: string[] }[] }
    expect(body.roles.map((entry) => entry.role_id)).toEqual([VIEWER.id, ADMIN.id, SUPER.id])
    const byId = Object.fromEntries(body.roles.map((entry) => [entry.role_id, entry.permission_codes]))
    expect(byId[ADMIN.id]?.sort()).toEqual(['reports.generate', 'users.read'])
    // The protected column rides along, unchanged — F035/C24 accepts exactly this.
    expect([...byId[SUPER.id]!].sort()).toEqual(['reports.generate', 'users.read'])

    // Success: the bar is gone, the catalogue is re-read.
    await waitFor(() => {
      expect(screen.queryByText(/unsaved change/)).toBeNull()
    })
    await waitFor(() => {
      expect(captured.rolesCalls).toBeGreaterThanOrEqual(2)
    })
    expect(await screen.findByText('Permissions saved')).toBeInTheDocument()
  })

  it('reset restores the server state and clears the bar', async () => {
    renderMatrix()
    await waitForMatrix()

    await userEvent.click(box('admin', 'roles.read'))
    expect(await screen.findByText('1 unsaved change in 1 role')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

    await waitFor(() => {
      expect(screen.queryByText(/unsaved change/)).toBeNull()
    })
    expect(box('admin', 'roles.read')).not.toBeChecked()
  })

  it('unticking back to the server state clears the unsaved warning', async () => {
    renderMatrix()
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))
    expect(await screen.findByText(/unsaved change/)).toBeInTheDocument()
    await userEvent.click(box('admin', 'reports.generate'))

    await waitFor(() => {
      expect(screen.queryByText(/unsaved change/)).toBeNull()
    })
  })
})

describe('the server is the authority', () => {
  it('shows the per-entry 422 in the save bar and keeps the draft', async () => {
    renderMatrix({
      matrixResponse: () =>
        HttpResponse.json(
          {
            detail: [
              {
                type: 'value_error',
                loc: ['body', 'roles.0.permission_codes'],
                msg: 'Unknown permission codes: does.not.exist.',
              },
            ],
          },
          { status: 422 },
        ),
    })
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    const bar = await screen.findByText('Unknown permission codes: does.not.exist.')
    expect(bar).toHaveAttribute('role', 'alert')
    // The failed save did not cost the edit: the tick and the bar survive.
    expect(box('admin', 'reports.generate')).toBeChecked()
    expect(screen.getByText(/unsaved change/)).toBeInTheDocument()
  })

  it('shows a rule 403 the same way', async () => {
    renderMatrix({
      matrixResponse: () =>
        HttpResponse.json(
          { detail: 'You cannot manage grants that include permissions you do not hold.' },
          { status: 403 },
        ),
    })
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('You cannot manage grants that include permissions you do not hold.'),
    ).toBeInTheDocument()
    expect(box('admin', 'reports.generate')).toBeChecked()
  })

  it('asks before losing the draft on navigation', async () => {
    renderMatrix()
    await waitForMatrix()

    await userEvent.click(box('admin', 'reports.generate'))
    await screen.findByText(/unsaved change/)

    // The sidebar link — in-app navigation, intercepted by F019's guard.
    await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }))

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument()
  })
})

describe('role management', () => {
  it('creates a role from the dialog', async () => {
    const { captured } = renderMatrix()
    await waitForMatrix()

    await userEvent.click(screen.getByRole('button', { name: 'Add role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), '  auditor  ')
    await userEvent.type(within(dialog).getByLabelText(/^Description/), 'Reads the trail.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }))

    await waitFor(() => {
      expect(captured.creates).toEqual({ name: 'auditor', description: 'Reads the trail.' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('shows a duplicate-name conflict inside the dialog', async () => {
    renderMatrix()
    await waitForMatrix()
    server.use(
      http.post('/api/v1/admin/roles', () =>
        HttpResponse.json({ detail: 'A role with this name already exists.' }, { status: 409 }),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'viewer')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A role with this name already exists.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renames from the column menu and protects the seed-owned role', async () => {
    const { captured } = renderMatrix()
    await waitForMatrix()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for role viewer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'read-only')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.patch?.url).toBe(VIEWER.id)
    })
    expect(captured.patch?.body['name']).toBe('read-only')

    // The seed-owned column's menu offers nothing to press.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for role super_admin' }))
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('deletes behind the confirmation', async () => {
    const { captured } = renderMatrix()
    await waitForMatrix()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for role admin' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(captured.deletes).toEqual([ADMIN.id])
    })
  })
})
