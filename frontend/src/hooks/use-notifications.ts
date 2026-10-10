import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { NotificationFilter } from '@/lib/query-keys'
import type {
  ClearAllResponse,
  MarkAllReadResponse,
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
} from '@/lib/generated/api'

/**
 * The inbox's data layer (F046) — one module so the header bell and the
 * `/notifications` page consume the **same** cache entries (C35): the unread
 * number is one `unreadCount` query key read by both, and the list is one
 * key per filter. A second reader with its own key is how a badge and a pill
 * start disagreeing.
 *
 * **Polling** (BP-7.7): the unread count refetches every ~30 s. TanStack's
 * `refetchIntervalInBackground` defaults to `false`, so the poll pauses while
 * the tab is hidden — "~30 s while someone is looking", not a hidden-tab
 * hammer, without any extra machinery.
 *
 * **Optimistic writes with rollback**: every mutation snapshots the cached
 * list and count, applies the edit immediately (`onMutate`), restores the
 * snapshot on failure (`onError`) and re-syncs with the server's truth when
 * it settles (`onSettled`) — a failure is a toast from the query layer plus
 * the screen returning to what the server actually holds, never a lost edit
 * shown as applied.
 */

/** The bell's cadence (BP-7.7's "~30 s"); exported so tests can name it. */
export const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000

/** One feed page; F045's list default, kept as one number. */
export const NOTIFICATIONS_PAGE_SIZE = 25

/** The infinite list's cache shape: F045's list response, page by page. */
export type NotificationPages = InfiniteData<NotificationListResponse, number>

/** The bell's badge and the page's pill — the one unread-count query. */
export function useUnreadCount(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(userId),
    queryFn: () => api.get<UnreadCountResponse>('/api/v1/notifications/unread-count'),
    enabled,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
  })
}

/**
 * The inbox feed, newest first, accumulating pages via "Show more" (the
 * server paginates; the page must be able to reach every notice). The filter
 * is a **request parameter** — the server applies it in SQL (C35), because a
 * client-side filter over a server page would silently lie about `total`.
 */
export function useNotificationList(userId: string, filter: NotificationFilter) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(userId, filter),
    queryFn: ({ pageParam }) =>
      api.get<NotificationListResponse>('/api/v1/notifications', {
        params: {
          page: pageParam,
          page_size: NOTIFICATIONS_PAGE_SIZE,
          ...(filter === 'all' ? {} : { is_read: filter === 'read' }),
        },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })
}

interface InboxSnapshot {
  list: NotificationPages | undefined
  count: UnreadCountResponse | undefined
}

/** The four inbox mutations, sharing one snapshot/restore mechanism. */
export function useNotificationMutations(userId: string, filter: NotificationFilter) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.notifications.list(userId, filter)
  const countKey = queryKeys.notifications.unreadCount(userId)
  const rootKey = queryKeys.notifications.root(userId)

  const snapshot = async (): Promise<InboxSnapshot> => {
    // A refetch landing mid-edit would overwrite the optimistic state with
    // pre-edit rows; cancel first, restore/refetch at settle.
    await queryClient.cancelQueries({ queryKey: listKey })
    await queryClient.cancelQueries({ queryKey: countKey })
    return {
      list: queryClient.getQueryData<NotificationPages>(listKey),
      count: queryClient.getQueryData<UnreadCountResponse>(countKey),
    }
  }

  const restore = (context: InboxSnapshot | undefined): void => {
    if (context?.list !== undefined) queryClient.setQueryData(listKey, context.list)
    if (context?.count !== undefined) queryClient.setQueryData(countKey, context.count)
  }

  const settle = (): void => {
    // Server truth wins once the write lands (or is rolled back): every
    // filter's list and the count re-read together.
    void queryClient.invalidateQueries({ queryKey: rootKey })
  }

  /** Rewrites the cached pages; `null` from `edit` removes the row (its
   * reason — deleted, or no longer matching the active filter). */
  const editPages = (edit: (item: NotificationItem) => NotificationItem | null): void => {
    queryClient.setQueryData<NotificationPages>(listKey, (data) => {
      if (data === undefined) return data
      let removed = 0
      const pages = data.pages.map((page) => ({
        ...page,
        items: page.items.map(edit).filter((item): item is NotificationItem => {
          if (item === null) {
            removed += 1
            return false
          }
          return true
        }),
      }))
      return {
        ...data,
        pages: pages.map((page) => ({
          ...page,
          total: Math.max(0, page.total - removed),
        })),
      }
    })
  }

  const setCount = (next: (current: number) => number): void => {
    queryClient.setQueryData<UnreadCountResponse>(countKey, (current) =>
      current === undefined ? current : { ...current, unread_count: next(current.unread_count) },
    )
  }

  const find = (context: InboxSnapshot, id: string): NotificationItem | undefined =>
    context.list?.pages.flatMap((page) => page.items).find((item) => item.id === id)

  const markOne = useMutation({
    mutationFn: (notificationId: string) =>
      api.post<NotificationItem>(`/api/v1/notifications/${notificationId}/read`),
    onMutate: async (notificationId) => {
      const context = await snapshot()
      const wasUnread = find(context, notificationId)?.is_read === false
      editPages((item) =>
        item.id === notificationId
          ? filter === 'unread'
            ? null // it no longer matches the filter it was shown under
            : { ...item, is_read: true }
          : item,
      )
      if (wasUnread) setCount((current) => Math.max(0, current - 1))
      return context
    },
    onError: (_error, _id, context) => {
      restore(context)
    },
    onSettled: settle,
  })

  const markAll = useMutation({
    mutationFn: () => api.post<MarkAllReadResponse>('/api/v1/notifications/read-all'),
    onMutate: async () => {
      const context = await snapshot()
      editPages((item) => (filter === 'unread' ? null : { ...item, is_read: true }))
      setCount(() => 0)
      return context
    },
    onError: (_error, _variables, context) => {
      restore(context)
    },
    onSettled: settle,
  })

  const deleteOne = useMutation({
    mutationFn: (notificationId: string) => api.delete(`/api/v1/notifications/${notificationId}`),
    onMutate: async (notificationId) => {
      const context = await snapshot()
      const wasUnread = find(context, notificationId)?.is_read === false
      editPages((item) => (item.id === notificationId ? null : item))
      if (wasUnread) setCount((current) => Math.max(0, current - 1))
      return context
    },
    onError: (_error, _id, context) => {
      restore(context)
    },
    onSettled: settle,
  })

  const clearAll = useMutation({
    mutationFn: () => api.delete<ClearAllResponse>('/api/v1/notifications'),
    onMutate: async () => {
      const context = await snapshot()
      queryClient.setQueryData<NotificationPages>(listKey, (data) => {
        const first = data?.pages[0]
        if (data === undefined || first === undefined) return data
        return { ...data, pages: [{ ...first, items: [], total: 0 }] }
      })
      setCount(() => 0)
      return context
    },
    onError: (_error, _variables, context) => {
      restore(context)
    },
    onSettled: settle,
  })

  return { markOne, markAll, deleteOne, clearAll }
}
