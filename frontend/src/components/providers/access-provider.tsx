import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

import { ANONYMOUS_ACCESS } from '@/config/navigation'
import type { NavigationAccess } from '@/config/navigation'

/**
 * Carries the caller's resolved access (permission union, super-admin flag,
 * enabled feature flags) to everything that filters on it.
 *
 * The real value arrives with the session — F031 resolves the permission union
 * server-side, F032 supplies it here after the auth state settles. Until then
 * the shell providers it with `ANONYMOUS_ACCESS`, which is the *correct* answer
 * for an unauthenticated caller, not a placeholder.
 *
 * The default is deliberately anonymous and therefore **fail closed**
 * (ARCHITECTURE §6): a component rendered outside a provider sees nothing rather
 * than everything.
 *
 * This is UX only. It decides what is *shown*; it never decides what is allowed
 * (BIG-PROMPT §6.3d).
 */
const AccessContext = createContext<NavigationAccess>(ANONYMOUS_ACCESS)

export function AccessProvider({
  access,
  children,
}: {
  access: NavigationAccess
  children: ReactNode
}) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
}

export function useAccess(): NavigationAccess {
  return useContext(AccessContext)
}
