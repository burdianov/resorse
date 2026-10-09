import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

import { toApiError } from '@/lib/errors'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Internal: set by the 401 path so one request is retried at most once. */
    apiRetried?: boolean
  }
}

/**
 * The shared Axios instance (F018, BIG-PROMPT §9.3).
 *
 * Three properties matter, and each is a decision rather than a default:
 *
 * - **Same-origin, relative paths.** `baseURL` is the empty origin, so a
 *   request for the schema's own `/api/v1/health` resolves against whatever
 *   host served the SPA — the Vite proxy in development, Caddy in production
 *   (ARCHITECTURE §2). Cookies are therefore first-party and no CORS
 *   preflight exists. `VITE_API_URL` remains as the escape hatch §9.3 allows,
 *   and carries an origin only — never a secret.
 * - **Every rejection is an `ApiError`.** The response interceptor normalises
 *   once, here, so no feature code ever inspects an Axios error (see
 *   `lib/errors.ts` for the shape and the 5xx no-leak rule).
 * - **A 401 is re-resolved once, never refreshed.** Under the opaque-cookie
 *   session design (ARCHITECTURE §3) there is no refresh endpoint and nothing
 *   in JavaScript to refresh. A 401 instead means "the client's auth state may
 *   be stale": an `UnauthorizedHandler` re-resolves it, and if the session
 *   turns out to still be valid the original request is retried **once**.
 *   Concurrent 401s share a single resolution (single-flight), and requests to
 *   `/auth/*` are never retried — a 401 from the login endpoint is the answer,
 *   not a stale session (BIG-PROMPT §6.2e). F032 registers the handler.
 * - **Unsafe requests carry the CSRF double-submit.** F029's middleware
 *   demands `X-CSRF-Token` == the readable `__Host-csrf` cookie on every
 *   POST/PUT/PATCH/DELETE that carries the session cookie. Putting it here —
 *   one request interceptor — is what makes it impossible for a feature to
 *   forget; a caller that sets the header itself (tests) keeps its value.
 */

export type UnauthorizedHandler = () => Promise<boolean>

/** Longest a request may take before it is treated as unreachable. Per-request
 * overrides exist for genuinely slow work (report generation, F052). */
const REQUEST_TIMEOUT_MS = 30_000

/** Paths whose 401 is a verdict, not a stale session (BIG-PROMPT §6.2e). */
const AUTH_PATH = '/auth/'

export const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: REQUEST_TIMEOUT_MS,
  // Same-origin requests send cookies regardless; stating it keeps the intent
  // explicit and the VITE_API_URL escape hatch usable cross-origin (which then
  // needs server-side CORS — ARCHITECTURE §2).
  withCredentials: true,
  headers: { Accept: 'application/json' },
})

let unauthorizedHandler: UnauthorizedHandler | null = null
let reauthInFlight: Promise<boolean> | null = null

/** The readable CSRF companion cookie (F028 issues it; F029's middleware checks it). */
export const CSRF_COOKIE_NAME = '__Host-csrf'
export const CSRF_HEADER_NAME = 'X-CSRF-Token'

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

/**
 * The `__Host-csrf` value, or null when the cookie is absent. The parameter
 * exists so unit tests can hand in a cookie header without owning the real
 * document; production always reads the default.
 */
export function readCsrfToken(cookieHeader: string = document.cookie): string | null {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === CSRF_COOKIE_NAME) {
      return part.slice(separator + 1).trim()
    }
  }
  return null
}

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (!UNSAFE_METHODS.has(method)) return config
  const token = readCsrfToken()
  // Login carries no session cookie and the middleware exempts it from the
  // double-submit; attaching the header anyway is harmless (and correct the
  // moment a stale session cookie makes the pair checkable).
  if (token !== null && !config.headers.has(CSRF_HEADER_NAME)) {
    config.headers.set(CSRF_HEADER_NAME, token)
  }
  return config
})

/**
 * Register (F032) or clear (tests, logout) the auth re-resolution used by the
 * 401 path. The handler must resolve `true` only when the caller is still
 * authenticated after re-checking — resolving `false` leaves the 401 to the
 * caller, which is what lets the auth guard redirect to `/login`.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

/** Single-flight: concurrent 401s await one resolution, not one each. */
function resolveUnauthorized(handler: UnauthorizedHandler): Promise<boolean> {
  reauthInFlight ??= handler()
    .catch(() => false)
    .finally(() => {
      reauthInFlight = null
    })
  return reauthInFlight
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const apiError = toApiError(error)
    const config = axios.isAxiosError(error) ? error.config : undefined

    if (
      apiError.isUnauthorized &&
      config &&
      unauthorizedHandler !== null &&
      config.apiRetried !== true &&
      !(config.url ?? '').includes(AUTH_PATH)
    ) {
      config.apiRetried = true
      if (await resolveUnauthorized(unauthorizedHandler)) {
        return apiClient.request(config)
      }
    }

    throw apiError
  },
)

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config)
  // 204 has no body; `undefined` is the honest value for `void` responses.
  if (response.status === 204) return undefined as T
  return response.data
}

/**
 * The facade feature code uses (typed DTOs come from `lib/generated/api`).
 * `api.get<HealthApiV1HealthGetResponse>('/api/v1/health')` — the path is
 * written once per endpoint; a renamed route changes the generated type name,
 * so the mismatch is a compile error rather than a 404 at runtime.
 */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    request<T>({ ...config, method: 'GET', url }),

  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    request<T>({ ...config, method: 'POST', url, data: body }),

  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    request<T>({ ...config, method: 'PUT', url, data: body }),

  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    request<T>({ ...config, method: 'PATCH', url, data: body }),

  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    request<T>({ ...config, method: 'DELETE', url }),
}
