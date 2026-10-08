import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function Harness({ onSelect }: { onSelect?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button>Actions</Button>} />
      <DropdownMenuContent>
        {/* Base UI's GroupLabel requires a Group ancestor — a label directly
            inside the content throws "MenuGroupContext is missing". */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Manage</DropdownMenuLabel>
          {/* Base UI's MenuItem fires onClick; `onSelect` is the Radix API. */}
          <DropdownMenuItem onClick={onSelect}>Edit</DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>Delete</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('DropdownMenu', () => {
  it('is closed until the trigger is activated', () => {
    render(<Harness />)

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens on trigger click and lists its items', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument()
  })

  it('moves focus into the menu when it opens', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))

    await waitFor(() => {
      expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true)
    })
  })

  it('navigates items with the arrow keys', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await screen.findByRole('menu')

    await userEvent.keyboard('{ArrowDown}')
    const first = document.activeElement
    await userEvent.keyboard('{ArrowDown}')
    const second = document.activeElement

    expect(first).not.toBe(second)
    expect(screen.getByRole('menu').contains(second)).toBe(true)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    await userEvent.click(trigger)
    await screen.findByRole('menu')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
    expect(trigger).toHaveFocus()
  })

  it('selects an item, fires its handler and closes', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('does not select a disabled item', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await screen.findByRole('menu')

    const disabled = screen.getByRole('menuitem', { name: 'Delete' })
    expect(disabled).toHaveAttribute('data-disabled')

    await userEvent.click(disabled)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
