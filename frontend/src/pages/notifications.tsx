import { useState } from 'react'
import { Link } from 'react-router'
import { BellIcon, Trash2Icon, XIcon } from 'lucide-react'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { LoadingState } from '@/components/common/loading-state'
import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useNotificationList,
  useNotificationMutations,
  useUnreadCount,
} from '@/hooks/use-notifications'
import { useAuth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { formatRelativeTime } from '@/lib/format-date'
import type { NotificationFilter } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@/lib/generated/api'

/**
 * `/notifications` — the inbox (F046, BP-7.7). The source's list pattern,
 * ported: a narrow centered column of cards, the unread count as a pill
 * beside the title, mark-all and the confirmed clear-all at the upper right,
 * relative timestamps, a per-item delete with a exit animation, and an
 * unread-tinted left accent on every notice that still needs attention.
 *
 * The three behavioural claims behind the visuals:
 *
 * - **Current-user only, always.** The list, the count, every mutation: F045
 *   scopes them in SQL to the session's user; the frontend passes no user id
 *   anywhere (the hooks derive it from the session) — isolation is not this
 *   screen's job to remember.
 * - **Optimistic with rollback.** A click flips the card (or removes it)
 *   immediately; a failed write restores the snapshot and the query layer
 *   toasts — see `use-notifications.ts`. "No fabricated notifications" cuts
 *   the same way: every card, count and timestamp comes from the API.
 * - **The filter is the server's.** All/Unread/Read is a request parameter
 *   (C35): the page and its `total` are filtered in SQL, while the pill
 *   stays the account's overall unread count — the number the bell means.
 *
 * A notice's `link` is an internal path the backend validated twice (F045),
 * so it goes through the router — an in-app navigation by construction,
 * never a raw anchor that could leave the app.
 */

/** How long a card animates out before its request fires (BP-7.7's subtle exit). */
const EXIT_ANIMATION_MS = 200

const EMPTY_COPY: Record<NotificationFilter, { title: string; description: string }> = {
  all: {
    title: 'No notifications yet',
    description: 'Messages about your account will appear here.',
  },
  unread: { title: "You're all caught up.", description: 'No unread notifications.' },
  read: { title: 'Nothing read yet.', description: 'Notifications you read will be listed here.' },
}

const FILTERS: readonly { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
]

interface NotificationCardProps {
  notification: NotificationItem
  /** Mid-exit (per-item delete or a clear-all): visibly collapsing. */
  exiting: boolean
  onOpen: () => void
  onDelete: () => void
}

function NotificationCard({ notification, exiting, onOpen, onDelete }: NotificationCardProps) {
  const unread = !notification.is_read

  const body = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>
          {notification.title}
        </p>
        <p className="text-sm text-muted-foreground">{notification.message}</p>
      </div>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        {formatRelativeTime(notification.created_at)}
      </span>
    </>
  )

  const mainClasses = 'flex flex-1 items-start gap-3 text-left'

  return (
    // The grid-rows collapse is the exit animation: 1fr → 0fr animates the
    // real height, so cards close the gap as they fade instead of jumping.
    <li
      className={cn(
        'grid transition-all duration-200 ease-out',
        exiting ? 'translate-x-2 grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-2">
          <Card
            data-unread={unread ? 'true' : undefined}
            className={cn(
              'group flex-row items-start gap-3 py-3',
              unread && 'border-l-2 border-l-primary bg-primary/5',
            )}
          >
            {notification.link !== null ? (
              // The stored link is a validated internal path (F045); the
              // router owns the navigation, so it can only go in-app.
              <Link to={notification.link} className={mainClasses} onClick={onOpen}>
                {body}
              </Link>
            ) : unread ? (
              <button type="button" className={mainClasses} onClick={onOpen}>
                {body}
              </button>
            ) : (
              <div className={mainClasses}>{body}</div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Delete notification: ${notification.title}`}
              onClick={onDelete}
            >
              <XIcon className="size-4" />
            </Button>
          </Card>
        </div>
      </div>
    </li>
  )
}

export function NotificationsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 'anonymous'

  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [exiting, setExiting] = useState<ReadonlySet<string>>(new Set())
  const [clearing, setClearing] = useState(false)

  const listQuery = useNotificationList(userId, filter)
  const unreadQuery = useUnreadCount(userId)
  const { markOne, markAll, deleteOne, clearAll } = useNotificationMutations(userId, filter)

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? []
  const unreadCount = unreadQuery.data?.unread_count ?? 0

  const handleOpen = (notification: NotificationItem): void => {
    if (!notification.is_read) markOne.mutate(notification.id)
  }

  const requestDelete = (notificationId: string): void => {
    setExiting((previous) => new Set(previous).add(notificationId))
    window.setTimeout(() => {
      deleteOne.mutate(notificationId)
      // The optimistic edit has already removed the row; drop the flag so a
      // rollback restores a card that is not stuck mid-exit.
      setExiting((previous) => {
        const next = new Set(previous)
        next.delete(notificationId)
        return next
      })
    }, EXIT_ANIMATION_MS)
  }

  const requestClearAll = (): void => {
    setClearing(true)
    window.setTimeout(() => {
      clearAll.mutate(undefined, { onSettled: () => setClearing(false) })
    }, EXIT_ANIMATION_MS)
  }

  const header = (
    <PageHeader
      title={
        <span className="flex items-center gap-3">
          Notifications
          {unreadCount > 0 ? <Badge variant="secondary">{unreadCount} unread</Badge> : null}
        </span>
      }
      description="Everything addressed to you, newest first."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <>
          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
              Mark all as read
            </Button>
          ) : null}
          {items.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingClear(true)}
            >
              <Trash2Icon />
              Clear all
            </Button>
          ) : null}
        </>
      }
    />
  )

  if (listQuery.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <LoadingState label="Loading notifications" />
      </div>
    )
  }

  if (listQuery.isError && listQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(listQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void listQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {header}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilter)}>
        <TabsList aria-label="Filter notifications">
          {FILTERS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <EmptyState icon={BellIcon} {...EMPTY_COPY[filter]} />
      ) : (
        <ul aria-label="Notifications">
          {items.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              exiting={clearing || exiting.has(notification.id)}
              onOpen={() => handleOpen(notification)}
              onDelete={() => requestDelete(notification.id)}
            />
          ))}
        </ul>
      )}

      {listQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={listQuery.isFetchingNextPage}
            onClick={() => {
              void listQuery.fetchNextPage()
            }}
          >
            Show more
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={setConfirmingClear}
        title="Clear all notifications?"
        description="This permanently deletes every notification in your inbox, read or unread. It cannot be undone."
        confirmLabel="Clear all"
        destructive
        onConfirm={requestClearAll}
      />
    </div>
  )
}
