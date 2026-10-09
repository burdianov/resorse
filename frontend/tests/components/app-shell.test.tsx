import { lazy } from 'react'
import type { ComponentType } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/components/layout/app-shell'
import { SIDEBAR_STORAGE_KEY } from '@/components/layout/sidebar-preferences'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { buildRouteObjects } from '@/config/navigation'

/**
 * The F015 acceptance ("three responsive widths work") in jsdom, plus F016's
 * wiring of the shell to the shared navigation registry:
 *
 * - width is read from `window.innerWidth`, which jsdom lets us set;
 * - CSS is not applied here (`css: false` in vite.config.ts), so the layout
 *   *decision* is asserted (which variant renders, which data-state is set,
 *   which CSS variables the shell publishes) rather than pixels;
 * - what CSS hides in a browser is irrelevant to the mobile case: below 768px
 *   the pinned sidebar is not mounted at all, it becomes the off-canvas Sheet;
 * - the route children come from `buildRouteObjects()`, i.e. the real registry —
 *   so these tests exercise the same definition the sidebar and palette read.
 */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function renderShell(initialPath = '/dashboard') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [...buildRouteObjects(), { path: 'other', element: <p>other page</p> }],
      },
    ],
    { initialEntries: [initialPath] },
  )
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

function pinnedSidebar(container: HTMLElement): HTMLElement {
  const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]')
  if (!sidebar) throw new Error('no pinned sidebar in the document')
  return sidebar
}

afterEach(() => {
  setViewportWidth(1024)
  window.localStorage.clear()
})

describe('AppShell layout', () => {
  it('renders the pinned sidebar with source geometry and the 64px header on desktop', async () => {
    setViewportWidth(1280)
    const { container } = renderShell()

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sidebar"][data-state]')).not.toBeNull()
    })

    // 260px expanded / 64px rail, published as CSS variables on the wrapper
    // (BIG-PROMPT §1.2). These are the values the rail and drawer are laid out
    // from, so asserting them here is asserting the geometry.
    const wrapper = container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')
    expect(wrapper?.style.getPropertyValue('--sidebar-width')).toBe('260px')
    expect(wrapper?.style.getPropertyValue('--sidebar-width-icon')).toBe('64px')

    expect(pinnedSidebar(container)).toHaveAttribute('data-state', 'expanded')
    expect(container.querySelector('header')).toHaveClass('h-16')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('collapses to the rail on first load at tablet width', async () => {
    setViewportWidth(900)
    const { container } = renderShell()

    await waitFor(() => {
      expect(pinnedSidebar(container)).toHaveAttribute('data-state', 'collapsed')
    })
    expect(pinnedSidebar(container)).toHaveAttribute('data-collapsible', 'icon')
  })

  it('lets a stored preference win over the viewport default', async () => {
    setViewportWidth(1280)
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed')
    const { container } = renderShell()

    await waitFor(() => {
      expect(pinnedSidebar(container)).toHaveAttribute('data-state', 'collapsed')
    })
  })

  it('expands at desktop width when no preference is stored', async () => {
    setViewportWidth(1280)
    renderShell()
    expect(await screen.findByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('persists the edge chevron toggle', async () => {
    setViewportWidth(1280)
    const { container } = renderShell()

    await userEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }))

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed')
    await waitFor(() => {
      expect(pinnedSidebar(container)).toHaveAttribute('data-state', 'collapsed')
    })
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })

  it('toggles the sidebar with Ctrl+B and persists it', async () => {
    setViewportWidth(1280)
    renderShell()
    await screen.findByRole('link', { name: 'Dashboard' })

    await userEvent.keyboard('{Control>}b{/Control}')

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed')
  })

  it('marks the active route with aria-current and the active state attribute', async () => {
    setViewportWidth(1280)
    const { container } = renderShell()

    const link = await screen.findByRole('link', { name: 'Dashboard' })
    expect(link).toHaveAttribute('aria-current', 'page')
    // The rail/tooltip/scroll logic keys off this attribute pair.
    expect(link).toHaveAttribute('data-sidebar', 'menu-button')
    expect(link).toHaveAttribute('data-active')

    // The active row is scrolled into view on navigation (BIG-PROMPT §4.9).
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('shows the label as a tooltip in the collapsed rail only', async () => {
    setViewportWidth(900) // first load collapses to the rail
    renderShell()

    const link = await screen.findByRole('link', { name: 'Dashboard' })
    await userEvent.hover(link)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Dashboard')
  })

  it('keeps the tooltip out of the accessibility tree while expanded', async () => {
    setViewportWidth(1280) // expanded
    renderShell()

    const link = await screen.findByRole('link', { name: 'Dashboard' })
    await userEvent.hover(link)

    // Not asserted as "no popup element exists": the primitive renders it with
    // the `hidden` attribute when expanded. What matters is that assistive
    // technology does not see it (role queries exclude hidden elements).
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('renders a pending state while a registry page chunk loads', async () => {
    setViewportWidth(1280)
    const Never = lazy(() => new Promise<{ default: ComponentType }>(() => {}))
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell />,
          children: [{ path: 'slow', element: <Never /> }],
        },
      ],
      { initialEntries: ['/slow'] },
    )
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    )

    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeInTheDocument()
  })
})

describe('AppShell command palette', () => {
  it('opens the palette from the header search trigger and restores focus on Escape', async () => {
    setViewportWidth(1280)
    renderShell()

    const trigger = await screen.findByRole('button', { name: /search anything/i })
    await userEvent.click(trigger)

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dashboard' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(trigger).toHaveFocus()
  })

  it('opens with Ctrl+K, navigates on selection, and shares the sidebar’s filtered registry', async () => {
    setViewportWidth(1280)
    renderShell('/other')
    await screen.findByText('other page')

    await userEvent.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog', { name: 'Command palette' })

    // The registry holds one real route (Dashboard → /dashboard); an anonymous
    // caller sees exactly that in both surfaces — none of the administration
    // entries exist as pages yet, so none may be listed (§1.2: no dead links).
    expect(screen.getByRole('option', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Users' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()

    // cmdk highlights the first match immediately, so Enter activates it.
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('AppShell mobile drawer', () => {
  it('moves navigation into an off-canvas drawer below 768px', async () => {
    setViewportWidth(500)
    renderShell()

    const hamburger = await screen.findByRole('button', { name: 'Open navigation' })
    // Closed: the pinned sidebar is not merely CSS-hidden, it is not rendered.
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()

    await userEvent.click(hamburger)

    const drawer = await screen.findByRole('dialog', { name: 'Sidebar' })
    expect(within(drawer).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()

    // Focus management: Escape closes and returns focus to the trigger.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(hamburger).toHaveFocus()
  })

  it('toggles the drawer from the keyboard shortcut on mobile', async () => {
    setViewportWidth(500)
    renderShell()
    await screen.findByRole('button', { name: 'Open navigation' })

    await userEvent.keyboard('{Control>}b{/Control}')

    expect(await screen.findByRole('dialog', { name: 'Sidebar' })).toBeInTheDocument()
    // The mobile drawer state is not a persisted preference.
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull()
  })
})
