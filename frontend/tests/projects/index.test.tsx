import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse, ProjectItem } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/projects` — the register, against the real API contract (D009).
 *
 * The acceptance is "Real API integration tests", and this project already has
 * the shape that means (`tests/admin/users.test.tsx`, F034's "UI/API
 * integration tests"): the page renders through the **real** registry and
 * provider stack — `buildAppRoutes()` reads `APP_MODULES`, so the module this
 * task registered is under test rather than a hand-mounted page — every
 * interaction crosses `lib/api.ts` with its CSRF interceptor into MSW, and the
 * assertions are on the requests the screen actually sends and the responses it
 * actually renders. **The only stand-in is the network.**
 *
 * What this file pins, in the order of what would break silently: the
 * server-mode wiring (page, sort, search and status are *request parameters*
 * with D008's own names, so client-side slicing could never satisfy it), the
 * row-to-record link the detail screen is reached by, the route guard's 403 for
 * a caller without `projects.read`, and the empty state that says where rows
 * come from instead of offering a create control this task did not build.
 */

configure({ asyncUtilTimeout: 3000 })

const TENDER_ID = '50000000-0000-7000-8000-000000000001'
const AWARDED_ID = '50000000-0000-7000-8000-000000000002'
const RETIRED_ID = '50000000-0000-7000-8000-000000000003'

function project(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: TENDER_ID,
    code: 'DC-1140',
    name: 'Data centre shell and core',
    status: 'tender',
    start_date: '2026-01-05',
    contractual_completion: '2027-03-31',
    forecast_completion: '2027-06-30',
    responsible_user_id: null,
    ...overrides,
  }
}

const ROWS: ProjectItem[] = [
  project(),
  project({
    id: AWARDED_ID,
    code: 'DC-1102',
    name: 'Hall 3 fit-out',
    status: 'awarded',
    start_date: '2025-11-01',
    contractual_completion: '2026-12-20',
    forecast_completion: '2027-02-15',
    responsible_user_id: '00000000-0000-7000-8000-000000000042',
  }),
  project({
    id: RETIRED_ID,
    code: 'DC-1088',
    name: 'Hall 1 shell',
    status: 'retired',
    start_date: '2024-02-01',
    contractual_completion: '2025-06-30',
    forecast_completion: '2025-05-30',
  }),
]

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    created_at: '2026-01-02T03:04:05Z',
    id: '00000000-0000-7000-8000-000000000009',
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: null,
    is_superuser: false,
    must_change_password: false,
    roles: ['planner'],
    permissions: ['projects.read'],
    ...overrides,
  }
}

interface CapturedRequests {
  listParams: URLSearchParams[]
}

function renderProjects(init: { rows?: ProjectItem[]; total?: number; meUser?: MeResponse } = {}) {
  const rows = init.rows ?? ROWS
  const requests: CapturedRequests = { listParams: [] }
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(init.meUser ?? me())),
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/projects', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.listParams.push(params)
      return HttpResponse.json({
        items: rows,
        total: init.total ?? rows.length,
        page: Number(params.get('page') ?? '1'),
        page_size: Number(params.get('page_size') ?? '25'),
      })
    }),
    http.get('/api/v1/projects/:id', ({ params }) => {
      const found = rows.find((row) => row.id === params.id)
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ detail: 'Project not found.' }, { status: 404 })
    }),
  )

  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/projects'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, requests }
}

async function waitForRows() {
  await screen.findByRole('heading', { name: 'Projects' })
  await screen.findByText('DC-1140')
}

function lastParams(requests: CapturedRequests): URLSearchParams {
  const params = requests.listParams.at(-1)
  if (!params) throw new Error('no list request captured')
  return params
}

afterEach(() => {
  toast.dismiss()
})

describe('the register', () => {
  it('renders the API rows with the server default query, through the real registry', async () => {
    const { requests } = renderProjects()

    await waitForRows()

    expect(screen.getByText('Data centre shell and core')).toBeInTheDocument()
    expect(screen.getByText('Hall 3 fit-out')).toBeInTheDocument()
    expect(screen.getByText('Tender')).toBeInTheDocument()
    expect(screen.getByText('Awarded')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    // The module registered its own nav group, and the shell renders it.
    expect(screen.queryAllByRole('link', { name: 'Projects' }).length).toBeGreaterThan(0)

    // The first request is the page's default, in the contract's own terms.
    const params = lastParams(requests)
    expect(params.get('page')).toBe('1')
    expect(params.get('page_size')).toBe('25')
    expect(params.get('sort')).toBe('created_at')
    expect(params.get('order')).toBe('desc')
    expect(params.get('search')).toBeNull()
    expect(params.get('status')).toBeNull()
  })

  it('sends the search term and the status filter as request parameters', async () => {
    const { requests } = renderProjects()

    await waitForRows()
    await userEvent.type(screen.getByPlaceholderText(/Search codes or names/), 'DC-11')

    await waitFor(() => {
      expect(lastParams(requests).get('search')).toBe('DC-11')
    })

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Awarded' }))

    await waitFor(() => {
      expect(lastParams(requests).get('status')).toBe('awarded')
    })
  })

  it('sorts through the server when a header is clicked', async () => {
    const { requests } = renderProjects()

    await waitForRows()
    await userEvent.click(screen.getByRole('button', { name: /Name/ }))

    await waitFor(() => {
      const params = lastParams(requests)
      expect(params.get('sort')).toBe('name')
      expect(params.get('order')).toBe('asc')
    })
  })

  it('paginates through the server and counts from its total', async () => {
    const { requests } = renderProjects({ rows: [project()], total: 30 })

    await waitForRows()
    expect(screen.getByText(/of 30/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => {
      expect(lastParams(requests).get('page')).toBe('2')
    })
  })

  it('opens a project’s record from the code that names it', async () => {
    renderProjects()

    await waitForRows()
    await userEvent.click(screen.getByRole('link', { name: 'DC-1140' }))

    // The detail screen's heading is the code and its badge the status.
    expect(await screen.findByRole('heading', { name: /DC-1140/ })).toBeInTheDocument()
    expect(screen.getByText('Data centre shell and core')).toBeInTheDocument()
  })

  it('says where projects come from rather than offering a control it lacks', async () => {
    renderProjects({ rows: [] })

    await screen.findByRole('heading', { name: 'Projects' })

    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add project/ })).toBeNull()
  })

  it('answers the 403 page for a caller without projects.read', async () => {
    renderProjects({ meUser: me({ permissions: ['users.read'] }) })

    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull()
  })
})
