import { HttpResponse, delay, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, setUnauthorizedHandler } from '@/lib/api'
import {
  ApiError,
  NETWORK_ERROR_DETAIL,
  SERVER_ERROR_DETAIL,
  toApiError,
} from '@/lib/errors'
import type { HealthResponse } from '@/lib/generated/api'
import type { HealthApiV1HealthGetResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * The API client's contract (F018): typed DTOs on success, one normalised
 * error shape on failure, and a 401 policy that retries exactly once through a
 * single-flight re-resolution. Every case runs through MSW, so what is asserted
 * is what the network layer actually produces.
 */

const HEALTH: HealthResponse = {
  status: 'ok',
  name: 'Application Platform',
  version: '0.1.0',
  environment: 'test',
}

function healthHandler() {
  return http.get('/api/v1/health', ({ request }) => {
    // Relative /api/v1 resolves against the document origin — same-origin by
    // design (ARCHITECTURE §2), which is what keeps the session cookie
    // first-party.
    expect(request.url).toBe('http://localhost:3000/api/v1/health')
    return HttpResponse.json(HEALTH)
  })
}

afterEach(() => {
  // Module-level state outlives a single test; tests own their handlers only
  // through `server.resetHandlers()`.
  setUnauthorizedHandler(null)
})

describe('typed requests', () => {
  it('returns the parsed DTO of the generated response type', async () => {
    server.use(healthHandler())

    const health = await api.get<HealthApiV1HealthGetResponse>('/api/v1/health')

    expect(health).toEqual(HEALTH)
  })

  it('sends a JSON body on POST and reads the response', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/v1/echo', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ created: true }, { status: 201 })
      }),
    )

    const result = await api.post<{ created: boolean }>('/api/v1/echo', { name: 'Ada' })

    expect(result).toEqual({ created: true })
    expect(bodies).toEqual([{ name: 'Ada' }])
  })

  it('resolves undefined for a 204, which has no body', async () => {
    server.use(http.delete('/api/v1/thing', () => new HttpResponse(null, { status: 204 })))

    await expect(api.delete<void>('/api/v1/thing')).resolves.toBeUndefined()
  })
})

describe('error normalization', () => {
  it('uses the backend detail string for a 4xx', async () => {
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json({ detail: 'A user with this email already exists.' }, { status: 409 }),
      ),
    )

    const error = await api.post('/api/v1/admin/users').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(409)
    expect(apiError.detail).toBe('A user with this email already exists.')
    expect(apiError.kind).toBe('http')
  })

  it('falls back to status-based copy when a 4xx body carries no detail', async () => {
    server.use(http.get('/api/v1/missing', () => HttpResponse.json({ odd: true }, { status: 404 })))

    const error = await api.get('/api/v1/missing').catch((caught: unknown) => caught)

    expect((error as ApiError).detail).toBe('The requested item was not found.')
  })

  it('extracts field-addressable errors from a 422', async () => {
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          {
            detail: [
              { type: 'missing', loc: ['body', 'email'], msg: 'Field required' },
              { type: 'string_too_short', loc: ['body', 'items', 0, 'name'], msg: 'Too short' },
            ],
          },
          { status: 422 },
        ),
      ),
    )

    const error = await api.post('/api/v1/admin/users').catch((caught: unknown) => caught)

    const apiError = error as ApiError
    expect(apiError.isValidation).toBe(true)
    expect(apiError.fieldErrors).toEqual([
      { field: 'email', message: 'Field required' },
      { field: 'items.0.name', message: 'Too short' },
    ])
    // The array-shaped detail is not a message; the fallback copy is.
    expect(apiError.detail).toBe('Some of the submitted values need attention.')
  })

  it('never surfaces a 5xx body, and keeps the correlation id', async () => {
    server.use(
      http.get('/api/v1/broken', () =>
        HttpResponse.json(
          { detail: 'Traceback: connection string postgres://user:pw@host/db' },
          { status: 500, headers: { 'x-request-id': 'req-123' } },
        ),
      ),
    )

    const error = await api.get('/api/v1/broken').catch((caught: unknown) => caught)

    const apiError = error as ApiError
    expect(apiError.isServerError).toBe(true)
    expect(apiError.detail).toBe(SERVER_ERROR_DETAIL)
    expect(apiError.detail).not.toContain('postgres://')
    expect(apiError.requestId).toBe('req-123')
  })

  it('marks a transport failure as a network error', async () => {
    server.use(http.get('/api/v1/offline', () => HttpResponse.error()))

    const error = await api.get('/api/v1/offline').catch((caught: unknown) => caught)

    const apiError = error as ApiError
    expect(apiError.isNetworkError).toBe(true)
    expect(apiError.status).toBeNull()
    expect(apiError.detail).toBe(NETWORK_ERROR_DETAIL)
  })

  it('marks an aborted request as cancelled rather than failed', async () => {
    server.use(
      http.get('/api/v1/slow', async () => {
        await delay(50)
        return HttpResponse.json(HEALTH)
      }),
    )

    const controller = new AbortController()
    const pending = api.get('/api/v1/slow', { signal: controller.signal })
    controller.abort()
    const error = await pending.catch((caught: unknown) => caught)

    expect((error as ApiError).isCanceled).toBe(true)
  })

  it('normalises a plain thrown Error without inventing a status', () => {
    const apiError = toApiError(new Error('boom'))

    expect(apiError.kind).toBe('unknown')
    expect(apiError.status).toBeNull()
    expect(apiError.detail).toBe('boom')
  })

  it('passes an already-normalised error through untouched', () => {
    const original = new ApiError({ kind: 'http', status: 403, detail: 'no' })

    expect(toApiError(original)).toBe(original)
  })
})

describe('401 handling', () => {
  function countingHandler(firstResponse: () => Response) {
    let calls = 0
    const handler = http.get('/api/v1/secure', () => {
      calls += 1
      if (calls === 1) return firstResponse()
      return HttpResponse.json({ ok: true })
    })
    return { handler, callCount: () => calls }
  }

  it('re-resolves once and retries the original request exactly once', async () => {
    const { handler, callCount } = countingHandler(() =>
      HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
    )
    server.use(handler)
    const resolve = vi.fn(async () => true)
    setUnauthorizedHandler(resolve)

    const result = await api.get<{ ok: boolean }>('/api/v1/secure')

    expect(result).toEqual({ ok: true })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(callCount()).toBe(2)
  })

  it('does not retry when the session is genuinely gone', async () => {
    const { handler, callCount } = countingHandler(() =>
      HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
    )
    server.use(handler)
    setUnauthorizedHandler(async () => false)

    const error = await api.get('/api/v1/secure').catch((caught: unknown) => caught)

    expect((error as ApiError).isUnauthorized).toBe(true)
    expect(callCount()).toBe(1)
  })

  it('surfaces the 401 directly when no handler is registered', async () => {
    const { handler, callCount } = countingHandler(() =>
      HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
    )
    server.use(handler)

    const error = await api.get('/api/v1/secure').catch((caught: unknown) => caught)

    expect((error as ApiError).isUnauthorized).toBe(true)
    expect(callCount()).toBe(1)
  })

  it('shares one re-resolution between concurrent 401s (single-flight)', async () => {
    let calls = 0
    server.use(
      http.get('/api/v1/secure', () => {
        calls += 1
        // The first two requests meet the stale session; both retries succeed.
        if (calls <= 2) return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        return HttpResponse.json({ ok: true })
      }),
    )
    // Held open long enough that both 401s are certain to arrive during it —
    // which is exactly the window single-flight exists for.
    const resolve = vi.fn(async () => {
      await delay(25)
      return true
    })
    setUnauthorizedHandler(resolve)

    const [first, second] = await Promise.all([
      api.get<{ ok: boolean }>('/api/v1/secure'),
      api.get<{ ok: boolean }>('/api/v1/secure'),
    ])

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(calls).toBe(4)
  })

  it('never retries an auth endpoint — its 401 is the answer, not staleness', async () => {
    let calls = 0
    server.use(
      http.post('/api/v1/auth/login', () => {
        calls += 1
        return HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 401 })
      }),
    )
    const resolve = vi.fn(async () => true)
    setUnauthorizedHandler(resolve)

    const error = await api
      .post('/api/v1/auth/login', { email: 'a@b.c', password: 'wrong' })
      .catch((caught: unknown) => caught)

    expect((error as ApiError).detail).toBe('Invalid email or password.')
    expect(resolve).not.toHaveBeenCalled()
    expect(calls).toBe(1)
  })

  it('does not retry a second time when the retry also gets a 401', async () => {
    let calls = 0
    server.use(
      http.get('/api/v1/secure', () => {
        calls += 1
        return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
      }),
    )
    const resolve = vi.fn(async () => true)
    setUnauthorizedHandler(resolve)

    const error = await api.get('/api/v1/secure').catch((caught: unknown) => caught)

    expect((error as ApiError).isUnauthorized).toBe(true)
    // One original + one retry; the retry's own 401 is final.
    expect(calls).toBe(2)
    expect(resolve).toHaveBeenCalledTimes(1)
  })
})
