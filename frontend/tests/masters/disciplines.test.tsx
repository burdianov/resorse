import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { DisciplineItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/masters/disciplines` — the first reference table's screen (D006).
 *
 * Acceptance: functional create/edit tests. The page is mounted through the
 * **real registry** (`buildAppRoutes()` reads `APP_MODULES`), so these tests are
 * also the end-to-end proof that D006 registered a working module: its route is
 * in the route table, its nav group is in the sidebar and its declared codes
 * are what the guard reads.
 *
 * The refusals assert the server's sentence reaching the right surface, and the
 * edit test asserts the absence that matters — the PATCH body carries `name`
 * and *no* `code`, because the server's update schema forbids the field.
 */

configure({ asyncUtilTimeout: 3000 })

const CIVIL: DisciplineItem = {
  id: '30000000-0000-7000-8000-000000000001',
  code: 'civil',
  name: 'Civil',
  is_active: true,
}
const ELECTRICAL: DisciplineItem = {
  id: '30000000-0000-7000-8000-000000000002',
  code: 'electrical',
  name: 'Electrical',
  is_active: false,
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
    permissions: ['disciplines.read', 'disciplines.manage'],
    ...overrides,
  }
}

interface Captured {
  creates: Record<string, unknown> | null
  patches: { url: string; body: Record<string, unknown> }[]
  deletes: string[]
}

function renderDisciplines(
  meUser: MeResponse = me(),
  init: { listFails?: number | 'network' } = {},
) {
  const captured: Captured = { creates: null, patches: [], deletes: [] }
  // A mutable box rather than a captured value: the error test turns the
  // failure off mid-test to watch Retry actually ask again.
  const failure = { current: init.listFails }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(meUser)),
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/masters/disciplines', () => {
      if (failure.current === 'network') return HttpResponse.error()
      if (typeof failure.current === 'number') {
        return HttpResponse.json(
          { detail: 'The list is unavailable.' },
          { status: failure.current },
        )
      }
      return HttpResponse.json({ items: [CIVIL, ELECTRICAL] })
    }),
    http.post('/api/v1/masters/disciplines', async ({ request }) => {
      captured.creates = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        {
          id: '30000000-0000-7000-8000-00000000000f',
          code: 'mechanical',
          name: 'Mechanical',
          is_active: true,
        },
        { status: 201 },
      )
    }),
    http.patch('/api/v1/masters/disciplines/:id', async ({ request, params }) => {
      captured.patches.push({
        url: String(params.id),
        body: (await request.json()) as Record<string, unknown>,
      })
      return HttpResponse.json(CIVIL)
    }),
    http.delete('/api/v1/masters/disciplines/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const router = createMemoryRouter(buildAppRoutes(), {
    initialEntries: ['/masters/disciplines'],
  })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return {
    router,
    captured,
    recover: () => {
      failure.current = undefined
    },
  }
}

async function waitForTable() {
  await screen.findByRole('heading', { name: 'Disciplines' })
  await screen.findByText('civil')
}

afterEach(() => {
  toast.dismiss()
})

describe('the table', () => {
  it('renders the rows, joins the nav group, and searches in the browser', async () => {
    renderDisciplines()
    await waitForTable()

    expect(screen.getByText('Electrical')).toBeInTheDocument()
    // The module's own nav group, rendered by the shell from the registry.
    expect(screen.queryAllByRole('link', { name: 'Disciplines' }).length).toBeGreaterThan(0)

    await userEvent.type(screen.getByPlaceholderText(/Search codes or names/), 'elect')
    await waitFor(() => {
      expect(screen.queryByText('civil')).toBeNull()
    })
    expect(screen.getByText('electrical')).toBeInTheDocument()
  })

  it('reads the status as the word, so "inactive" finds the retired row', async () => {
    renderDisciplines()
    await waitForTable()

    expect(screen.getByText('Inactive')).toBeInTheDocument()

    // The column's accessor is the word the badge says, not the boolean: a
    // search for "inactive" is a search over states, and it is answered without
    // asking the server (the table filters in the browser).
    await userEvent.type(screen.getByPlaceholderText(/Search codes or names/), 'inactive')

    await waitFor(() => {
      expect(screen.queryByText('civil')).toBeNull()
    })
    expect(screen.getByText('electrical')).toBeInTheDocument()
  })

  it('shows the error state when the table cannot be read, and Retry asks again', async () => {
    // The app retries a 5xx once silently (query-provider), so the endpoint has
    // to keep failing through that retry before the page owns the failure.
    const { recover } = renderDisciplines(me(), { listFails: 503 })

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // The page still says which page it could not fill.
    expect(screen.getByRole('heading', { name: 'Disciplines' })).toBeInTheDocument()

    recover()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitForTable()
  })

  it('renders no management controls without disciplines.manage', async () => {
    renderDisciplines(me({ permissions: ['disciplines.read'] }))
    await waitForTable()

    expect(screen.queryByRole('button', { name: 'Add discipline' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })

  it('answers the 403 page for a caller without disciplines.read', async () => {
    renderDisciplines(me({ permissions: ['users.read'] }))

    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Disciplines' })).toBeNull()
  })
})

describe('creating', () => {
  it('posts the dialog and closes on success', async () => {
    const { captured } = renderDisciplines()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add discipline' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'mechanical')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Mechanical')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add discipline' }))

    await waitFor(() => {
      expect(captured.creates).toEqual({ code: 'mechanical', name: 'Mechanical' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('refuses a malformed code locally, without a request', async () => {
    const { captured } = renderDisciplines()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Add discipline' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'Civil Works')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add discipline' }))

    expect(await within(dialog).findByText(/Lowercase letters, digits/)).toBeInTheDocument()
    expect(captured.creates).toBeNull()
  })

  it('shows the server duplicate conflict in the dialog', async () => {
    renderDisciplines()
    await waitForTable()
    server.use(
      http.post('/api/v1/masters/disciplines', () =>
        HttpResponse.json(
          { detail: 'A discipline with this code already exists.' },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add discipline' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'civil')
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Civil')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add discipline' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A discipline with this code already exists.',
    )
  })
})

describe('editing, deactivating and deleting', () => {
  it('patches the name alone, with the code shown but not submitted', async () => {
    const { captured } = renderDisciplines()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    // The server's update schema has no `code` and forbids unknown fields, so
    // the dialog shows it disabled rather than offering a rename it cannot make.
    expect(within(dialog).getByLabelText(/^Code/)).toBeDisabled()
    const name = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Civil Works')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(captured.patches).toEqual([{ url: CIVIL.id, body: { name: 'Civil Works' } }])
    })
  })

  it('deactivates and reactivates from the row menu', async () => {
    const { captured } = renderDisciplines()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))
    await waitFor(() => {
      expect(captured.patches).toContainEqual({ url: CIVIL.id, body: { is_active: false } })
    })

    await userEvent.click(screen.getByRole('button', { name: 'Actions for electrical' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Activate' }))
    await waitFor(() => {
      expect(captured.patches).toContainEqual({
        url: ELECTRICAL.id,
        body: { is_active: true },
      })
    })
  })

  it('deletes behind the confirmation', async () => {
    const { captured } = renderDisciplines()
    await waitForTable()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(captured.deletes).toEqual([CIVIL.id])
    })
  })

  it('surfaces an in-use delete refusal as the server sentence', async () => {
    renderDisciplines()
    await waitForTable()
    server.use(
      http.delete('/api/v1/masters/disciplines/:id', () =>
        HttpResponse.json(
          {
            detail:
              'This discipline is still used by a designation and cannot be deleted. Deactivate it instead.',
          },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actions for civil' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/still used by a designation/)).toBeInTheDocument()
  })
})
