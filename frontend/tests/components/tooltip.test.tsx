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

  // NOT ASSERTED: `aria-describedby` on the trigger. Base UI's Tooltip assigns
  // no id to the popup and wires no describedby, so a screen reader user hears
  // nothing when the control is focused. The registry wrapper cannot fix this
  // without reimplementing the Root's open-state plumbing; it is recorded as a
  // known limitation (REQUIREMENT_TRACEABILITY.md §14, G-8) rather than faked
  // with an id that points at an unmounted element while the tooltip is closed.

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
