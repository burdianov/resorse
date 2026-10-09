import { isAxiosError } from 'axios'
import type { AxiosError, AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'

/**
 * The single error shape the whole frontend consumes (F018, BIG-PROMPT §8.3b).
 *
 * Every rejection that leaves the API client is an `ApiError`, whatever went
 * wrong: an HTTP status, a dead network, an aborted request, or a plain thrown
 * Error. Feature code therefore never needs to ask "is this an Axios error?" —
 * it switches on `status`, `isNetworkError` or `isValidation`, and the states
 * from F017 (`ErrorState variant="offline"`, field-level form errors in F019)
 * become mechanical to render.
 *
 * Two safety rules are compiled in here rather than left to call sites:
 *
 * - **5xx responses never surface their body.** A failed server response can
 *   carry a stack trace, a proxy's HTML error page or internal detail; the
 *   client substitutes its own copy (§6.2f's "no data leak" applies to error
 *   UI). 4xx `detail` strings are shown, because those are written for the
 *   user by our own backend.
 * - **Cancelled requests are marked, not thrown away.** TanStack Query cancels
 *   in-flight queries on unmount; surfacing that as a failure would toast at a
 *   user who just navigated, so `isCanceled` lets the layers above stay quiet.
 */

export interface FieldError {
  /**
   * Dotted path of the offending field ("email", "items.0.name"). Empty when
   * the error belongs to the request as a whole rather than one field.
   */
  field: string
  message: string
}

export type ApiErrorKind = 'http' | 'network' | 'canceled' | 'unknown'

/** Copy shown when the server answered 5xx — never the server's own words. */
export const SERVER_ERROR_DETAIL = 'Something went wrong on the server. Please try again.'
/** Copy shown when no response arrived at all. */
export const NETWORK_ERROR_DETAIL =
  'The server could not be reached. Check your connection and try again.'

/**
 * Fallback copy for 4xx responses whose body carries no usable `detail`.
 * Deliberately phrased from the user's side; the status code alone is never
 * shown as the message.
 */
const FALLBACK_DETAIL: Record<number, string> = {
  400: 'The request was rejected.',
  401: 'You need to sign in to do that.',
  403: 'You do not have permission to do that.',
  404: 'The requested item was not found.',
  405: 'That action is not allowed here.',
  409: 'The change conflicts with the current state of the record.',
  422: 'Some of the submitted values need attention.',
  429: 'Too many requests — try again in a moment.',
}

interface ApiErrorOptions {
  kind: ApiErrorKind
  detail: string
  status?: number | null
  fieldErrors?: readonly FieldError[]
  requestId?: string | null
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status, or null when no response arrived (network, cancelled, bug). */
  readonly status: number | null
  /** Human-readable, safe to display. */
  readonly detail: string
  /** Field-addressable validation errors (422); empty otherwise. */
  readonly fieldErrors: readonly FieldError[]
  /** Server correlation id when the response carried one (logging: F060). */
  readonly requestId: string | null

  constructor(options: ApiErrorOptions) {
    super(options.detail, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status ?? null
    this.detail = options.detail
    this.fieldErrors = options.fieldErrors ?? []
    this.requestId = options.requestId ?? null
  }

  get isNetworkError(): boolean {
    return this.kind === 'network'
  }

  get isCanceled(): boolean {
    return this.kind === 'canceled'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isValidation(): boolean {
    return this.status === 422
  }

  get isServerError(): boolean {
    return this.status !== null && this.status >= 500
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/**
 * Normalise anything thrown into an `ApiError`. Already-normalised errors pass
 * through, so the client's interceptor and the query layer's `onError` can both
 * call this without double-wrapping.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAxiosError(error)) return fromAxiosError(error)
  if (error instanceof Error) {
    return new ApiError({ kind: 'unknown', detail: error.message, cause: error })
  }
  return new ApiError({ kind: 'unknown', detail: 'An unexpected error occurred.', cause: error })
}

function fromAxiosError(error: AxiosError): ApiError {
  // Axios marks aborts itself; the code is also checked because a cancel error
  // created by a different axios instance still descends from the same shape.
  if (error.code === 'ERR_CANCELED') {
    return new ApiError({ kind: 'canceled', detail: 'The request was cancelled.', cause: error })
  }

  const response = error.response
  if (!response) {
    // No response at all: DNS failure, connection refused, TLS failure, timeout.
    return new ApiError({ kind: 'network', detail: NETWORK_ERROR_DETAIL, cause: error })
  }

  const status = response.status
  return new ApiError({
    kind: 'http',
    status,
    detail: httpDetail(status, response.data),
    fieldErrors: status === 422 ? fieldErrorsFromBody(response.data) : [],
    requestId: readRequestId(response.headers),
    cause: error,
  })
}

function httpDetail(status: number, body: unknown): string {
  if (status >= 500) return SERVER_ERROR_DETAIL
  return detailFromBody(body) ?? FALLBACK_DETAIL[status] ?? `The request failed (HTTP ${status}).`
}

/**
 * FastAPI's contract is `{ "detail": <string | validation-array> }`
 * (ARCHITECTURE §10). Only a *structured* `detail` string is trusted — a bare
 * string body could be an HTML error page from an intermediary, and showing
 * that would be both meaningless and a leak.
 */
function detailFromBody(body: unknown): string | null {
  if (!isRecord(body)) return null
  const detail = body['detail']
  if (typeof detail !== 'string') return null
  const trimmed = detail.trim()
  return trimmed === '' ? null : trimmed
}

/** Pydantic's 422 entries: `{ loc: ['body', 'field', ...], msg, type }`. */
function fieldErrorsFromBody(body: unknown): FieldError[] {
  if (!isRecord(body)) return []
  const detail = body['detail']
  if (!Array.isArray(detail)) return []

  const errors: FieldError[] = []
  for (const entry of detail) {
    if (!isRecord(entry)) continue
    const message = entry['msg']
    if (typeof message !== 'string') continue
    const loc = entry['loc']
    // Drop the first element ('body' | 'query' | 'path' | 'header'): forms map
    // the remaining path onto inputs, e.g. ['body', 'items', 0, 'name'] →
    // 'items.0.name'. An entry located only at 'body' becomes a form-level error.
    const field = Array.isArray(loc) ? loc.slice(1).map(String).join('.') : ''
    errors.push({ field, message })
  }
  return errors
}

function readRequestId(headers: AxiosResponseHeaders | RawAxiosResponseHeaders): string | null {
  const value: unknown = headers['x-request-id']
  return typeof value === 'string' && value !== '' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
