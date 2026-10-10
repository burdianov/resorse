import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type {
  DepartmentItem,
  DesignationItem,
  DisciplineItem,
  MeResponse,
} from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/masters/designations` — the reference table that points at the other two
 * (D006).
 *
 * What is specific to this screen, and therefore what these tests are about:
 *
 * - **The join.** The server sends ids; the table renders names, so the page
 *   reads all three lists — which is why the route demands three read codes,
 *   and why a caller holding only the two reference reads is refused.
 * - **The pickers.** Options are the *active* references **plus the one the row
 *   being edited already holds**, so retiring a department cannot silently
 *   blank a designation that still points at it.
 */

configure({ asyncUtilTimeout: 3000 })

const HEAD_OFFICE: DepartmentItem = {
  id: '40000000-0000-7000-8000-000000000001',
  code: 'head_office',
  name: 'Headquarters',
  classification: 'HEAD_OFFICE',
  is_active: true,
}
const RETIRED: DepartmentItem = {
  id: '40000000-0000-7000-8000-000000000002',
  code: 'old_yard',
  name: 'Old Yard',
  classification: 'SITE',
  is_active: false,
}
const CIVIL: DisciplineItem = {
  id: '30000000-0000-7000-8000-000000000001',
  code: 'civil',
  name: 'Civil',
  is_active: true,
}
const SURVEY: DisciplineItem = {
  id: '30000000-0000-7000-8000-000000000002',
  code: 'survey',
  name: 'Survey',
  is_active: true,
}

const SITE_CIVIL: DesignationItem = {
  id: '50000000-0000-7000-8000-000000000001',
  code: 'civil_engineer',
  name: 'Civil Engineer',
  department_id: HEAD_OFFICE.id,
  discipline_id: CIVIL.id,
  is_active: true,
}
const LEGACY: DesignationItem = {
  id: '50000000-0000-7000-8000-000000000002',
  code: 'legacy_title',
  name: 'Legacy Title',
  // Points at a department that has since been retired — the case the picker
  // rule exists for.
  department_id: RETIRED.id,
  discipline_id: CIVIL.id,
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
    permissions: [
      'designations.read',
      'designations.manage',
      'departments.read',
      'disciplines.read',
    ],
    ...overrides,
  }
}

interface Captured {
  creates: Record<string, unknown> | null
  patches: { url: string; body: Record<string, unknown> }[]
  deletes: string[]
}

function renderDesignations(meUser: MeResponse = me()) {
  const captured: Captured = { creates: null, patches: [], deletes: [] }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/masters/departments', () =>
      HttpResponse.json({ items: [HEAD_OFFICE, RETIRED] }),
    ),
    http.get('/api/v1/masters/disciplines', () => HttpResponse.json({ items: [CIVIL, SURVEY] })),
    http.get('/api/v1/masters/designations', () =>
      HttpResponse.json({ items: [SITE_CIVIL, LEGACY] }),
    ),
    http.post('/api/v1/masters/designations', async ({ request }) => {
      captured.creates = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        {
          id: '50000000-0000-7000-8000-00000000000f',
          code: 'surveyor',
          name: 'Surveyor',
          department_id: HEAD_OFFICE.id,
          discipline_id: SURVEY.id,
          is_active: true,
        },
        { status: 201 },
      )
    }),
    http.patch('/api/v1/masters/designations/:id', async ({ request, params }) => {
      captured.patches.push({
        url: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(SITE_CIVIL)
    }),
    http.delete('/api/v1/masters/designations/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), {
    initialEntries: ['/masters/designations'],
  })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, captured }
}

async function waitForTable() {
  await screen.findByRole('heading', { name: 'Designations' })
  await screen.findByText('civil_engineer')
}

/** Opens a field's listbox by its label and picks an option by its text. */
async function pick(dialog: HTMLElement, label: RegExp, option: string) {
  await userEvent.click(within(dialog).getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

afterEach(() => {
  toast.dismiss()
})

describe('the table', () => {
  it('renders the rows with both reference names resolved', async () => {
    renderDesignations()
    await waitForTable()

    // The department and the discipline of the first row, joined client-side.
    expect(screen.getByText('Headquarters')).toBeInTheDocument()
    expect(screen.getByText('Civil Engineer')).toBeInTheDocument()
    // The retired department still names itself in the row — only the picker
    // hides it.
    expect(screen.getByText('Old Yard')).toBeInTheDocument()
    expect(screen.getAllByText('Civil')).toHaveLength(2)
  })

  it('searches on the joined reference names', async () => {
    renderDesignations()
    await waitForTable()

    await userEvent.type(
      screen.getByPlaceholderText(/Search codes, names or departments/),
      'Legacy',
    )
    await waitFor(() => {
      expect(screen.queryByText('civil_engineer')).toBeNull()
    })
    expect(screen.getByText('Legacy Title')).toBeInTheDocument()
  })
})

describe('the reference pickers', () => {
  it('offers only active references when creating', async () => {
    renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add designation' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText(/^Department/))

    const options = screen.getByRole('listbox')
    expect(
      within(options).getByRole('option', { name: 'Headquarters (head_office)' }),
    ).toBeInTheDocument()
    // The retired department is not on offer for a new row.
    expect(within(options).queryByRole('option', { name: 'Old Yard (old_yard)' })).toBeNull()
  })

  it('keeps the reference a row already holds, even when it is retired', async () => {
    renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for legacy_title' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')

    // The preset selection shows its *label*, not the id (base-ui resolves it
    // from the items, which is why `SelectField` passes them).
    expect(within(dialog).getByRole('combobox', { name: /^Department/ })).toHaveTextContent(
      'Old Yard (old_yard)',
    )
    expect(within(dialog).getByRole('combobox', { name: /^Discipline/ })).toHaveTextContent(
      'Civil (civil)',
    )

    // …and it is still selectable, so an edit that does not touch the reference
    // is not forced to move the row off a retired department.
    await userEvent.click(within(dialog).getByLabelText(/^Department/))
    expect(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Old Yard (old_yard)' }),
    ).toBeInTheDocument()
  })
})

describe('creating', () => {
  it('posts the code, the name and both references', async () => {
    const { captured } = renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add designation' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'surveyor')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Surveyor')
    await pick(dialog, /^Department/, 'Headquarters (head_office)')
    await pick(dialog, /^Discipline/, 'Survey (survey)')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add designation' }))

    await waitFor(() => {
      expect(captured.creates).toEqual({
        code: 'surveyor',
        name: 'Surveyor',
        department_id: HEAD_OFFICE.id,
        discipline_id: SURVEY.id,
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('refuses to submit without a reference, locally and without a request', async () => {
    const { captured } = renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add designation' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'surveyor')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Surveyor')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add designation' }))

    expect(await within(dialog).findByText('Choose a department.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose a discipline.')).toBeInTheDocument()
    expect(captured.creates).toBeNull()
  })
})

describe('editing, deleting and access', () => {
  it('patches the name and the references, never the code', async () => {
    const { captured } = renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil_engineer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/^Code/)).toBeDisabled()
    const name = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Civil Engineer II')
    await pick(dialog, /^Discipline/, 'Survey (survey)')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.patches).toEqual([
        {
          url: SITE_CIVIL.id,
          body: {
            name: 'Civil Engineer II',
            department_id: HEAD_OFFICE.id,
            discipline_id: SURVEY.id,
          },
        },
      ])
    })
  })

  it('deletes behind the confirmation, and shows a refusal as the server sentence', async () => {
    const { captured } = renderDesignations()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil_engineer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(captured.deletes).toEqual([SITE_CIVIL.id])
    })

    server.use(
      http.delete('/api/v1/masters/designations/:id', () =>
        HttpResponse.json(
          {
            detail: 'This designation is still held and cannot be deleted. Deactivate it instead.',
          },
          { status: 409 },
        ),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for legacy_title' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const refusal = await screen.findByRole('dialog')
    await userEvent.click(within(refusal).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/still held and cannot be deleted/)).toBeInTheDocument()
  })

  it('renders no management controls without designations.manage', async () => {
    renderDesignations(
      me({
        permissions: ['designations.read', 'departments.read', 'disciplines.read'],
      }),
    )
    await waitForTable()

    expect(screen.queryByRole('button', { name: 'Add designation' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })

  it('answers 403 for a caller missing any one of its three read codes', async () => {
    // The two reference lists alone are not enough: the page cannot render
    // without the designations list, and the route says so.
    renderDesignations(me({ permissions: ['departments.read', 'disciplines.read'] }))

    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Designations' })).toBeNull()
  })
})
