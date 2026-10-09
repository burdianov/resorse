import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeToggle } from '@/components/common/theme-toggle'
import { THEME_STORAGE_KEY, ThemeProvider } from '@/components/providers/theme-provider'

/**
 * The header's toolbar form of the F010 theme control: a compact icon button
 * opening the three explicit choices (§1.2 requires light, dark *and* system).
 * The persistence itself is F010's — this asserts the toolbar control drives it.
 */
function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  window.localStorage.clear()
})

describe('ThemeToggle (header menu)', () => {
  it('offers all three modes with the current one checked', async () => {
    renderToggle()

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))

    const options = await screen.findAllByRole('menuitemradio')
    expect(options.map((option) => option.textContent)).toEqual(['Light', 'Dark', 'System'])
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('applies and persists the chosen mode', async () => {
    renderToggle()

    await userEvent.click(screen.getByRole('button', { name: 'Theme' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
    })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
