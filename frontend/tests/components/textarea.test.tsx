import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Textarea } from '@/components/ui/textarea'

describe('Textarea', () => {
  it('renders a multiline textbox with the shared slot marker', () => {
    render(<Textarea />)

    const textarea = screen.getByRole('textbox')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveAttribute('data-slot', 'textarea')
  })

  it('accepts typed text and reports it', async () => {
    const onChange = vi.fn()
    render(<Textarea onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), 'note')

    expect(screen.getByRole('textbox')).toHaveValue('note')
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('does not accept input while disabled', async () => {
    render(<Textarea disabled />)

    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeDisabled()
    await userEvent.type(textarea, 'note')

    expect(textarea).toHaveValue('')
  })

  it('surfaces aria-invalid for the validation styling to hook onto', () => {
    render(<Textarea aria-invalid />)

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('merges a caller className', () => {
    render(<Textarea className="min-h-32" />)

    expect(screen.getByRole('textbox')).toHaveClass('min-h-32')
  })
})
