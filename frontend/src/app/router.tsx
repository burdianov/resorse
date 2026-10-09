import { createBrowserRouter, Navigate } from 'react-router'
import type { RouteObject } from 'react-router'

import { AdminRedirect } from '@/components/layout/admin-redirect'
import { AppShell } from '@/components/layout/app-shell'
import { RequireSession, ProtectedShell } from '@/components/layout/session-guard'
import { RouteError } from '@/components/layout/route-error'
import { allRoutes, buildRouteObjects } from '@/config/navigation'
import type { NavigationAccess } from '@/config/access'
import type { RouteDefinition } from '@/config/navigation'
import { ChangePasswordPage } from '@/pages/change-password'
import { ForbiddenPage } from '@/pages/forbidden'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'

/**
 * Route table — data-router mode (ARCHITECTURE §5), F017's route states with
 * F032's session boundary in front of them.
 *
 * Three branches:
 *
 * - **`/login` and `/change-password`** are standalone (no shell): an
 *   anonymous visitor has no frame to see, and the forced-change user has a
 *   frame they are not yet allowed to use. `/change-password` still demands a
 *   session (`RequireSession`) — it is the way *out* of the forced state, not
 *   a public page.
 * - **The shell branch** (`/`) wraps everything else in `ProtectedShell`:
 *   loading → pending, unknown (network/5xx) → Retry, anonymous → `/login`
 *   with the intended path, forced change → `/change-password`, otherwise the
 *   shell with the resolved access. `/` redirects into the protected area,
 *   `/admin` to the first permitted administration route or the 403 (§4.4),
 *   `/403`/`/404` are direct-visible states and `*` catches everything else
 *   inside the shell (§4.6).
 * - The children from `buildRouteObjects()` each carry their own error
 *   boundary and, where the registry demands permissions, their own 403 state
 *   — the *route-level* denial, deliberately distinct from the session
 *   redirect (a signed-in caller without the permission sees 403, never login).
 *
 * It is a function of (access, registry) so tests mount **the real table**.
 * Passing `access` mounts the shell directly, already authenticated — the
 * fixture-session path the F017 tests use; omitting it (the real app) inserts
 * the session boundary, and the access comes from `/auth/me` through the
 * provider stack.
 */
export function buildAppRoutes(
  access?: NavigationAccess,
  routes: readonly RouteDefinition[] = allRoutes(),
): RouteObject[] {
  const pageError = (
    <div className="p-6">
      <RouteError />
    </div>
  )

  return [
    { path: '/login', element: <LoginPage />, errorElement: pageError },
    {
      path: '/change-password',
      element: (
        <RequireSession>
          <ChangePasswordPage />
        </RequireSession>
      ),
      errorElement: pageError,
    },
    {
      path: '/',
      element: access ? <AppShell access={access} /> : <ProtectedShell />,
      // A crash in the shell itself: the frame cannot render, so this boundary
      // is the whole page. Page crashes are caught further down, inside the frame.
      errorElement: pageError,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        ...buildRouteObjects(routes),
        { path: 'admin', element: <AdminRedirect routes={routes} /> },
        { path: '403', element: <ForbiddenPage /> },
        { path: '404', element: <NotFoundPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ]
}

export const appRoutes = buildAppRoutes()

export const router = createBrowserRouter(appRoutes)
