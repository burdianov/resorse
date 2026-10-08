import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

describe('Label', () => {
  it('renders a label with the shared slot marker', () => {
    render(<Label>Email</Label>)

    const label = screen.getByText('Email')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('data-slot', 'label')
  })

  it('associates with a control through htmlFor', async () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>,
    )

    // Clicking the label must focus the field it names — the accessible-name
    // contract, not just a visual pairing.
    await userEvent.click(screen.getByText('Email'))

    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toBe(screen.getByRole('textbox'))
  })

  it('marks a required field for assistive technology', () => {
    render(<Label data-required>Email</Label>)

    expect(screen.getByText('Email')).toHaveAttribute('data-required')
  })

  it('merges a caller className', () => {
    render(<Label className="text-destructive">Email</Label>)

    expect(screen.getByText('Email')).toHaveClass('text-destructive')
  })
})
