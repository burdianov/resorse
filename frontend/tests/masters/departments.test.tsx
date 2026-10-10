import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { DepartmentItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/masters/departments` — the second reference table (D006).
 *
 * The same acceptance as its sibling — functional create/edit — plus the thing
 * that makes this table different: a **closed classification**. The select is
 * built from the same two tokens the server validates against, the column shows
 * the friendly label (and searches on it, not on `HEAD_OFFICE`), and the edit
 * form sends `classification` while leaving the immutable `code` out.
 */

configure({ asyncUtilTimeout: 3000 })

const HQ: DepartmentItem = {
  id: '40000000-0000-7000-8000-000000000001',
  code: 'head_office',
  name: 'Headquarters',
  classification: 'HEAD_OFFICE',
  is_active: true,
}
const YARD: DepartmentItem = {
  id: '40000000-0000-7000-8000-000000000002',
  code: 'yard',
  name: 'Site Yard',
  classification: 'SITE',
  is_active: true,
}

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    created_at: '2026-01-02T03:04:05Z',
    id: '00000000-0000-7000-8000-000000000009',
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: null,
    is_superuser: false,
    must_change_password: false,
    roles: ['reference_admin'],
    permissions: ['departments.read', 'departments.manage'],
    ...overrides,
  }
}

interface Captured {
  creates: Record<string, unknown> | null
  patches: { url: string; body: Record<string, unknown> }[]
  deletes: string[]
}

function renderDepartments(meUser: MeResponse = me()) {
  const captured: Captured = { creates: null, patches: [], deletes: [] }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/masters/departments', () => HttpResponse.json({ items: [HQ, YARD] })),
    http.post('/api/v1/masters/departments', async ({ request }) => {
      captured.creates = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        {
          id: '40000000-0000-7000-8000-00000000000f',
          code: 'logistics',
          name: 'Logistics',
          classification: 'SITE',
          is_active: true,
        },
        { status: 201 },
      )
    }),
    http.patch('/api/v1/masters/departments/:id', async ({ request, params }) => {
      captured.patches.push({
        url: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(HQ)
    }),
    http.delete('/api/v1/masters/departments/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), {
    initialEntries: ['/masters/departments'],
  })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

async function waitForTable() {
  await screen.findByRole('heading', { name: 'Departments' })
  await screen.findByText('head_office')
}

afterEach(() => {
  toast.dismiss()
})

describe('the table', () => {
  it('renders the rows with the classification labels, and searches on them', async () => {
    renderDepartments()
    await waitForTable()

    expect(screen.getByText('Head Office')).toBeInTheDocument()
    expect(screen.getByText('Site')).toBeInTheDocument()

    // "Head Office" with the space matches only the *label* — neither the code
    // (`head_office`) nor the name contains it — so the column is searching the
    // text the reader sees.
    await userEvent.type(screen.getByPlaceholderText(/Search codes or names/), 'head office')
    await waitFor(() => {
      expect(screen.queryByText('Site Yard')).toBeNull()
    })
    expect(screen.getByText('Headquarters')).toBeInTheDocument()
  })

  it('renders no management controls without departments.manage', async () => {
    renderDepartments(me({ permissions: ['departments.read'] }))
    await waitForTable()

    expect(screen.queryByRole('button', { name: 'Add department' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })
})

describe('creating', () => {
  it('posts the code, the name and the chosen classification', async () => {
    const { captured } = renderDepartments()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add department' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'logistics')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Logistics')
    await userEvent.click(within(dialog).getByLabelText(/Classification/))
    await userEvent.click(await screen.findByRole('option', { name: 'Site' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))

    await waitFor(() => {
      expect(captured.creates).toEqual({
        code: 'logistics',
        name: 'Logistics',
        classification: 'SITE',
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('refuses a blank name locally, without a request', async () => {
    const { captured } = renderDepartments()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add department' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'logistics')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))

    expect(await within(dialog).findByText('Enter a name.')).toBeInTheDocument()
    expect(captured.creates).toBeNull()
  })
})

describe('editing, deactivating and deleting', () => {
  it('patches the name and the classification, never the code', async () => {
    const { captured } = renderDepartments()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for head_office' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/^Code/)).toBeDisabled()
    const name = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Head Office')
    await userEvent.click(within(dialog).getByLabelText(/Classification/))
    await userEvent.click(await screen.findByRole('option', { name: 'Site' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.patches).toEqual([
        { url: HQ.id, body: { name: 'Head Office', classification: 'SITE' } },
      ])
    })
  })

  it('deactivates and reactivates from the row menu', async () => {
    const { captured } = renderDepartments()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for yard' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))
    await waitFor(() => {
      expect(captured.patches).toContainEqual({ url: YARD.id, body: { is_active: false } })
    })

    await userEvent.click(screen.getByRole('button', { name: 'Actions for head_office' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))
    await waitFor(() => {
      expect(captured.patches).toContainEqual({ url: HQ.id, body: { is_active: false } })
    })
  })

  it('deletes behind the confirmation, and shows a refusal as the server sentence', async () => {
    const { captured } = renderDepartments()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for yard' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(captured.deletes).toEqual([YARD.id])
    })

    server.use(
      http.delete('/api/v1/masters/departments/:id', () =>
        HttpResponse.json(
          {
            detail:
              'This department is still used by a designation and cannot be deleted. Deactivate it instead.',
          },
          { status: 409 },
        ),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for head_office' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const refusal = await screen.findByRole('dialog')
    await userEvent.click(within(refusal).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/still used by a designation/)).toBeInTheDocument()
  })
})
