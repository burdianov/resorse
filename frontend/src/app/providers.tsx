import type { ReactNode } from 'react'

import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/sonner'

/**
 * The application's provider stack, in one place (ARCHITECTURE §5 puts it at
 * `app/providers.tsx`). Order is load-bearing: the query layer's error toasts
 * render through `Toaster`, which reads the resolved theme, so the theme comes
 * first and the toaster sits inside it.
 *
 * Session state (F032) will join here — an auth provider must wrap the query
 * layer, because queries are only enabled once the session has resolved.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        <Toaster />
      </QueryProvider>
    </ThemeProvider>
  )
}
