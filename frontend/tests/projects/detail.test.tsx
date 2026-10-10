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
 * `/projects/:projectId` — one record and its status control (D009).
 *
 * The same "the only stand-in is the network" harness as the register's test
 * (`tests/projects/index.test.tsx`), with one addition worth naming: the MSW
 * detail handler keeps the row it returns and the PATCH handler **writes to
 * it**, so the refetch the mutation triggers answers what a real server would
 * have answered. Without that, a screen that only updated its own local copy
 * would pass and a screen that follows the server's answer would look broken.
 *
 * What this file pins: the fields render from the contract (including the
 * read-only responsible person), the control posts exactly one field — D008's
 * update shape is partial, and an empty edit is a 400 — the save is refused
 * until the selection actually changes, a caller without `projects.update` sees
 * the value and no control at all, an unknown id is the API's 404 rendered as
 * "not found" with a way back, and a refusal mid-flight arrives as the server's
 * own sentence rather than a generic failure.
 */

configure({ asyncUtilTimeout: 3000 })

const PROJECT_ID = '50000000-0000-7000-8000-000000000001'
const RESPONSIBLE_ID = '00000000-0000-7000-8000-000000000042'

const PROJECT: ProjectItem = {
  id: PROJECT_ID,
  code: 'DC-1140',
  name: 'Data centre shell and core',
  status: 'tender',
  start_date: '2026-01-05',
  contractual_completion: '2027-03-31',
  forecast_completion: '2027-06-30',
  responsible_user_id: RESPONSIBLE_ID,
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
    roles: ['planner'],
    permissions: ['projects.read', 'projects.update'],
    ...overrides,
  }
}

interface CapturedRequests {
  patches: { url: string; body: Record<string, unknown> }[]
}

function renderProject(
  init: {
    project?: ProjectItem
    meUser?: MeResponse
    /** When set, `projects.update` answers this refusal instead of applying. */
    refusal?: { status: number; detail: string }
    /** Serve 404 for the record, whatever id is asked for. */
    notFound?: boolean
  } = {},
) {
  // The handler serves one row and the PATCH mutates it — see the docstring.
  let current: ProjectItem = init.project ?? PROJECT
  const requests: CapturedRequests = { patches: [] }

  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(init.meUser ?? me())),
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => HttpResponse.json({ unread_count: 0 })),
    http.get('/api/v1/projects/:id', ({ params }) =>
      init.notFound !== true && params.id === current.id
        ? HttpResponse.json(current)
        : HttpResponse.json({ detail: 'Project not found.' }, { status: 404 }),
    ),
    http.patch('/api/v1/projects/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      requests.patches.push({ url: String(params.id), body })
      if (init.refusal !== undefined) {
        return HttpResponse.json({ detail: init.refusal.detail }, { status: init.refusal.status })
      }
      // A real edit applies the partial body and answers the merged row.
      current = { ...current, ...(body as Partial<ProjectItem>) }
      return HttpResponse.json(current)
    }),
  )

  const router = createMemoryRouter(buildAppRoutes(), {
    initialEntries: [`/projects/${current.id}`],
  })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, requests }
}

async function waitForRecord() {
  await screen.findByRole('heading', { name: /DC-1140/ })
}

afterEach(() => {
  toast.dismiss()
})

describe('the record', () => {
  it('renders the contract’s fields, dates and the read-only responsible person', async () => {
    renderProject()

    await waitForRecord()

    expect(screen.getByText('Data centre shell and core')).toBeInTheDocument()
    expect(screen.getByText('05.01.2026')).toBeInTheDocument()
    expect(screen.getByText('31.03.2027')).toBeInTheDocument()
    expect(screen.getByText('30.06.2027')).toBeInTheDocument()
    // The id the contract carries, with no request to a directory this caller
    // need not be allowed to read.
    expect(screen.getByText(RESPONSIBLE_ID)).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveTextContent('Tender')
  })

  it('says nobody is answerable rather than rendering an empty value', async () => {
    renderProject({ project: { ...PROJECT, responsible_user_id: null } })

    await waitForRecord()

    expect(screen.getByText('Not assigned')).toBeInTheDocument()
  })

  it('answers an unknown id with "not found" and a way back', async () => {
    renderProject({ notFound: true })

    expect(await screen.findByText('Project not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument()
  })
})

describe('the status control', () => {
  it('posts the status alone and follows the server’s answer', async () => {
    const { requests } = renderProject()

    await waitForRecord()
    // Nothing to save until the selection moves: D008 answers 400 for an empty
    // edit, and a button that could send one would be inviting that refusal.
    expect(screen.getByRole('button', { name: 'Save status' })).toBeDisabled()

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Awarded' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save status' }))

    await waitFor(() => {
      expect(requests.patches).toEqual([{ url: PROJECT_ID, body: { status: 'awarded' } }])
    })
    // The screen shows what the server now holds, not what the control said.
    await waitFor(() => {
      expect(screen.getByLabelText('Status')).toHaveTextContent('Awarded')
    })
    expect(screen.getByRole('button', { name: 'Save status' })).toBeDisabled()
  })

  it('renders the value and no control for a caller without projects.update', async () => {
    renderProject({ meUser: me({ permissions: ['projects.read'] }) })

    await waitForRecord()

    expect(screen.queryByLabelText('Status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save status' })).toBeNull()
    // The badge in the heading and the read-only value both say it.
    expect(screen.getAllByText('Tender').length).toBeGreaterThan(0)
  })

  it('surfaces a refused change as the server’s sentence', async () => {
    const { requests } = renderProject({
      refusal: { status: 404, detail: 'Project not found.' },
    })

    await waitForRecord()
    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Retired' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save status' }))

    expect(await screen.findByText('Project not found.')).toBeInTheDocument()
    // The refusal changed nothing: the selection that failed stays on screen.
    expect(screen.getByLabelText('Status')).toHaveTextContent('Retired')
    expect(requests.patches).toHaveLength(1)
  })
})
