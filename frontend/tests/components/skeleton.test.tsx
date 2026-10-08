import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton } from '@/components/ui/skeleton'

describe('Skeleton', () => {
  it('renders a placeholder block with the shared slot marker', () => {
    const { container } = render(<Skeleton data-testid="skeleton" />)

    const skeleton = container.querySelector('[data-slot="skeleton"]')
    expect(skeleton).not.toBeNull()
    expect(skeleton?.tagName).toBe('DIV')
  })

  it('pulses so it reads as loading rather than as content', () => {
    const { container } = render(<Skeleton />)

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveClass('animate-pulse')
  })

  it('merges a caller className', () => {
    const { container } = render(<Skeleton className="h-8 w-32" />)

    const skeleton = container.querySelector('[data-slot="skeleton"]')
    expect(skeleton).toHaveClass('h-8')
    expect(skeleton).toHaveClass('w-32')
  })

  it('is hidden from assistive technology via aria-hidden passthrough', () => {
    const { container } = render(<Skeleton aria-hidden="true" />)

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveAttribute('aria-hidden', 'true')
  })
})
