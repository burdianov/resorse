import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button, buttonVariants } from '@/components/ui/button'

describe('Button', () => {
  it('renders a button with its children and the shared slot marker', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('data-slot', 'button')
  })

  it.each([
    ['default', 'bg-primary'],
    ['outline', 'border-border'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'hover:bg-muted'],
    ['destructive', 'bg-destructive/10'],
    ['link', 'underline-offset-4'],
  ] as const)('renders the %s variant', (variant, expectedClass) => {
    render(<Button variant={variant}>x</Button>)

    expect(screen.getByRole('button')).toHaveClass(expectedClass)
  })

  it.each([
    ['xs', 'h-6'],
    ['sm', 'h-7'],
    ['default', 'h-8'],
    ['lg', 'h-9'],
    ['icon', 'size-8'],
    ['icon-xs', 'size-6'],
    ['icon-sm', 'size-7'],
    ['icon-lg', 'size-9'],
  ] as const)('renders the %s size', (size, expectedClass) => {
    render(<Button size={size}>x</Button>)

    expect(screen.getByRole('button')).toHaveClass(expectedClass)
  })

  it('calls onClick when activated', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toBeDisabled()
    await userEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('blocks interaction and announces busy state while loading', () => {
    render(<Button loading>Saving</Button>)

    const button = screen.getByRole('button', { name: /Saving/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-loading', 'true')
    // The shared Spinner primitive (F012), not a local one-off.
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })

  it('scales the spinner with the button size', () => {
    const small = render(<Button size="xs" loading>x</Button>)
    expect(small.container.querySelector('[data-slot="spinner"]')).toHaveClass('size-3')
    small.unmount()

    const regular = render(<Button loading>x</Button>)
    expect(regular.container.querySelector('[data-slot="spinner"]')).toHaveClass('size-4')
  })

  it('reports a non-busy state when not loading', () => {
    render(<Button>Idle</Button>)

    const button = screen.getByRole('button', { name: 'Idle' })
    expect(button).toHaveAttribute('aria-busy', 'false')
    expect(button).toHaveAttribute('data-loading', 'false')
    expect(button.querySelector('[data-slot="spinner"]')).toBeNull()
  })

  it('lets a caller className win over the variant defaults', () => {
    render(<Button className="bg-chart-2">x</Button>)

    // tailwind-merge must drop the conflicting variant class, not emit both.
    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-chart-2')
    expect(button).not.toHaveClass('bg-primary')
  })

  it('exposes the variant map for reuse', () => {
    expect(buttonVariants({ variant: 'outline', size: 'sm' })).toContain('border-border')
  })
})
