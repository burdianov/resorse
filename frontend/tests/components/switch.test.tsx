import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from '@/components/ui/switch'

describe('Switch', () => {
  it('renders a switch with a thumb', () => {
    render(<Switch />)

    const switchEl = screen.getByRole('switch')
    expect(switchEl).toHaveAttribute('data-slot', 'switch')
    expect(switchEl.querySelector('[data-slot="switch-thumb"]')).not.toBeNull()
  })

  it('toggles on click and reports the new value', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('reflects a controlled checked state', () => {
    render(<Switch checked />)

    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('honours defaultChecked', () => {
    render(<Switch defaultChecked />)

    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch disabled onCheckedChange={onCheckedChange} />)

    const switchEl = screen.getByRole('switch')
    await userEvent.click(switchEl)

    expect(switchEl).not.toBeChecked()
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('is reachable and toggleable by keyboard', async () => {
    render(<Switch />)

    const switchEl = screen.getByRole('switch')
    await userEvent.tab()
    expect(switchEl).toHaveFocus()

    await userEvent.keyboard(' ')
    expect(switchEl).toBeChecked()
  })

  it('merges a caller className', () => {
    render(<Switch className="h-8" />)

    expect(screen.getByRole('switch')).toHaveClass('h-8')
  })
})
