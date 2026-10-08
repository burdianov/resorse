import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function Harness({ side }: { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button>Open panel</Button>} />
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the table.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

describe('Sheet', () => {
  it('is closed until the trigger is activated', () => {
    render(<Harness />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on trigger click with an accessible name', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    const sheet = screen.getByRole('dialog')
    expect(sheet).toHaveAccessibleName('Filters')
    expect(sheet).toHaveAccessibleDescription('Narrow the table.')
  })

  it('moves focus inside when it opens', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    // Focus arrives asynchronously once the popup has mounted.
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('returns focus to the trigger after closing', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open panel' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(trigger).toHaveFocus()
  })

  it.each(['top', 'right', 'bottom', 'left'] as const)('records the %s edge', async (side) => {
    render(<Harness side={side} />)

    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', side)
  })
})
