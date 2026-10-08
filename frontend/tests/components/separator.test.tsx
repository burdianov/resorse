import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Separator } from '@/components/ui/separator'

describe('Separator', () => {
  it('renders a separator with the shared slot marker', () => {
    render(<Separator />)

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('data-slot', 'separator')
  })

  it('defaults to horizontal and records the orientation for styling', () => {
    render(<Separator />)

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('data-orientation', 'horizontal')
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('renders vertical when asked', () => {
    render(<Separator orientation="vertical" />)

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('data-orientation', 'vertical')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('merges a caller className', () => {
    render(<Separator className="my-4" />)

    expect(screen.getByRole('separator')).toHaveClass('my-4')
  })
})
