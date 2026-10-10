import { Link } from 'react-router'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { LoadingState } from '@/components/common/loading-state'
import { PageHeader } from '@/components/common/page-header'
import { useAccess } from '@/components/providers/access-provider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { NavigationAccess } from '@/config/access'
import { visibleNavigation } from '@/config/navigation'
import { useUnreadCount } from '@/hooks/use-notifications'
import { useAuth } from '@/lib/auth'
import type { MeResponse } from '@/lib/generated/api'
import { toApiError } from '@/lib/errors'

/**
 * The generic home screen (F047, BIG-PROMPT §7.2). Every figure on it is read
 * from the session or the API; nothing is fabricated (§3.2b).
 *
 * - **Identity** comes from `/auth/me` (`useAuth`): name, email, roles and the
 *   effective permission union, summarised by namespace.
 * - **Unread notices** share the bell's query (`useUnreadCount`), so the badge
 *   and this number are one cache entry and one poller. The card mirrors the
 *   bell's permission rule and is absent without `notifications.read`.
 * - **Quick links** come from the navigation registry through
 *   `visibleNavigation`, so they can never offer a page the sidebar would hide.
 *   The Dashboard entry is excluded — the user is already here.
 *
 * System health and recent activity are deliberately not on this page yet
 * (F047 scope); they arrive with their own tasks.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const access = useAccess()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your account, your notices and the pages you can open."
        breadcrumbs={<AppBreadcrumbs />}
      />
      {user === null ? (
        <LoadingState label="Loading your dashboard" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <IdentityCard user={user} />
          <NoticesCard user={user} access={access} />
          <QuickLinksCard access={access} />
        </div>
      )}
    </div>
  )
}

function IdentityCard({ user }: { user: MeResponse }) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Welcome, {user.full_name}</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <section aria-labelledby="dashboard-roles-heading" className="space-y-2">
          <h3 id="dashboard-roles-heading" className="text-sm font-medium">
            Roles
          </h3>
          {user.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles are assigned to your account.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <li key={role}>
                  <Badge variant="secondary">{role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <PermissionSummary user={user} />
      </CardContent>
    </Card>
  )
}

function PermissionSummary({ user }: { user: MeResponse }) {
  if (user.is_superuser) {
    return (
      <section aria-labelledby="dashboard-permissions-heading" className="space-y-2">
        <h3 id="dashboard-permissions-heading" className="text-sm font-medium">
          Permissions
        </h3>
        <p className="text-sm text-muted-foreground">
          Super-administrator: every permission is granted to this account.
        </p>
      </section>
    )
  }

  // Count the codes per namespace (`users.read` → `users`) so the summary says
  // what the account can touch without listing every code.
  const namespaces = new Map<string, number>()
  for (const code of user.permissions) {
    const namespace = code.split('.')[0] ?? code
    namespaces.set(namespace, (namespaces.get(namespace) ?? 0) + 1)
  }
  const sorted = [...namespaces.entries()].sort(([first], [second]) => first.localeCompare(second))

  return (
    <section aria-labelledby="dashboard-permissions-heading" className="space-y-2">
      <h3 id="dashboard-permissions-heading" className="text-sm font-medium">
        Permissions
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No permissions are granted to your account.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sorted.map(([namespace, count]) => (
            <li key={namespace}>
              <Badge variant="outline">
                {namespace} ({count})
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NoticesCard({ user, access }: { user: MeResponse; access: NavigationAccess }) {
  // Same rule as the bell: without `notifications.read` there is no inbox to
  // count, so the card is absent rather than showing a number it cannot read.
  if (!access.isSuperuser && !access.permissions.has('notifications.read')) return null
  return <UnreadNotices userId={user.id} />
}

function UnreadNotices({ userId }: { userId: string }) {
  const { data, isError, error, refetch } = useUnreadCount(userId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Unread notifications</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          isError ? (
            <ErrorState
              variant={toApiError(error).isNetworkError ? 'offline' : 'error'}
              onRetry={() => {
                void refetch()
              }}
            />
          ) : (
            <LoadingState label="Counting unread notifications" />
          )
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-3xl font-semibold tabular-nums">{data.unread_count}</p>
            <Link
              to="/notifications"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open notifications
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuickLinksCard({ access }: { access: NavigationAccess }) {
  const groups = visibleNavigation(access)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== 'dashboard'),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Quick links</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <EmptyState
            title="No other pages are open to your account"
            description="Pages appear here as your permissions allow."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={`quick-links-${group.id}`} className="space-y-2">
                <h3 id={`quick-links-${group.id}`} className="text-sm font-medium text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.path}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          {Icon ? <Icon aria-hidden className="size-4" /> : null}
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
