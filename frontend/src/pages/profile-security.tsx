import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { ChangePasswordForm } from './change-password'

/**
 * `/profile/security` — the voluntary password change inside the shell
 * (F042, BP-7.6). The form itself is F032's `ChangePasswordForm`, reused
 * rather than re-implemented: the forced flow and this page must accept the
 * same inputs, show the same policy guidance, and surface the same
 * field-addressable 422s, and one component is how that stays true.
 *
 * The differences from the standalone `/change-password` screen live in the
 * *wrappers*, not the form: here there is a shell (so no brand banner and no
 * "sign out instead" — the account menu is right there), and success shows a
 * toast and leaves the user on the page instead of navigating.
 */
export function ProfileSecurityPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Security"
        description="Your password and how sessions end."
        breadcrumbs={<AppBreadcrumbs />}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Change password</h2>
          </CardTitle>
          <CardDescription>
            Enter your current password, then choose a new one. Every other session of this account
            is signed out when you do; this one is renewed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
