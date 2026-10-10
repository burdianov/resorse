import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers'
import { buildAppRoutes } from '@/app/router'
import { DEV_TOOLS_FLAG } from '@/config/features'
import { ANONYMOUS_ACCESS } from '@/config/access'
import type { NavigationAccess } from '@/config/access'
import { allRoutes, visibleNavigation } from '@/config/navigation'
import type { MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * The component lab (F054) — the two mechanisms that keep it out of production,
 * and the page itself.
 *
 * The suite runs under Vite's development semantics (`import.meta.env.DEV` is
 * true), so the literal that excludes the route from a production build takes
 * its other branch here. That is not a gap in the test: the *exclusion* is a
 * build-time fact and the build is where it is checked (`pnpm run build`, then a
 * search of `dist/` — see the task's operator checks). What a test can assert is
 * the other half: that in a development build the route is registered, that its
 * link is gated on both administrative authority and the flag, and that the page
 * that comes back is the lab.
 */

const SUPERUSER: MeResponse = {
  created_at: '2026-01-02T03:04:05Z',
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  phone: null,
  is_superuser: true,
  must_change_password: false,
  roles: [],
  permissions: [],
}

/** Signed in and allowed on ordinary pages, but not an administrator. */
const VIEWER: MeResponse = {
  ...SUPERUSER,
  id: '00000000-0000-7000-8000-000000000002',
  email: 'grace@example.com',
  full_name: 'Grace Hopper',
  is_superuser: false,
  roles: ['viewer'],
  permissions: ['reports.generate', 'files.read'],
}

function access(init: {
  permissions?: readonly string[]
  isSuperuser?: boolean
  features?: readonly string[]
}): NavigationAccess {
  const resolved: NavigationAccess = {
    permissions: new Set(init.permissions ?? []),
    isSuperuser: init.isSuperuser ?? false,
  }
  return init.features ? { ...resolved, features: new Set(init.features) } : resolved
}

/**
 * jsdom implements no Web Animations, and the library's two users of
 * `getAnimations` disagree about what to do without it. `useAnimationsFinished`
 * (dialog transitions) treats an **absent** method as "nothing to wait for" and
 * continues synchronously — which dialog tests elsewhere rely on, so this stub
 * belongs here and not in `src/testing/setup.ts`, where it silently made those
 * restores asynchronous. `ScrollAreaViewport` calls it **unguarded**, on a timer
 * that fires while the page is still mounted, which is precisely what the lab
 * does — an unhandled exception rather than a failed assertion. No test in this
 * file depends on a transition's timing, so answering "no animations" is enough.
 */
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: vi.fn(() => []),
  })
})

afterEach(() => {
  delete (Element.prototype as Partial<Element>).getAnimations
})

function renderApp(initialPath: string, me: MeResponse) {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(me)),
    // The shell reads the account's preferences once per session (F048).
    http.get('/api/v1/auth/me/preferences', () => HttpResponse.json({ items: [] })),
    // The lab's files section is the only part of it that talks to the API.
    http.get('/api/v1/files', () =>
      HttpResponse.json({ items: [], total: 0, page: 1, page_size: 25 }),
    ),
  )

  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: [initialPath] })
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('the lab’s registry entry', () => {
  it('is registered in a development build, as an administrator-only route', () => {
    const route = allRoutes().find((entry) => entry.path === '/tools/components')

    expect(route).toBeDefined()
    expect(route?.adminOnly).toBe(true)
    expect(route?.featureFlag).toBe(DEV_TOOLS_FLAG)
    // Not `showInNavigation: false`: the sidebar entry is intended, and the flag
    // — not a hidden link — is what keeps it away from everyone else.
    expect(route?.showInNavigation).not.toBe(false)
  })

  it('offers the Tools link to an administrator holding the flag, and to nobody else', () => {
    const tools = (subject: NavigationAccess) =>
      visibleNavigation(subject).find((group) => group.id === 'tools')

    const administrator = tools(access({ isSuperuser: true, features: [DEV_TOOLS_FLAG] }))
    expect(administrator?.items.map((item) => item.path)).toEqual(['/tools/components'])
    expect(administrator?.items[0]?.label).toBe('Component Lab')

    // The flag says the module is off, and it applies before any authority
    // check — so it hides the link even from a superuser.
    expect(tools(access({ isSuperuser: true, features: [] }))).toBeUndefined()

    // …and the reverse: authority is required as well, so a caller with the flag
    // but no administration namespace gets nothing.
    expect(
      tools(access({ permissions: ['files.read'], features: [DEV_TOOLS_FLAG] })),
    ).toBeUndefined()
    expect(tools(ANONYMOUS_ACCESS)).toBeUndefined()
  })
})

describe('/tools/components', () => {
  it('answers with the lab page, notice and all, for an administrator', async () => {
    renderApp('/tools/components', SUPERUSER)

    // An explicit timeout: this is the app's largest lazy route (recharts is
    // behind it), and when the whole suite runs in parallel with coverage
    // instrumentation enabled, resolving that chunk has been observed to
    // outlast the 1s default — a real 1.4-1.6s wait, not a missing route. It is
    // 10 s and not more because the suite's own budget is 15 s
    // (`test.testTimeout` in vite.config.ts), so this finder is the one that
    // fails first and fails with the sentence above rather than a bare timeout.
    expect(
      await screen.findByRole('heading', { name: 'Component lab' }, { timeout: 10_000 }),
    ).toBeInTheDocument()
    // The first question a reader of this page asks is whether it ships, so the
    // answer is on the screen rather than in a comment.
    expect(screen.getByText('Development builds only.')).toBeInTheDocument()
    expect(screen.getByText(/not in the registry/)).toBeInTheDocument()

    // The lab is made of the real primitives, so the sections are the page.
    expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Charts' })).toBeInTheDocument()

    // The one section that is not a sample: it reads the API, and an empty store
    // is the empty state rather than an invented row.
    expect(await screen.findByText('No files yet')).toBeInTheDocument()
  })

  it('links the lab from the sidebar for an administrator', async () => {
    renderApp('/dashboard', SUPERUSER)

    expect(await screen.findByRole('link', { name: 'Component Lab' })).toBeInTheDocument()
  })

  it('shows no link to the lab for a caller without administrative authority', async () => {
    renderApp('/dashboard', VIEWER)

    // Wait for the session to land before deciding what is absent — otherwise
    // this passes on a shell that has rendered nothing at all.
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Component Lab' })).toBeNull()
  })
})
