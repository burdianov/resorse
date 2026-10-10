import { Link } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'

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
        actions={<Button render={<Link to="/dashboard" />}>Back to dashboard</Button>}
      />
    </div>
  )
}
