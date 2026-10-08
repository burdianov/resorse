import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group'

describe('InputGroup', () => {
  it('renders a container with the shared slot marker', () => {
    render(
      <InputGroup data-testid="group">
        <InputGroupInput />
      </InputGroup>,
    )

    expect(screen.getByTestId('group')).toHaveAttribute('data-slot', 'input-group')
  })

  it('renders its input with the control slot the styling keys off', () => {
    render(
      <InputGroup>
        <InputGroupInput placeholder="Search" />
      </InputGroup>,
    )

    expect(screen.getByRole('textbox')).toHaveAttribute('data-slot', 'input-group-control')
  })

  it('renders a textarea variant inside the same group', () => {
    render(
      <InputGroup>
        <InputGroupTextarea />
      </InputGroup>,
    )

    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA')
  })

  it.each(['inline-start', 'inline-end', 'block-start', 'block-end'] as const)(
    'records the %s alignment on the addon',
    (align) => {
      render(
        <InputGroup>
          <InputGroupAddon align={align} data-testid="addon">
            <InputGroupText>@</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput />
        </InputGroup>,
      )

      expect(screen.getByTestId('addon')).toHaveAttribute('data-align', align)
    },
  )

  it('focuses the input when the addon is clicked', async () => {
    render(
      <InputGroup>
        <InputGroupAddon data-testid="addon">
          <InputGroupText>@</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput />
      </InputGroup>,
    )

    await userEvent.click(screen.getByTestId('addon'))

    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('renders an inline button that does not steal focus from the field', async () => {
    render(
      <InputGroup>
        <InputGroupInput />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Copy</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>,
    )

    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button).toHaveAttribute('data-size', 'xs')
    expect(button).toHaveAttribute('type', 'button')

    await userEvent.click(button)
    // Clicking the button must not be treated as "focus the input".
    expect(screen.getByRole('textbox')).not.toHaveFocus()
  })

  it('merges a caller className on the group', () => {
    render(
      <InputGroup className="h-12" data-testid="group">
        <InputGroupInput />
      </InputGroup>,
    )

    expect(screen.getByTestId('group')).toHaveClass('h-12')
  })
})
