import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import type { MeResponse, NotificationItem } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `/notifications` and the header bell (F046) — the acceptance's "UI state
 * tests", run through the real route table, providers and `api.ts` with MSW
 * standing in for the network.
 *
 * What the file pins: the list renders only what the API sent (relative
 * timestamps included), the unread pill and the card accent, the empty and
 * loading states, the filter as a **server parameter**, every mutation's
 * shape (mark-one, mark-all, delete-one after its exit animation, clear-all
 * behind its confirmation — §7.7), the link as an in-app navigation, the
 * bell's badge, its ~30 s polling, and the permission mirror: without
 * `notifications.read` there is no bell and the route answers 403.
 *
 * The MSW handlers are **stateful**: a mutation endpoint edits the fixture
 * list the way the server would, so the post-write invalidation ("server
 * truth wins") re-reads a consistent world instead of flipping the optimistic
 * edit back — the flakiness that a stateless mock would hide.
 */

configure({ asyncUtilTimeout: 3000 })

const USER_ID = '00000000-0000-7000-8000-000000000009'

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: USER_ID,
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    phone: null,
    is_superuser: false,
    must_change_password: false,
    created_at: '2026-10-01T08:00:00Z',
    roles: ['viewer'],
    permissions: ['notifications.read', 'notifications.manage_own'],
    ...overrides,
  }
}

let nextId = 1
function notification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  const id = overrides.id ?? `40000000-0000-7000-8000-00000000000${nextId++}`
  return {
    id,
    title: `Notice ${id.slice(-1)}`,
    message: 'Something you should know about.',
    link: null,
    is_read: false,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  }
}

interface Captured {
  listParams: URLSearchParams[]
  marked: string[]
  readAll: number
  deleted: string[]
  cleared: number
  unreadCountCalls: number
}

interface InboxFixture {
  items: NotificationItem[]
  captured: Captured
}

/**
 * A stateful stand-in for F045's endpoints: the mutation routes edit `items`
 * exactly as the server would, so a later refetch tells the truth.
 */
function inboxHandlers(
  initial: NotificationItem[],
  options: { meUser?: MeResponse } = {},
): InboxFixture {
  const items = [...initial]
  const captured: Captured = {
    listParams: [],
    marked: [],
    readAll: 0,
    deleted: [],
    cleared: 0,
    unreadCountCalls: 0,
  }
  const unread = () => items.filter((item) => !item.is_read).length

  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(options.meUser ?? me())),
    // The shell reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/notifications/unread-count', () => {
      captured.unreadCountCalls += 1
      return HttpResponse.json({ unread_count: unread() })
    }),
    http.get('/api/v1/notifications', ({ request }) => {
      const params = new URL(request.url).searchParams
      captured.listParams.push(params)
      const filter = params.get('is_read')
      const matching =
        filter === null ? items : items.filter((item) => String(item.is_read) === filter)
      const page = Number(params.get('page') ?? '1')
      const pageSize = Number(params.get('page_size') ?? '25')
      return HttpResponse.json({
        items: matching.slice((page - 1) * pageSize, page * pageSize),
        total: matching.length,
        unread_count: unread(),
        page,
        page_size: pageSize,
      })
    }),
    http.post('/api/v1/notifications/:notificationId/read', ({ params }) => {
      const id = String(params.notificationId)
      captured.marked.push(id)
      const item = items.find((candidate) => candidate.id === id)
      if (!item) return HttpResponse.json({ detail: 'Notification not found.' }, { status: 404 })
      item.is_read = true
      return HttpResponse.json(item)
    }),
    http.post('/api/v1/notifications/read-all', () => {
      captured.readAll += 1
      for (const item of items) item.is_read = true
      return HttpResponse.json({ updated: items.length })
    }),
    http.delete('/api/v1/notifications/:notificationId', ({ params }) => {
      const id = String(params.notificationId)
      captured.deleted.push(id)
      const index = items.findIndex((candidate) => candidate.id === id)
      if (index === -1) return new HttpResponse(null, { status: 404 })
      items.splice(index, 1)
      return new HttpResponse(null, { status: 204 })
    }),
    http.delete('/api/v1/notifications', () => {
      captured.cleared += 1
      const removed = items.length
      items.length = 0
      return HttpResponse.json({ deleted: removed })
    }),
  )
  return { items, captured }
}

function renderApp(initialPath: string) {
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: [initialPath] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

function cardFor(title: string): HTMLElement {
  const card = screen.getByText(title).closest('[data-slot="card"]')
  if (card === null) throw new Error(`no card for ${title}`)
  return card as HTMLElement
}

async function waitForInbox(): Promise<void> {
  await screen.findByRole('heading', { name: /Notifications/ })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the inbox list', () => {
  it('renders what the API sent: pill, unread accent, read styling, relative time', async () => {
    const unread = notification({ title: 'Your password was reset', message: 'Choose a new one.' })
    const read = notification({ title: 'Welcome', is_read: true })
    inboxHandlers([unread, read])
    renderApp('/notifications')
    await waitForInbox()

    expect(await screen.findByText('Your password was reset')).toBeInTheDocument()
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('1 unread')).toBeInTheDocument()

    // The accent is the unread marker; a read notice has none.
    expect(cardFor('Your password was reset')).toHaveAttribute('data-unread', 'true')
    expect(cardFor('Welcome')).not.toHaveAttribute('data-unread')

    // Relative timestamps, computed from `created_at` (5 minutes ago) —
    // both rows carry the same fixture instant.
    expect(screen.getAllByText('5 minutes ago')).toHaveLength(2)

    // No fabricated content: exactly the two API rows are rendered (scoped
    // to the feed — the sidebar is a list too).
    const feed = screen.getByRole('list', { name: 'Notifications' })
    expect(within(feed).getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows the empty state and hides the bulk controls when there is nothing', async () => {
    inboxHandlers([])
    renderApp('/notifications')
    await waitForInbox()

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Clear all/ })).toBeNull()
  })

  it('sends the read/unread filter as a server parameter', async () => {
    const { captured } = inboxHandlers([notification({ is_read: true })])
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText(/Notice/)

    // The initial ("All") request carries no filter.
    expect(captured.listParams[0]?.get('is_read')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Unread' }))
    await waitFor(() => {
      expect(captured.listParams.at(-1)?.get('is_read')).toBe('false')
    })
    // The filtered-empty copy is honest about which filter is empty.
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()

    // Back to All: the cached page returns (no new request needed — within
    // the stale window the answer is already known).
    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(await screen.findByText(/Notice/)).toBeInTheDocument()
  })
})

describe('the mutations', () => {
  it('marks one read on click — the pill and the accent follow', async () => {
    const item = notification({ title: 'Reset your password' })
    const { captured } = inboxHandlers([item])
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('Reset your password')

    // The card body is the control (a button when there is no link); the
    // anchored name keeps the delete button (`Delete notification: …`) out.
    await userEvent.click(screen.getByRole('button', { name: /^Reset your password/ }))

    await waitFor(() => {
      expect(captured.marked).toEqual([item.id])
    })
    await waitFor(() => {
      expect(cardFor('Reset your password')).not.toHaveAttribute('data-unread')
    })
    expect(screen.queryByText('1 unread')).toBeNull()
  })

  it('a failed mark-read rolls back — the card stays unread', async () => {
    const item = notification({ title: 'Reset your password' })
    inboxHandlers([item])
    server.use(
      http.post('/api/v1/notifications/:notificationId/read', () =>
        HttpResponse.json({ detail: 'Server exploded.' }, { status: 500 }),
      ),
    )
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('Reset your password')

    await userEvent.click(screen.getByRole('button', { name: /^Reset your password/ }))

    // The optimistic flip is undone (and/or the refetch tells the truth —
    // either way the screen never shows a write that did not happen).
    await waitFor(() => {
      expect(cardFor('Reset your password')).toHaveAttribute('data-unread', 'true')
    })
    expect(screen.getByText('1 unread')).toBeInTheDocument()
  })

  it('marks all read with one request and zeroes the pill', async () => {
    const first = notification({ title: 'First notice' })
    const second = notification({ title: 'Second notice' })
    const { captured } = inboxHandlers([first, second])
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('First notice')

    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

    await waitFor(() => {
      expect(captured.readAll).toBe(1)
    })
    await waitFor(() => {
      expect(cardFor('First notice')).not.toHaveAttribute('data-unread')
      expect(cardFor('Second notice')).not.toHaveAttribute('data-unread')
    })
    expect(screen.queryByText('2 unread')).toBeNull()
  })

  it('deletes one after its exit animation', async () => {
    const kept = notification({ title: 'Keep me' })
    const doomed = notification({ title: 'Delete me' })
    const { captured } = inboxHandlers([kept, doomed])
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('Delete me')

    await userEvent.click(screen.getByRole('button', { name: 'Delete notification: Delete me' }))

    await waitFor(() => {
      expect(captured.deleted).toEqual([doomed.id])
    })
    await waitFor(() => {
      expect(screen.queryByText('Delete me')).toBeNull()
    })
    expect(screen.getByText('Keep me')).toBeInTheDocument()
  })

  it('a failed delete restores the card', async () => {
    const item = notification({ title: 'Delete me' })
    inboxHandlers([item])
    server.use(
      http.delete('/api/v1/notifications/:notificationId', () =>
        HttpResponse.json({ detail: 'Server exploded.' }, { status: 500 }),
      ),
    )
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('Delete me')

    await userEvent.click(screen.getByRole('button', { name: 'Delete notification: Delete me' }))

    await waitFor(() => {
      expect(screen.getByText('Delete me')).toBeInTheDocument()
    })
  })

  it('clears all only after the confirmation, and then the empty state shows', async () => {
    const { captured } = inboxHandlers([
      notification({ title: 'One' }),
      notification({ title: 'Two' }),
    ])
    renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('One')

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Clear all notifications?')).toBeInTheDocument()

    // Backing out changes nothing.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(captured.cleared).toBe(0)
    expect(screen.getByText('One')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    const again = await screen.findByRole('dialog')
    await userEvent.click(within(again).getByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(captured.cleared).toBe(1)
    })
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })
})

describe('links and the bell', () => {
  it("follows a notice's stored link as an in-app navigation, marking it read", async () => {
    const item = notification({ title: 'Your password was reset', link: '/profile' })
    const { captured } = inboxHandlers([item])
    const router = renderApp('/notifications')
    await waitForInbox()
    await screen.findByText('Your password was reset')

    await userEvent.click(screen.getByRole('link', { name: /^Your password was reset/ }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/profile')
    })
    expect(captured.marked).toEqual([item.id])
  })

  it('the bell badges the unread count and opens the inbox', async () => {
    inboxHandlers([notification(), notification(), notification()])
    renderApp('/dashboard')

    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    expect(within(bell).getByText('3')).toBeInTheDocument()

    await userEvent.click(bell)
    expect(await screen.findByRole('heading', { name: /Notifications/ })).toBeInTheDocument()
  })

  it('polls the unread count every ~30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const item = notification()
    const { captured } = inboxHandlers([item])
    renderApp('/dashboard')

    await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    const callsBefore = captured.unreadCountCalls

    item.is_read = true
    await vi.advanceTimersByTimeAsync(30_000)

    await waitFor(() => {
      expect(captured.unreadCountCalls).toBeGreaterThan(callsBefore)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    })
  })

  it('hides the bell and answers the route with 403 without notifications.read', async () => {
    const { captured } = inboxHandlers([], {
      meUser: me({ permissions: ['reports.generate'] }),
    })
    renderApp('/dashboard')

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull()
    expect(captured.unreadCountCalls).toBe(0)

    // A fresh mount: the route answers the denial itself.
    cleanup()
    const router = renderApp('/notifications')
    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notifications')
  })
})
