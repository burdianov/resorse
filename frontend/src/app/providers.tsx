import type { ReactNode } from 'react'

import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth'

/**
 * The application's provider stack, in one place (ARCHITECTURE §5 puts it at
 * `app/providers.tsx`). Order is load-bearing:
 *
 * 1. the theme, because the query layer's error toasts render through
 *    `Toaster`, which reads the resolved theme;
 * 2. the query layer;
 * 3. the session (F032) — **inside** the query layer, because an identity
 *    change must clear the query cache, which needs the client. The original
 *    note here said the reverse ("queries are only enabled once the session
 *    has resolved"); that concern is real but answered a level up — pages
 *    never mount before the session resolves, because the route guard holds
 *    the shell back until it does. So no query can fire as the wrong identity,
 *    and the auth provider gets the client handle it needs.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  )
}
