import type { NavGroup, RouteDefinition } from './navigation'

/**
 * The module extension slot (BIG-PROMPT §4.8 "Future Modules", §9.6).
 *
 * Stage B (and any future bounded feature area) contributes navigation, routes
 * and permission *declarations* through this interface. The shape follows
 * ARCHITECTURE §7, which is binding in intent: modules are **compiled in** —
 * there is no runtime loader and no remote code — and permissions are only
 * *declared* here; they are registered server-side, so a module can never grant
 * itself authority.
 *
 * `APP_MODULES` is the single registration point. A module with a
 * `featureFlag` stays dark until that flag is enabled for the caller (F016
 * evaluates it per request via `NavigationAccess.features`). F063 proves the
 * whole contract end to end with a test-only module.
 */
export interface AppModule {
  /** Stable identifier, e.g. `demo_records`. */
  id: string
  /** Extra titled groups for the navigation (§4.8). */
  navigation?: readonly NavGroup[]
  /** Routes mounted under the app shell, same metadata contract as the built-ins. */
  routes: readonly RouteDefinition[]
  /** Declared permission codes; the server owns the registry (ARCHITECTURE §6). */
  permissions?: readonly PermissionDefinition[]
  /** Keeps the whole module dark until the flag is enabled. */
  featureFlag?: string
}

export interface PermissionDefinition {
  /** Machine-stable `resource.action` code. */
  code: string
  /** Human description for the permission dictionary (F037/F038). */
  description: string
}

/** Compiled-in modules. Empty in Stage A; F063's proof module is test-only. */
export const APP_MODULES: readonly AppModule[] = []
