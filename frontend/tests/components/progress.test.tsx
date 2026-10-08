import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'

describe('Progress', () => {
  it('renders a progressbar with the shared slot marker', () => {
    render(<Progress value={40} />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-slot', 'progress')
  })

  it('reports the value to assistive technology', () => {
    render(<Progress value={40} />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
  })

  it('renders a track and indicator for the value to fill', () => {
    const { container } = render(<Progress value={40} />)

    expect(container.querySelector('[data-slot="progress-track"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="progress-indicator"]')).not.toBeNull()
  })

  it('renders label and value parts when composed', () => {
    const { container } = render(
      <Progress value={72}>
        <ProgressLabel>Upload</ProgressLabel>
        <ProgressValue />
      </Progress>,
    )

    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="progress-label"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="progress-value"]')).not.toBeNull()
  })

  it('accepts the indeterminate state when no value is given', () => {
    render(<Progress />)

    // Indeterminate progress must not claim a value it does not have.
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })

  it('merges a caller className', () => {
    render(<Progress value={10} className="gap-1" />)

    expect(screen.getByRole('progressbar')).toHaveClass('gap-1')
  })
})
