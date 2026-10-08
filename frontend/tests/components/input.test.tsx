import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Input } from '@/components/ui/input'

describe('Input', () => {
  it('renders a textbox with the shared slot marker', () => {
    render(<Input />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('data-slot', 'input')
  })

  it('accepts typed text and reports it', async () => {
    const onChange = vi.fn()
    render(<Input onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), 'abc')

    expect(screen.getByRole('textbox')).toHaveValue('abc')
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('passes the type through', () => {
    render(<Input type="email" />)

    // type=email is not exposed as role=textbox by every query engine, so
    // assert on the element itself.
    expect(document.querySelector('input')).toHaveAttribute('type', 'email')
  })

  it('does not accept input while disabled', async () => {
    render(<Input disabled />)

    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    await userEvent.type(input, 'abc')

    expect(input).toHaveValue('')
  })

  it('surfaces aria-invalid for the validation styling to hook onto', () => {
    render(<Input aria-invalid />)

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('merges a caller className', () => {
    render(<Input className="h-12" />)

    expect(screen.getByRole('textbox')).toHaveClass('h-12')
  })
})
