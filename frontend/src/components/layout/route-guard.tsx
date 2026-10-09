import type { ReactNode } from 'react'

import { ForbiddenPage } from '@/pages/forbidden'
import { meetsAccess } from '@/config/access'
import { useAccess } from '@/components/providers/access-provider'

/**
 * Route-level permission check, applied automatically to every registered route
 * that declares `requiredPermissions` or `adminOnly` (`buildRouteObjects`), so a
 * route cannot be registered without its 403 state (BIG-PROMPT §4.6, §7.4c).
 *
 * The denial is the **403 page**, not a redirect to `/login`: a caller without a
 * session belongs at the login screen (F032's guard, §6.2f), while a caller who
 * is signed in but not permitted belongs here — the two must stay distinct.
 *
 * Visibility, not authorization: the API enforces the real rule and fails
 * closed (§6.3d). This guard only decides which page the SPA shows.
 */
export interface RouteGuardProps {
  permissions?: readonly string[]
  adminOnly?: boolean
  children: ReactNode
}

export function RouteGuard({ permissions, adminOnly, children }: RouteGuardProps) {
  const access = useAccess()
  const allowed = meetsAccess(
    { requiredPermissions: permissions ?? [], adminOnly: adminOnly === true },
    access,
  )

  if (!allowed) {
    return <ForbiddenPage />
  }
  return <>{children}</>
}
