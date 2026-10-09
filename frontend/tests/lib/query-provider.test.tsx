import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers'
import {
  createQueryClient,
  QUERY_STALE_TIME_MS,
  shouldRetry,
} from '@/components/providers/query-provider'
import { api } from '@/lib/api'
import { ApiError, SERVER_ERROR_DETAIL, toApiError } from '@/lib/errors'
import type { HealthResponse } from '@/lib/generated/api'
import { queryKeys } from '@/lib/query-keys'
import { server } from '@/testing/msw-server'

/**
 * The query layer's decisions (F018, BIG-PROMPT §9.2): freshness window, retry
 * policy, and — the part that is easy to get wrong — *where a failure becomes
 * visible*. A cold failure belongs to the page's `ErrorState`; a background
 * failure or a failed mutation has no other home and gets a toast. The toasts
 * are asserted through the real `<Toaster />`, so the wiring is proven end to
 * end rather than mocked.
 */

const HEALTH: HealthResponse = {
  status: 'ok',
  name: 'Application Platform',
  version: '0.1.0',
  environment: 'test',
}

function healthHandler(response: () => Response = () => HttpResponse.json(HEALTH)) {
  return http.get('/api/v1/health', response)
}

function fetchHealth() {
  return api.get<HealthResponse>('/api/v1/health')
}

function HealthProbe({ retry = false }: { retry?: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    retry,
  })

  if (query.isPending) return <p>loading</p>
  if (query.isError) {
    // What a page does with a cold failure: render the reason (F017's
    // ErrorState is the production version of this line) — not a toast.
    return <p>failed: {toApiError(query.error).detail}</p>
  }
  return <p>{query.data.name}</p>
}

function RefetchProbe() {
  const query = useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    retry: false,
  })

  return (
    <div>
      <p>{query.isPending ? 'loading' : query.data?.name}</p>
      <button type="button" onClick={() => void query.refetch()}>
        refetch
      </button>
    </div>
  )
}

function FailingMutationProbe() {
  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/thing', { name: 'Ada' }),
  })

  return (
    <button type="button" onClick={() => mutation.mutate()}>
      save
    </button>
  )
}

afterEach(() => {
  // Sonner's queue is module-level; without this a toast from one test would
  // still be on screen in the next.
  toast.dismiss()
})

describe('query client defaults', () => {
  it('uses the 30-second freshness window and the shared retry policy', () => {
    const client = createQueryClient()

    expect(client.getDefaultOptions().queries?.staleTime).toBe(QUERY_STALE_TIME_MS)
    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetry)
    // Writes are not retried implicitly: a mutation may not be idempotent.
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it.each([
    ['a 4xx answer', new ApiError({ kind: 'http', status: 404, detail: 'nope' }), false],
    ['a 409 conflict', new ApiError({ kind: 'http', status: 409, detail: 'conflict' }), false],
    ['a 5xx answer', new ApiError({ kind: 'http', status: 503, detail: 'down' }), true],
    ['a network failure', new ApiError({ kind: 'network', detail: 'offline' }), true],
    ['a cancellation', new ApiError({ kind: 'canceled', detail: 'cancelled' }), false],
  ])('retries %s once: %s', (_label, error, expected) => {
    expect(shouldRetry(0, error)).toBe(expected)
    expect(shouldRetry(1, error)).toBe(false)
  })
})

describe('query failures', () => {
  it('renders fetched data through the provider', async () => {
    server.use(healthHandler())

    render(
      <AppProviders>
        <HealthProbe />
      </AppProviders>,
    )

    expect(await screen.findByText('Application Platform')).toBeInTheDocument()
  })

  it('leaves a cold failure to the page — no toast on top of the error state', async () => {
    server.use(healthHandler(() => HttpResponse.json({ detail: 'down' }, { status: 500 })))

    render(
      <AppProviders>
        <HealthProbe />
      </AppProviders>,
    )

    expect(await screen.findByText(`failed: ${SERVER_ERROR_DETAIL}`)).toBeInTheDocument()
    // The page already says it; a toast would be the same sentence twice.
    expect(screen.queryByText(SERVER_ERROR_DETAIL)).toBeNull()
  })

  it('toasts a background refetch failure while the stale data stays on screen', async () => {
    const user = userEvent.setup()
    server.use(healthHandler())

    render(
      <AppProviders>
        <RefetchProbe />
      </AppProviders>,
    )
    expect(await screen.findByText('Application Platform')).toBeInTheDocument()

    server.use(healthHandler(() => HttpResponse.json({ detail: 'down' }, { status: 500 })))
    await user.click(screen.getByRole('button', { name: 'refetch' }))

    // The toast is the only thing that can tell the user the screen is stale…
    expect(await screen.findByText(SERVER_ERROR_DETAIL)).toBeInTheDocument()
    // …and the data itself survives — a failed refetch does not blank the page.
    expect(screen.getByText('Application Platform')).toBeInTheDocument()
  })
})

describe('mutation failures', () => {
  it('toasts a failed mutation, since nothing else can show it yet', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/thing', () => HttpResponse.json({ detail: 'down' }, { status: 500 })),
    )

    render(
      <AppProviders>
        <FailingMutationProbe />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'save' }))

    expect(await screen.findByText(SERVER_ERROR_DETAIL)).toBeInTheDocument()
  })
})

describe('provider wiring', () => {
  it('honours the client it is given', async () => {
    server.use(healthHandler())
    const client = createQueryClient()

    render(
      <QueryClientProvider client={client}>
        <HealthProbe />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Application Platform')).toBeInTheDocument()
    expect(client.getQueryData(queryKeys.health)).toEqual(HEALTH)
  })
})
