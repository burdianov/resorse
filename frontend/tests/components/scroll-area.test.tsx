import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScrollArea } from '@/components/ui/scroll-area'

describe('ScrollArea', () => {
  it('renders its content', () => {
    render(
      <ScrollArea data-testid="area" className="h-24">
        <p>Row one</p>
        <p>Row two</p>
      </ScrollArea>,
    )

    expect(screen.getByText('Row one')).toBeInTheDocument()
    expect(screen.getByText('Row two')).toBeInTheDocument()
  })

  it('marks the viewport so styling and scrolling target the right node', () => {
    const { container } = render(
      <ScrollArea className="h-24">
        <p>Content</p>
      </ScrollArea>,
    )

    expect(container.querySelector('[data-slot="scroll-area"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull()
  })

  it('accepts an orientation', () => {
    const { container } = render(
      <ScrollArea orientation="horizontal" className="h-24">
        <p>Content</p>
      </ScrollArea>,
    )

    // jsdom performs no layout, so the scrollbar may not be measurable here;
    // what must hold is that the orientation reaches the root for styling.
    expect(container.querySelector('[data-slot="scroll-area"]')).toHaveAttribute(
      'orientation',
      'horizontal',
    )
  })

  it('merges a caller className', () => {
    const { container } = render(
      <ScrollArea className="max-h-40">
        <p>Content</p>
      </ScrollArea>,
    )

    expect(container.querySelector('[data-slot="scroll-area"]')).toHaveClass('max-h-40')
  })
})
