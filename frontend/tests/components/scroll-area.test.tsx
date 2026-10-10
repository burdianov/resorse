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

  // There is deliberately no orientation test here any more. Two versions were
  // wrong, and the second one's failure is the useful record:
  //
  // 1. It passed `orientation` to `ScrollArea` and asserted the attribute landed
  //    on the root. It did — as a stray DOM attribute, because the root does not
  //    take that prop and the wrapper spreads what it does not destructure. The
  //    test asserted an accident (found once `tsc` covered `tests/`).
  // 2. It asserted instead on the scrollbar, which jsdom never renders: with no
  //    layout every measurement is zero, so Base UI's `ScrollAreaRoot` emits the
  //    viewport and stops (`<div data-slot="scroll-area">…<div data-slot="scroll-area-
  //    viewport">`; no scrollbar, no corner). Orientation is the *scrollbar's*
  //    property, so it is not observable here at all.
  //
  // A real browser is where this becomes assertable — the F057 Playwright gap
  // (`CARRIED_CONSTRAINTS.md` §6), recorded rather than faked with a weaker check.

  it('merges a caller className', () => {
    const { container } = render(
      <ScrollArea className="max-h-40">
        <p>Content</p>
      </ScrollArea>,
    )

    expect(container.querySelector('[data-slot="scroll-area"]')).toHaveClass('max-h-40')
  })
})
