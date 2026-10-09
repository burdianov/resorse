import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchField } from '@/components/common/search-field'

/**
 * The two behaviours that make a search field more than an input (F020): a
 * debounce that keeps a server from seeing every keystroke, and an external
 * reset that does not bounce straight back out as a change.
 */
describe('search field', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Typing is driven with `fireEvent.change` rather than user-event: user-event
   * runs its own timer machinery between keystrokes, and under fake timers that
   * machinery never advances — every test hangs rather than failing. This
   * component's contract is what happens to a change event, so the change event
   * is what the tests fire.
   */
  function type(value: string) {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
  }

  function click(name: string) {
    fireEvent.click(screen.getByRole('button', { name }))
  }

  function settle(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('reports the typed value once, after the debounce', async () => {
    const onValueChange = vi.fn()
    render(
      <SearchField onValueChange={onValueChange} debounceMs={200} placeholder="Search people" />,
    )

    type('ada')

    // The input already shows everything; the caller has heard nothing yet.
    expect(screen.getByRole('searchbox', { name: 'Search people' })).toHaveValue('ada')
    expect(onValueChange).not.toHaveBeenCalled()

    settle(200)
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('ada')
  })

  it('reports every keystroke when the debounce is off', async () => {
    const onValueChange = vi.fn()
    render(<SearchField onValueChange={onValueChange} debounceMs={0} />)

    type('a')
    type('ad')
    type('ada')

    expect(onValueChange.mock.calls.map((call) => call[0])).toEqual(['a', 'ad', 'ada'])
  })

  it('clears immediately — a clear is a decision, not typing', async () => {
    const onValueChange = vi.fn()
    render(<SearchField onValueChange={onValueChange} debounceMs={200} />)

    type('ada')
    settle(200)
    onValueChange.mockClear()

    click('Clear search')

    expect(onValueChange).toHaveBeenCalledWith('')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    // …and the debounce does not fire a second, stale report afterwards.
    settle(300)
    expect(onValueChange).toHaveBeenCalledTimes(1)
  })

  it('follows an external reset without echoing it back', async () => {
    const onValueChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState('ada')
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setValue('')
            }}
          >
            reset filters
          </button>
          <SearchField
            value={value}
            onValueChange={(next) => {
              onValueChange(next)
              setValue(next)
            }}
            debounceMs={200}
          />
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('searchbox')).toHaveValue('ada')

    click('reset filters')

    expect(screen.getByRole('searchbox')).toHaveValue('')
    settle(300)
    // The reset came from outside; reporting it back would be a phantom change.
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
