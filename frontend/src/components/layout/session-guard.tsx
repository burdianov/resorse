import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'

import { ErrorState } from '@/components/common/error-state'
import { LoadingState } from '@/components/common/loading-state'
import { AppShell } from '@/components/layout/app-shell'
import { APP_NAME } from '@/config/branding'
import { useAuth } from '@/lib/auth'

/**
 * The session boundary (F032, BIG-PROMPT §6.2e/§6.2f) — what stands between
 * an anonymous visitor and the shell, and it keeps §6.2e's two rules apart:
 *
 * - **A clear anonymous answer redirects to `/login`**, carrying the intended
 *   in-app path in location state so sign-in lands the visitor where they were
 *   going (`readIntendedPath` accepts only internal paths).
 * - **An *unknown* answer shows Retry.** A network failure or a 5xx while
 *   resolving `/auth/me` is not a logout; sending the user to sign in again
 *   because a hiccup occurred is exactly the failure mode §6.2e names.
 *
 * The forced-change flag turns into a navigation, not a 403 wall: the server
 * refuses regular endpoints until the change completes (F031), so the guard
 * routes there *before* a page can render requests that would all fail. The
 * change screen itself mounts under `RequireSession` without the flag check —
 * it is the way out, and `RequireSession` alone still demands a session.
 *
 * This is UX routing in front of a server that enforces the same rules
 * (ARCHITECTURE §6): nothing here is a security boundary.
 */

function SessionBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </div>
    )
  }

  if (auth.status === 'error') {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <ErrorState
          variant="offline"
          title={`${APP_NAME} is unreachable`}
          description="Your session could not be checked. You have not been signed out."
          onRetry={auth.retry}
        />
      </div>
    )
  }

  if (auth.status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <>{children}</>
}

/** A session is required; the forced-change flag is not consulted. */
export function RequireSession({ children }: { children: ReactNode }) {
  return <SessionBoundary>{children}</SessionBoundary>
}

/**
 * The shell branch of the router: session required, forced change settled,
 * then the frame. `AppShell` receives the resolved access so the navigation
 * and every `PermissionGate` render from the same answer the API enforces.
 */
export function ProtectedShell() {
  const auth = useAuth()

  return (
    <SessionBoundary>
      {auth.user?.must_change_password === true ? (
        <Navigate to="/change-password" replace />
      ) : (
        <AppShell access={auth.access} />
      )}
    </SessionBoundary>
  )
}
