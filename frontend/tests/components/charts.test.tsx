import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChartFrame } from '@/components/charts/chart-frame'
import { TrendChart } from '@/components/charts/trend-chart'
import { useChartTokens } from '@/components/charts/chart-tokens'

/**
 * The chart wrappers and the token reader (F054).
 *
 * Three things are worth testing here, and none of them is "a chart looks
 * right":
 *
 * - the **table** — the numbers are in the DOM as text, which is what makes the
 *   drawing readable at all to something that cannot see it;
 * - the **palette** — `css: false` in the Vitest config means no stylesheet is
 *   loaded, so `getComputedStyle` answers `''` for every custom property and the
 *   documented fallbacks are what a chart draws with. That is the same path a
 *   first paint takes before the stylesheet applies, and it is the path a
 *   mistyped property name would silently take forever;
 * - the **theme change** — the colours are re-read when the class on `<html>`
 *   changes, not when a React value changes, because the class is what the CSS
 *   resolves against.
 */

const SERIES = [
  'oklch(0.488 0.243 264.376)',
  'oklch(0.696 0.17 162.48)',
  'oklch(0.769 0.188 70.08)',
  'oklch(0.627 0.265 303.9)',
  'oklch(0.645 0.246 16.439)',
]

const DATA = [
  { label: 'P1', value: 3 },
  { label: 'P2', value: 5 },
]

/**
 * jsdom has no layout, so every element measures 0×0 and a chart library that
 * sizes itself from its container draws nothing — an empty box, which any test
 * that does not look inside it will happily call a pass. Giving elements a box
 * is the same kind of stub `src/testing/setup.ts` already makes for `matchMedia`
 * and `ResizeObserver`: the browser has this, the test environment does not.
 *
 * Installed per test rather than once, because `restoreMocks` (vite.config.ts)
 * undoes it between tests.
 */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 640,
    height: 200,
    top: 0,
    left: 0,
    right: 640,
    bottom: 200,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

/** Prints the tokens a chart would draw with, for assertions on the values. */
function TokenProbe() {
  const tokens = useChartTokens()
  return (
    <ul data-testid="tokens">
      <li data-testid="grid">{tokens.grid}</li>
      <li data-testid="axis">{tokens.axis}</li>
      <li data-testid="series">{tokens.series.join(' ')}</li>
    </ul>
  )
}

describe('ChartFrame', () => {
  it('gives the drawing a caption, a description and the data as text', () => {
    render(
      <ChartFrame title="A trend" description="Seven points." data={DATA} valueLabel="Count">
        <div />
      </ChartFrame>,
    )

    // The title appears twice on purpose — once as the drawing's caption, once
    // as the table's, which is also the table's accessible name.
    expect(screen.getAllByText('A trend')).toHaveLength(2)
    expect(screen.getByText('Seven points.')).toBeInTheDocument()

    // The table is the visible-for-a-screen-reader copy of the drawing, so both
    // labels and both values are present as text.
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'P2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '5' })).toBeInTheDocument()
  })

  it('keeps the placeholder notice inside the caption a caller can read', () => {
    render(
      <ChartFrame
        title="Parts of a whole"
        description="Placeholder values."
        data={DATA}
        valueLabel="Count"
      >
        <div />
      </ChartFrame>,
    )

    expect(screen.getByText('Placeholder values.')).toBeInTheDocument()
  })
})

describe('useChartTokens', () => {
  it('falls back to the documented palette when no stylesheet is loaded', () => {
    render(<TokenProbe />)

    expect(screen.getByTestId('series').textContent).toBe(SERIES.join(' '))
    expect(screen.getByTestId('grid').textContent).toBe('oklch(0.91 0 0)')
    expect(screen.getByTestId('axis').textContent).toBe('oklch(0.5 0 0)')
  })

  it('re-reads the colours when the document’s theme class changes', async () => {
    render(<TokenProbe />)

    // The observer fires on a microtask, after the class has actually changed —
    // which is the point of watching the attribute rather than a React value.
    await act(async () => {
      document.documentElement.classList.add('dark')
    })

    // The two non-series colours differ between the themes (the five series
    // colours are one palette in both), so these two moving is the proof that
    // the values were read again rather than kept.
    await waitFor(() => {
      expect(screen.getByTestId('grid').textContent).toBe('oklch(0.28 0 0)')
    })
    expect(screen.getByTestId('axis').textContent).toBe('oklch(0.55 0 0)')
    expect(screen.getByTestId('series').textContent).toBe(SERIES.join(' '))
  })
})

describe('TrendChart', () => {
  it('draws in the front of the palette and keeps the data in the table', () => {
    const { container } = render(
      <TrendChart title="A trend" data={DATA} valueLabel="Count" height={200} />,
    )

    // `initialDimension` is what makes this render without layout: jsdom has no
    // measurement, so a chart that only drew after a ResizeObserver callback
    // would be an empty box here — and an empty box passes a weaker test.
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.innerHTML).toContain(SERIES[0])
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument()
  })
})
