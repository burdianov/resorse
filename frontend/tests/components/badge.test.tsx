import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge, badgeVariants } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders a span by default', () => {
    render(<Badge>New</Badge>)

    const badge = screen.getByText('New')
    expect(badge.tagName).toBe('SPAN')
    expect(badge).toHaveAttribute('data-slot', 'badge')
  })

  it.each([
    ['default', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['destructive', 'bg-destructive/10'],
    ['outline', 'border-border'],
    ['ghost', 'hover:bg-muted'],
    ['link', 'underline-offset-4'],
  ] as const)('renders the %s variant', (variant, expectedClass) => {
    render(<Badge variant={variant}>x</Badge>)

    expect(screen.getByText('x')).toHaveClass(expectedClass)
  })

  it('defaults to the default variant', () => {
    render(<Badge>defaulted</Badge>)

    expect(screen.getByText('defaulted')).toHaveClass('bg-primary')
  })

  it('renders as another element when given a render prop', () => {
    render(<Badge render={<a href="/releases/1" />}>v1.0</Badge>)

    const link = screen.getByRole('link', { name: 'v1.0' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/releases/1')
  })

  it('merges a caller className over the variant defaults', () => {
    render(<Badge className="bg-chart-3">x</Badge>)

    const badge = screen.getByText('x')
    expect(badge).toHaveClass('bg-chart-3')
    expect(badge).not.toHaveClass('bg-primary')
  })

  it('exposes the variant map for reuse', () => {
    expect(badgeVariants({ variant: 'outline' })).toContain('border-border')
  })
})
