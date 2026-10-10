import { Link } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { buttonVariants } from '@/components/ui/button'

/**
 * 404 for an unknown path — the `/*` catch-all inside the shell, and the
 * landing state of a direct visit to `/404` (BIG-PROMPT §4.6). It renders
 * inside the frame on purpose: the navigation stays usable, so a mistyped URL
 * costs a click rather than a reload.
 */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="404 — Page not found"
        description="The page you asked for does not exist, or it has moved."
        actions={
          // A `Link` wearing the button's clothes rather than a `Button`
          // rendering one: base-ui's Button sets `role="button"` on anything
          // that is not a real `<button>` (F057's `nativeButton` warning), and
          // this element *navigates*, so a screen reader must hear "link". The
          // variant classes are what make it look like the button beside it —
          // the same idiom the PDF preview's Download uses.
          <Link to="/dashboard" className={buttonVariants()}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  )
}
