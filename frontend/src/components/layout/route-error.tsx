import { isRouteErrorResponse, useRouteError } from 'react-router'

import { ErrorState } from '@/components/common/error-state'
import { ForbiddenPage } from '@/pages/forbidden'
import { NotFoundPage } from '@/pages/not-found'

/**
 * The route error boundary (BIG-PROMPT §4). Every registry route mounts it as
 * its `errorElement`, so a page that throws loses its *content* and not the
 * frame: the sidebar, header and navigation stay usable, and the retry is one
 * click away.
 *
 * Status responses map to the state pages that own that meaning; anything else
 * is the generic error state with a **Retry** (§6.2f). A crash inside the shell
 * itself falls back to the root route's boundary, which renders this same
 * component full-page.
 *
 * The default copy is the *error* flavour, not *offline*: what this boundary
 * catches is a render or loader failure, and the network flavour belongs to the
 * query layer that can actually tell the two apart (F018 wires query errors
 * into `ErrorState`).
 *
 * Nothing from the thrown error is displayed. §6.2f's "no data leak" applies to
 * error UI too: a stack trace or a raw response body can expose exactly what a
 * denied page was protecting.
 */
export function RouteError() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) return <ForbiddenPage />
    if (error.status === 404) return <NotFoundPage />
  }

  return (
    <ErrorState
      onRetry={() => {
        window.location.reload()
      }}
    />
  )
}
