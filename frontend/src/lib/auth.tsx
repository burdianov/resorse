import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { ANONYMOUS_ACCESS } from '@/config/access'
import type { NavigationAccess } from '@/config/access'
import { api, setUnauthorizedHandler } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import type { MeResponse } from '@/lib/generated/api'

/**
 * The session, as the SPA knows it (F032, BIG-PROMPT §6.2e).
 *
 * The server owns the session; this provider owns the *client's understanding
 * of it*, and keeps that understanding in exactly one place so every screen,
 * the route guard and the HTTP layer read the same answer.
 *
 * Four resolution outcomes, and the distinction between the last two is the
 * §6.2e requirement that "network failure and 5xx get a Retry UI" while only
 * a *clear* anonymous answer redirects to `/login`:
 *
 * - `loading` — nothing is known yet; the guard shows a pending state.
 * - `authenticated` — `/auth/me` answered; `user` and `access` are real.
 * - `anonymous` — `/auth/me` answered **401**; the guard sends to `/login`.
 * - `error` — `/auth/me` could not be reached (network, 5xx); the guard shows
 *   Retry. Treating this as anonymous would log a user out over a hiccup.
 *
 * There is no refresh endpoint (DECISIONS C12) and nothing in JavaScript to
 * refresh; `api.ts`'s 401 machinery instead re-resolves the session through
 * the handler registered here — one `/auth/me` request, single-flight, and the
 * original request retried once.
 *
 * **Identity changes clear the query cache.** `queryKeys`' rule (F018) is that
 * user-scoped keys carry the user id, so a missed clear cannot serve one
 * account's data from another's cache entry; this provider adds the belt to
 * that suspenders. Cache clearing happens on every *identity transition* —
 * null→Ada, Ada→Grace, Ada→null — never on a same-user refresh.
 */

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  /** The signed-in account (identity + roles + expanded permissions), or null. */
  user: MeResponse | null
  /** What the UI may show. UX only — the API is the boundary (ARCHITECTURE §6). */
  access: NavigationAccess
  /** Sign in; resolves once the identity is real. Rejections are `ApiError`s. */
  login: (email: string, password: string) => Promise<void>
  /** Change the caller's password; on success the rotated session is re-read. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /** End this session. Always clears local state (the endpoint is idempotent). */
  logout: () => Promise<void>
  /** End every session of the account. */
  logoutAll: () => Promise<void>
  /** Re-resolve after an `error` status (the Retry button). */
  retry: () => void
}

/** Rejects loudly: the actions cannot work without the provider. Typed with a
 * rest parameter so one constant satisfies every action signature. */
const UNAVAILABLE = (..._args: unknown[]): Promise<never> =>
  Promise.reject(new Error('useAuth must be used inside <AuthProvider>'))

/**
 * Fail closed: a component rendered outside the provider is anonymous — it
 * sees nothing rather than everything (ARCHITECTURE §6). The actions cannot
 * work without the provider and say so loudly instead of pretending.
 */
const AuthContext = createContext<AuthContextValue>({
  status: 'anonymous',
  user: null,
  access: ANONYMOUS_ACCESS,
  login: UNAVAILABLE,
  changePassword: UNAVAILABLE,
  logout: UNAVAILABLE,
  logoutAll: UNAVAILABLE,
  retry: () => undefined,
})

function accessFrom(user: MeResponse | null): NavigationAccess {
  if (!user) return ANONYMOUS_ACCESS
  return { permissions: new Set(user.permissions), isSuperuser: user.is_superuser }
}

async function fetchMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/api/v1/auth/me')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<{ status: AuthStatus; user: MeResponse | null }>({
    status: 'loading',
    user: null,
  })
  const identityRef = useRef<string | null>(null)

  /** Every state change goes through here, so cache clearing cannot be forgotten. */
  const applyIdentity = useCallback(
    (user: MeResponse | null, status: AuthStatus) => {
      const nextId = user?.id ?? null
      if (identityRef.current !== nextId) {
        queryClient.clear()
        identityRef.current = nextId
      }
      setState({ status, user })
    },
    [queryClient],
  )

  const resolveSession = useCallback(async () => {
    try {
      applyIdentity(await fetchMe(), 'authenticated')
    } catch (error) {
      const apiError = toApiError(error)
      // 401 is the server's clear "no session" — anything else (network, 5xx)
      // leaves the answer unknown, and unknown must not mean logged out.
      if (apiError.isUnauthorized) applyIdentity(null, 'anonymous')
      else setState({ status: 'error', user: null })
    }
  }, [applyIdentity])

  // The first resolution, once per mount.
  useEffect(() => {
    void resolveSession()
  }, [resolveSession])

  // Hand the 401 machinery its re-resolution (F018's hook, F032's handler):
  // answering `true` retries the original request once; `false` lets the 401
  // surface, and the guard reacts to the state change.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      try {
        applyIdentity(await fetchMe(), 'authenticated')
        return true
      } catch (error) {
        if (toApiError(error).isUnauthorized) applyIdentity(null, 'anonymous')
        // Network failure while re-resolving: the original 401 stands; state
        // is left as it was rather than guessing.
        return false
      }
    })
    return () => {
      setUnauthorizedHandler(null)
    }
  }, [applyIdentity])

  const login = useCallback(
    async (email: string, password: string) => {
      // The login answer is identity-only by design (F028): the permission
      // union is `/auth/me`'s, and one definition beats two.
      await api.post('/api/v1/auth/login', { email, password })
      applyIdentity(await fetchMe(), 'authenticated')
    },
    [applyIdentity],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.post('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      // The change rotated the session and cleared the forced-change flag,
      // in one server commit (F030); re-reading keeps this side truthful.
      applyIdentity(await fetchMe(), 'authenticated')
    },
    [applyIdentity],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } finally {
      // The endpoint is the authority and answers 204 even for a dead session;
      // local state clears regardless, because the user asked to be signed out.
      applyIdentity(null, 'anonymous')
    }
  }, [applyIdentity])

  const logoutAll = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout-all')
    } finally {
      applyIdentity(null, 'anonymous')
    }
  }, [applyIdentity])

  const retry = useCallback(() => {
    setState({ status: 'loading', user: null })
    void resolveSession()
  }, [resolveSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      access: accessFrom(state.user),
      login,
      changePassword,
      logout,
      logoutAll,
      retry,
    }),
    [state, login, changePassword, logout, logoutAll, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

/**
 * The path to return to after signing in, taken from the guard's location
 * state. Only an **in-app path** is ever accepted: a string starting with a
 * single `/` (no `//host` protocol-relative form), so the login page can never
 * be turned into an open redirect.
 */
export function readIntendedPath(state: unknown, fallback = '/dashboard'): string {
  if (typeof state !== 'object' || state === null) return fallback
  const from = (state as { from?: unknown }).from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return fallback
  return from
}
