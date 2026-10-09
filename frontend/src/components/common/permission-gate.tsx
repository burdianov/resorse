import type { ReactNode } from 'react'

import { meetsAccess } from '@/config/navigation'
import { useAccess } from '@/components/providers/access-provider'

/**
 * Hides UI the caller may not use — one of the "enhanced generics" of
 * BIG-PROMPT §5.2b.
 *
 * **This is not a security boundary.** §6.3d and ARCHITECTURE §6 are explicit:
 * the gate, the navigation filter and route guards all decide *visibility*; the
 * API enforces authorization server-side and fails closed. Never let this
 * component stand in for a permission check on the server.
 *
 * It evaluates the *same* rule as the navigation registry (`meetsAccess`), so a
 * hidden nav item and a hidden gate can never disagree.
 */
export interface PermissionGateProps {
  children: ReactNode
  /** Every code must be present in the caller's union of role permissions. */
  permissions?: readonly string[]
  /** Additionally requires administrative authority (users/roles/… namespaces). */
  adminOnly?: boolean
  /** Rendered instead of the children when the check fails; nothing by default. */
  fallback?: ReactNode
}

export function PermissionGate({
  children,
  permissions,
  adminOnly,
  fallback = null,
}: PermissionGateProps) {
  const access = useAccess()
  const allowed = meetsAccess(
    { requiredPermissions: permissions ?? [], adminOnly: adminOnly === true },
    access,
  )
  return <>{allowed ? children : fallback}</>
}
