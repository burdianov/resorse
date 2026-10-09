import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Activity, Users } from 'lucide-react'

import { CommandPalette } from '@/components/layout/command-palette'
import type { NavGroupView } from '@/config/navigation'

/**
 * The Ctrl/Cmd+K palette (BIG-PROMPT §4.10, §1.2).
 *
 * It receives groups that are already permission-filtered — that filtering is
 * `visibleNavigation`'s, tested in navigation.test.ts, and sharing the *same*
 * value with the sidebar is what §4.10 demands. These tests cover what the
 * palette itself owns: the keyboard contract, filtering, empty state and
 * navigation.
 */
const GROUPS: NavGroupView[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ id: 'status', label: 'Status', path: '/', icon: Activity }],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [{ id: 'users', label: 'Users', path: '/admin/users', icon: Users }],
  },
]

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPalette(initialOpen = true) {
  function Route() {
    const [open, setOpen] = useState(initialOpen)
    return (
      <>
        <CommandPalette open={open} onOpenChange={setOpen} groups={GROUPS} />
        <LocationProbe />
      </>
    )
  }

  const router = createMemoryRouter([{ path: '*', element: <Route /> }], {
    initialEntries: ['/current'],
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('CommandPalette', () => {
  it('renders nothing until opened', () => {
    renderPalette(false)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the groups and their pages when open', async () => {
    renderPalette()

    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Users' })).toBeInTheDocument()
  })

  it('opens and closes with Ctrl+K', async () => {
    renderPalette(false)

    await userEvent.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()

    await userEvent.keyboard('{Control>}k{/Control}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('filters as the user types and shows an honest empty state', async () => {
    renderPalette()

    await userEvent.type(await screen.findByPlaceholderText('Search pages...'), 'user')
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Status' })).toBeNull()
    })
    expect(screen.getByRole('option', { name: 'Users' })).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Search pages...'), 'zzz')
    expect(await screen.findByText('No matching page.')).toBeInTheDocument()
  })

  it('navigates on selection and closes (Enter activates the highlighted entry)', async () => {
    const router = renderPalette()

    // The dialog moves focus to the input asynchronously; cmdk then highlights
    // the first match immediately, so Enter alone activates it (F014 finding).
    const input = await screen.findByPlaceholderText('Search pages...')
    input.focus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    function TriggerHarness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Search anything
          </button>
          <CommandPalette open={open} onOpenChange={setOpen} groups={GROUPS} />
        </>
      )
    }
    const router = createMemoryRouter([{ path: '*', element: <TriggerHarness /> }], {
      initialEntries: ['/'],
    })
    render(<RouterProvider router={router} />)

    const trigger = screen.getByRole('button', { name: 'Search anything' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Command palette' })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(trigger).toHaveFocus()
  })
})
