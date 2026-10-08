import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from '@/components/ui/checkbox'

describe('Checkbox', () => {
  it('renders a checkbox with the shared slot marker', () => {
    render(<Checkbox />)

    expect(screen.getByRole('checkbox')).toHaveAttribute('data-slot', 'checkbox')
  })

  it('mounts the tick indicator only while checked', () => {
    // Base UI renders Indicator only in the checked/indeterminate state, so an
    // unchecked box draws no tick. Each state is rendered fresh rather than
    // re-rendered: switching a control from uncontrolled to controlled mid-life
    // is not supported by Base UI (and is a React anti-pattern anyway).
    const unchecked = render(<Checkbox />)
    expect(
      unchecked.container.querySelector('[data-slot="checkbox-indicator"]'),
    ).toBeNull()
    unchecked.unmount()

    const checked = render(<Checkbox defaultChecked />)
    expect(
      checked.container.querySelector('[data-slot="checkbox-indicator"]'),
    ).not.toBeNull()
  })

  it('exposes the checked state on the element the styles key off', () => {
    const unchecked = render(<Checkbox />)
    expect(unchecked.container.querySelector('[role="checkbox"]')).toHaveAttribute(
      'data-unchecked',
    )
    unchecked.unmount()

    const checked = render(<Checkbox defaultChecked />)
    expect(checked.container.querySelector('[role="checkbox"]')).toHaveAttribute('data-checked')
  })

  it('toggles on click and reports the new value', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('reflects a controlled checked state', () => {
    render(<Checkbox checked />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('reflects a controlled unchecked state', () => {
    render(<Checkbox checked={false} />)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('honours defaultChecked', () => {
    render(<Checkbox defaultChecked />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox disabled onCheckedChange={onCheckedChange} />)

    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)

    expect(checkbox).not.toBeChecked()
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('merges a caller className', () => {
    render(<Checkbox className="size-6" />)

    expect(screen.getByRole('checkbox')).toHaveClass('size-6')
  })
})
