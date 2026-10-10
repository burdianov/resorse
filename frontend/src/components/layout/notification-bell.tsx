import { BellIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useAccess } from '@/components/providers/access-provider'
import { Button } from '@/components/ui/button'
import { useUnreadCount } from '@/hooks/use-notifications'
import { useAuth } from '@/lib/auth'

/**
 * The header's notification bell (F046, BP-7.7): the unread badge that keeps
 * itself current via TanStack Query polling (`useUnreadCount` re-reads every
 * ~30 s and pauses while the tab is hidden — the default
 * `refetchIntervalInBackground: false`).
 *
 * The component is **split in two on purpose**: this outer shell resolves
 * the session and the permission with plain context reads (no query hooks),
 * and only mounts the polling `UnreadBell` when there is a real, permitted
 * caller. A render without a session — an anonymous shell, a route-state
 * test with no providers — therefore reaches for no QueryClient at all; the
 * bell exists exactly when its backing data does.
 *
 * The permission check mirrors `notifications.read` (the route/profile
 * pattern, §6.3d): without it the bell is absent rather than inert — the
 * server would refuse the endpoint anyway (F031), so a disabled bell would
 * advertise an inbox that cannot load.
 */
export function NotificationBell() {
  const access = useAccess()
  const { status, user } = useAuth()

  if (status !== 'authenticated' || user === null) return null
  if (!access.isSuperuser && !access.permissions.has('notifications.read')) return null
  return <UnreadBell userId={user.id} />
}

function UnreadBell({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const { data } = useUnreadCount(userId)
  const count = data?.unread_count ?? 0

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      onClick={() => {
        void navigate('/notifications')
      }}
    >
      <BellIcon className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Button>
  )
}
