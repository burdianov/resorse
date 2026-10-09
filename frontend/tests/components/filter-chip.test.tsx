import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterChip } from '@/components/common/filter-chip'

describe('filter chip', () => {
  it('names what is filtered, in the option’s words', () => {
    render(<FilterChip label="Role" value="Administrator" onRemove={vi.fn()} />)

    expect(screen.getByText(/Role/)).toHaveTextContent('Role: Administrator')
  })

  it('removes through its own control, not by being clicked', async () => {
    const onRemove = vi.fn()
    render(<FilterChip label="Role" value="Administrator" onRemove={onRemove} />)

    const remove = screen.getByRole('button', { name: 'Remove filter: Role' })
    await userEvent.click(remove)

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('is not itself a button — the remove control is the only one', () => {
    render(<FilterChip label="Status" value="Active" onRemove={vi.fn()} />)

    // Clicking the chip's body must not remove the filter: a destructive action
    // needs a deliberate target.
    expect(screen.getByText(/Status/).closest('[data-slot="filter-chip"]')?.tagName).toBe('SPAN')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
