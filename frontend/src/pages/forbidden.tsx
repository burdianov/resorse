import { Link } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'

/**
 * The route-level 403 (BIG-PROMPT §4.6, §7.4c): what a caller sees when they
 * open a route their permissions do not cover. Deliberately *distinct from the
 * anonymous redirect*: a visitor with no session belongs at `/login` (F032),
 * while a signed-in caller who lacks the permission belongs here.
 *
 * It says nothing about what lives on the page — §6.2f's "403 without data
 * leak" means the denial itself must not become an information channel.
 */
export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="403 — Not authorised"
        description="Your account does not have permission to view this page. If you believe that is a mistake, ask an administrator to review your roles."
        actions={<Button render={<Link to="/dashboard" />}>Back to dashboard</Button>}
      />
    </div>
  )
}
