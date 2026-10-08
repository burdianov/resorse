import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Spinner } from '@/components/ui/spinner'

describe('Spinner', () => {
  it('is announced as a busy status rather than drawn silently', () => {
    render(<Spinner />)

    const spinner = screen.getByRole('status')
    expect(spinner).toHaveAttribute('data-slot', 'spinner')
    expect(spinner).toHaveAccessibleName('Loading')
  })

  it('animates', () => {
    render(<Spinner />)

    expect(screen.getByRole('status')).toHaveClass('animate-spin')
  })

  it('accepts a caller size', () => {
    render(<Spinner className="size-6" />)

    const spinner = screen.getByRole('status')
    expect(spinner).toHaveClass('size-6')
    expect(spinner).not.toHaveClass('size-4')
  })

  it('can be given a more specific label', () => {
    render(<Spinner aria-label="Saving changes" />)

    // Caller-provided props must reach the element, not be swallowed.
    expect(screen.getByRole('status')).toHaveAccessibleName('Saving changes')
  })
})
