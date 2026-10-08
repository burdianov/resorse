import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

function Harness() {
  return (
    <Popover>
      <PopoverTrigger render={<Button>Filters</Button>} />
      <PopoverContent>
        <PopoverTitle>Refine</PopoverTitle>
        <PopoverDescription>Narrow the results.</PopoverDescription>
        <Input aria-label="Search" />
      </PopoverContent>
    </Popover>
  )
}

describe('Popover', () => {
  it('is closed until the trigger is activated', () => {
    render(<Harness />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on trigger click with an accessible name', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))

    const popover = await screen.findByRole('dialog')
    expect(popover).toHaveAccessibleName('Refine')
    expect(popover).toHaveAccessibleDescription('Narrow the results.')
  })

  it('moves focus into the popover so its content is reachable', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Filters' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(trigger).toHaveFocus()
  })

  it('keeps its content interactive while open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'steel')

    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('steel')
  })
})
