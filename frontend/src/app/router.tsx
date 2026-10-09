import { createBrowserRouter, Navigate } from 'react-router'
import type { RouteObject } from 'react-router'

import { AdminRedirect } from '@/components/layout/admin-redirect'
import { AppShell } from '@/components/layout/app-shell'
import { RouteError } from '@/components/layout/route-error'
import { allRoutes, buildRouteObjects } from '@/config/navigation'
import type { NavigationAccess, RouteDefinition } from '@/config/navigation'
import { ForbiddenPage } from '@/pages/forbidden'
import { NotFoundPage } from '@/pages/not-found'

/**
 * Route table — data-router mode (ARCHITECTURE §5), F017's route states.
 *
 * - `/` redirects into the protected area (§4.1). F032 makes the redirect
 *   auth-aware; today there is no session concept at all, so the placeholder
 *   dashboard is where it points.
 * - The children from `buildRouteObjects()` each carry their own error boundary
 *   and, where the registry demands permissions, their own 403 state.
 * - `/admin` redirects to the first permitted administration route or shows the
 *   403 (§4.4); `/403` and `/404` are direct-visible states, and `*` catches
 *   everything else inside the shell (§4.6).
 *
 * It is a function of (access, registry) so tests mount **the real table** with
 * fixture routes and a fixture access instead of re-declaring it — what ships
 * is what is asserted.
 */
export function buildAppRoutes(
  access?: NavigationAccess,
  routes: readonly RouteDefinition[] = allRoutes(),
): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppShell {...(access ? { access } : {})} />,
      // A crash in the shell itself: the frame cannot render, so this boundary
      // is the whole page. Page crashes are caught further down, inside the frame.
      errorElement: (
        <div className="p-6">
          <RouteError />
        </div>
      ),
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
