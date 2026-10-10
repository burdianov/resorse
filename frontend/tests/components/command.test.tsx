import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

/**
 * `onSelect` is spread conditionally rather than passed as `undefined`:
 * `exactOptionalPropertyTypes` refuses an explicit `undefined` for a callback
 * the primitive declares optional (found once `tsc` covered `tests/`).
 */
function Harness({ onSelect }: { onSelect?: () => void }) {
  return (
    <Command>
      <CommandInput placeholder="Search commands" />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem {...(onSelect ? { onSelect } : {})}>Dashboard</CommandItem>
          <CommandItem>Notifications</CommandItem>
          <CommandItem>Profile</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

describe('Command', () => {
  it('renders a searchable list of items', () => {
    render(<Harness />)

    expect(screen.getByPlaceholderText('Search commands')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('filters items as the user types', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByPlaceholderText('Search commands'), 'prof')

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Dashboard' })).toBeNull()
    })
    expect(screen.getByRole('option', { name: 'Profile' })).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByPlaceholderText('Search commands'), 'zzzz')

    expect(await screen.findByText('No results')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('activates the highlighted item with the keyboard', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const input = screen.getByPlaceholderText('Search commands')
    input.focus()

    // cmdk highlights the first match as soon as the list renders, so Enter
    // alone activates it; an ArrowDown first would move to the second item.
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('moves the highlight with the arrow keys', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const input = screen.getByPlaceholderText('Search commands')
    input.focus()

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    // Dashboard was already highlighted, so this selects Notifications — which
    // carries no handler, proving the highlight really moved.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('activates an item with the pointer', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('option', { name: 'Dashboard' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('keeps the input reachable by Tab as the only tab stop', async () => {
    render(<Harness />)

    await userEvent.tab()

    // cmdk deliberately makes the list one tab stop: arrows move within it.
    expect(screen.getByPlaceholderText('Search commands')).toHaveFocus()
  })
})
