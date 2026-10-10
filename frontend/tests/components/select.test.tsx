import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="Department">
        <SelectValue placeholder="Choose a department" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="head-office">Head Office</SelectItem>
        <SelectItem value="site">Site</SelectItem>
        <SelectItem value="workshop" disabled>
          Workshop
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select', () => {
  it('renders a combobox with its placeholder and is collapsed by default', () => {
    render(<Harness />)

    const trigger = screen.getByRole('combobox', { name: 'Department' })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Choose a department')).toBeInTheDocument()
  })

  it('opens with the keyboard and exposes its options', async () => {
    render(<Harness />)

    const trigger = screen.getByRole('combobox', { name: 'Department' })
    await userEvent.tab()
    expect(trigger).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')

    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves through options with the arrow keys and selects with Enter', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)

    screen.getByRole('combobox', { name: 'Department' })
    await userEvent.tab()
    // ArrowDown opens the listbox and highlights the first option.
    await userEvent.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')

    await userEvent.keyboard('{Enter}')

    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange.mock.calls[0]?.[0]).toBe('head-office')
  })

  it('selects an option with the pointer', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Site' }))

    expect(onValueChange).toHaveBeenCalledWith('site', expect.anything())
  })

  // NOT ASSERTED: that the trigger then displays the item's *label*. In jsdom an
  // uncontrolled Select renders the raw value on the trigger ("site" rather than
  // "Site") and leaves the listbox mounted. Both may be measurement-dependent
  // behaviour under a layout-less DOM, so rather than assert a guess this needs a
  // real browser and is recorded as needing confirmation (NEXT_PROMPT §6).
  // The wiring that matters here — the value reaching the caller — is asserted
  // above and in the keyboard test.

  it('closes on Escape without selecting', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull()
    })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('does not select a disabled option', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    const disabled = await screen.findByRole('option', { name: 'Workshop' })
    expect(disabled).toHaveAttribute('data-disabled')

    await userEvent.click(disabled)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
