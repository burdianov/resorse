import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'

function Harness({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger render={<Button>Details</Button>} />
      <CollapsibleContent>Hidden detail</CollapsibleContent>
    </Collapsible>
  )
}

describe('Collapsible', () => {
  it('is collapsed by default and reports that state on the trigger', () => {
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Details' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Hidden detail')).toBeNull()
  })

  it('expands on click and reveals its content', async () => {
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Details' })
    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hidden detail')).toBeInTheDocument()
  })

  it('collapses again on a second click', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Details' })

    await userEvent.click(trigger)
    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Hidden detail')).toBeNull()
  })

  it('toggles with the keyboard once focused', async () => {
    render(<Harness />)
    await userEvent.tab()
    const trigger = screen.getByRole('button', { name: 'Details' })
    expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard(' ')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts open when asked', () => {
    render(<Harness defaultOpen />)

    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hidden detail')).toBeInTheDocument()
  })

  it('links the trigger to the region it controls', () => {
    render(<Harness defaultOpen />)

    const trigger = screen.getByRole('button', { name: 'Details' })
    const controls = trigger.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    expect(document.getElementById(controls as string)).not.toBeNull()
  })
})
