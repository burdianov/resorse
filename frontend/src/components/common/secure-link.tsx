import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { LinkProps } from 'react-router'

import { meetsAccess } from '@/config/access'
import { useAccess } from '@/components/providers/access-provider'

/**
 * A router link that renders only for callers allowed to follow it — the
 * counterpart of `PermissionGate` for "quick links" (BIG-PROMPT §5.2b, §7.2).
 *
 * Same warning as the gate: **visibility, not authorization**. The destination
 * must still enforce its own permissions server-side (§6.3d).
 */
export interface SecureLinkProps extends Omit<LinkProps, 'to'> {
  to: string
  /** Every code must be present in the caller's union of role permissions. */
  permissions?: readonly string[]
  /** Additionally requires administrative authority. */
  adminOnly?: boolean
  /** Rendered when the link is not allowed; nothing by default. */
  fallback?: ReactNode
}

export function SecureLink({
  to,
  permissions,
  adminOnly,
  fallback = null,
  children,
  ...linkProps
}: SecureLinkProps) {
  const access = useAccess()
  const allowed = meetsAccess(
    { requiredPermissions: permissions ?? [], adminOnly: adminOnly === true },
    access,
  )

  if (!allowed) {
    return <>{fallback}</>
  }

  return (
    <Link to={to} {...linkProps}>
      {children}
    </Link>
  )
}
