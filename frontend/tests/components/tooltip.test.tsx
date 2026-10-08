import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function Harness({ delay = 0 }: { delay?: number }) {
  return (
    <TooltipProvider delay={delay}>
      <Tooltip>
        <TooltipTrigger render={<Button>Refresh</Button>} />
        <TooltipContent>Reload the list</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe('Tooltip', () => {
  it('is hidden until the trigger is hovered', () => {
    render(<Harness />)

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('appears on hover and announces its content', async () => {
    render(<Harness />)

    await userEvent.hover(screen.getByRole('button', { name: 'Refresh' }))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Reload the list')
    expect(tooltip).toHaveAttribute('data-slot', 'tooltip-content')
  })

  it('links the trigger to the tooltip so it is announced (G-8)', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Refresh' })

    // The describedby is present even while closed — the popup is unmounted
    // then, which assistive technology ignores — and must resolve when open.
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    await userEvent.hover(trigger)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveAttribute('id', describedBy)
    expect(trigger).toHaveAccessibleDescription('Reload the list')
  })

  it('appears on keyboard focus, not only on hover', async () => {
    render(<Harness />)

    await userEvent.tab()

    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.hover(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByRole('tooltip')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })

  it('hides again when the pointer leaves', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Refresh' })
    await userEvent.hover(trigger)
    await screen.findByRole('tooltip')

    await userEvent.unhover(trigger)

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })
})
