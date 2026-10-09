import { useState } from 'react'
import type { ReactNode } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toApiError } from '@/lib/errors'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /**
       * Set by a mutation whose failures are surfaced *inline* — F019's forms
       * render them through `applyServerErrors` + `FormError`. Without it the
       * user would read the same sentence twice: once in the form, once in a
       * toast.
       */
      suppressErrorToast?: boolean
    }
  }
}

/**
 * Server-state provider (F018, BIG-PROMPT §9.2).
 *
 * The `QueryClient` is scoped to the app and created once. Its defaults encode
 * three decisions:
 *
 * - **`staleTime` 30 s** — §9.2's source-like freshness window. Data younger
 *   than that is served from cache without a refetch, so navigating between
 *   screens does not re-request what was just fetched.
 * - **Retry: never on 4xx, once otherwise.** A 4xx is a verdict — retrying
 *   repeats the question and gets the same answer. Network failures and 5xx
 *   are the transient kind, so they get one silent retry before the user ever
 *   sees a Retry button (F017's `ErrorState`). Cancellations never retry.
 * - **Mutations never retry by default.** A write may not be idempotent;
 *   retrying it silently is how the same record gets created twice. A caller
 *   that knows its mutation is safe can opt in per mutation.
 *
 * **Where errors surface.** A query that fails with *nothing* rendered — a
 * cold load — is the page's business: it renders `ErrorState` with a Retry,
 * and a toast on top would say the same thing twice. A query that fails while
 * data is already on screen (a background refetch) has no visible home, so it
 * gets a toast. A failed mutation has no home of its own, so it toasts —
 * unless it opts out through `meta: { suppressErrorToast: true }`, which is
 * how F019's forms keep the form's inline error and the toast from saying the
 * same sentence twice. Cancelled requests — TanStack cancels in-flight queries
 * on unmount — are never surfaced.
 */
export const QUERY_STALE_TIME_MS = 30_000

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const apiError = toApiError(error)
  if (apiError.isCanceled) return false
  if (apiError.status !== null && apiError.status < 500) return false
  return failureCount < 1
}

function notifyError(error: unknown): void {
  const apiError = toApiError(error)
  if (apiError.isCanceled) return
  toast.error(apiError.detail)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Cold failure → the page's ErrorState owns it. Background failure
        // (data already rendered) → the toast is the only thing that can tell
        // the user the screen is now stale.
        if (query.state.data === undefined) return
        notifyError(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // A form that maps the failure onto its fields says it better; see
        // `mutationMeta` above.
        if (mutation.meta?.suppressErrorToast === true) return
        notifyError(error)
      },
    }),
  })
}

export function QueryProvider({
  children,
  client,
}: {
  children: ReactNode
  /** Tests inject their own client; the app gets one scoped instance. */
  client?: QueryClient
}) {
  const [defaultClient] = useState(createQueryClient)

  return <QueryClientProvider client={client ?? defaultClient}>{children}</QueryClientProvider>
}
