/**
 * The access model: who may *see* what (BIG-PROMPT §6.3d — visibility, never
 * the security boundary; the API decides what is allowed).
 *
 * **This module is deliberately a leaf: it imports nothing.** The registry
 * (`./navigation.ts`) needs it, the registry also mounts the route guard, and
 * the guard needs the access provider — so if the model lived *inside* the
 * registry, the chain `navigation → route-guard → access-provider →
 * navigation` would close, and native ESM evaluates that cycle before
 * `ANONYMOUS_ACCESS` exists: `ReferenceError: Cannot access 'ANONYMOUS_ACCESS'
 * before initialization`, a blank page. `tsc`, the Vite build and Vitest all
 * tolerate that cycle, which is why F017 shipped it and only a browser caught
 * it; `tests/lib/module-graph.test.ts` now fails on any cycle, and this file
 * is the reason that guard stays green. Do not move these definitions back
 * into `navigation.ts`.
 */

/** What the caller may see. Resolved once per session and supplied downstream. */
export interface NavigationAccess {
  /** Union of the roles' permission codes (ARCHITECTURE §6). */
  permissions: ReadonlySet<string>
  /** Explicit super-admin handling: everything passes except disabled flags. */
  isSuperuser: boolean
  /** Enabled feature flags; anything absent is disabled (fail closed). */
  features?: ReadonlySet<string>
}

/** No session exists yet — and an anonymous caller correctly sees almost nothing. */
export const ANONYMOUS_ACCESS: NavigationAccess = {
  permissions: new Set(),
  isSuperuser: false,
}

/** The metadata a visibility decision is made from; routes and groups are both. */
export interface AccessRequirement {
  /** Every code must be held (the union across roles is resolved upstream). */
  requiredPermissions?: readonly string[]
  /** Additionally requires administrative authority — see `hasAdministrationAccess`. */
  adminOnly?: boolean
  /** Visible only while this flag is enabled for the caller. */
  featureFlag?: string
}

/**
 * Permission namespaces that make a caller "administrative" for the coarse
 * `adminOnly` gate. The authoritative codes live in ARCHITECTURE §6; F031
 * resolves the effective set and F036 refines the admin screens.
 */
const ADMINISTRATION_NAMESPACES: readonly string[] = [
  'users',
  'roles',
  'permissions',
  'settings',
  'audit',
]

export function hasAdministrationAccess(access: NavigationAccess): boolean {
  if (access.isSuperuser) return true
  for (const permission of access.permissions) {
    const separator = permission.indexOf('.')
    if (separator <= 0) continue
    if (ADMINISTRATION_NAMESPACES.includes(permission.slice(0, separator))) return true
  }
  return false
}

/**
 * The single visibility rule, shared by the registry and `PermissionGate`.
 * Feature flags gate even a superuser: a flag says the module is off, not that
 * the caller is unprivileged.
 */
export function meetsAccess(
  requirement: AccessRequirement,
  access: NavigationAccess,
): boolean {
  if (requirement.featureFlag && !access.features?.has(requirement.featureFlag)) return false
  if (requirement.adminOnly && !hasAdministrationAccess(access)) return false
  if (access.isSuperuser) return true
  return (requirement.requiredPermissions ?? []).every((code) => access.permissions.has(code))
}
