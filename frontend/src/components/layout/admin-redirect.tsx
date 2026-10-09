import { Navigate } from 'react-router'

import { ForbiddenPage } from '@/pages/forbidden'
import { firstPermittedAdminPath } from '@/config/navigation'
import type { RouteDefinition } from '@/config/navigation'
import { useAccess } from '@/components/providers/access-provider'

/**
 * `/admin` → the first administration route the caller may actually open, or
 * the 403 page when there is none (BIG-PROMPT §4.4: "redirect to /admin/users
 * when authorized, otherwise 403").
 *
 * `routes` defaults to the registry and exists so a caller can resolve against
 * the same route set the router actually mounted — which is how tests mount
 * fixture registries.
 *
 * Until F034 registers `/admin/users` the registry holds no `/admin/*` route, so
 * every caller lands on the 403 — which is the true answer, not a workaround:
 * there is nothing to redirect to yet.
 */
export function AdminRedirect({ routes }: { routes?: readonly RouteDefinition[] }) {
  const access = useAccess()
  const target = firstPermittedAdminPath(access, routes)

  if (!target) {
    return <ForbiddenPage />
  }
  return <Navigate to={target} replace />
}
