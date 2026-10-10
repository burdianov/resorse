import { useMemo, useSyncExternalStore } from 'react'

/**
 * The design system's chart colours, in the form a chart library can use (F054).
 *
 * **Why anything needs reading at all.** `globals.css` states the palette as
 * custom properties (`--chart-1` … `--chart-5`, F009), and a chart library wants
 * a colour *value*. `fill="var(--chart-1)"` does not work: `var()` is resolved
 * by the CSS cascade, and an SVG presentation attribute is not part of it — the
 * attribute would be dropped and the series drawn black. So the values are read
 * back from the document, once per theme, and handed over as the strings the
 * stylesheet itself computed.
 *
 * **The palette has one home and this is not it.** The fallbacks below exist
 * because a test (or a document with no stylesheet yet) computes no custom
 * properties at all: `getComputedStyle` then answers `''` for every one of them.
 * They are copies of the values in `globals.css`, and they are keyed by theme
 * because `--border` and `--muted-foreground` genuinely differ between light and
 * dark. The five series colours happen to be identical in both (the reference's
 * palette is one palette), so they are written once — if a future theme changes
 * one, the fallback for the *other* theme is the only thing left stale, and only
 * in the no-stylesheet case. Nothing else may copy them: a chart that wants a
 * colour asks this module.
 *
 * **The theme is watched, not passed in.** The colours the browser will paint
 * are a property of the *class on `<html>`*, and `ThemeProvider` applies that
 * class in an effect — after the render in which `resolvedTheme` changed. A
 * hook that recomputed during render, or in its own effect, would therefore read
 * the *previous* theme's values and keep them, because the class it read is not
 * the class the memo keyed on. Observing the attribute is order-independent: it
 * fires after the DOM has actually changed, which is exactly when the new values
 * are the ones in force. It also means a chart needs no provider to be correct,
 * so it can be rendered on its own.
 */

/** The five series colours, in order. Series *n* takes `series[n % length]`. */
const SERIES_FALLBACK: readonly string[] = [
  'oklch(0.488 0.243 264.376)',
  'oklch(0.696 0.17 162.48)',
  'oklch(0.769 0.188 70.08)',
  'oklch(0.627 0.265 303.9)',
  'oklch(0.645 0.246 16.439)',
]

/** Per-theme fallbacks for the two non-series colours, which do differ. */
const GRID_FALLBACK: Record<'light' | 'dark', string> = {
  light: 'oklch(0.91 0 0)',
  dark: 'oklch(0.28 0 0)',
}
const AXIS_FALLBACK: Record<'light' | 'dark', string> = {
  light: 'oklch(0.5 0 0)',
  dark: 'oklch(0.55 0 0)',
}

export interface ChartTokens {
  /** Grid lines and axis rules — `--border`. */
  grid: string
  /** Tick labels — `--muted-foreground`. */
  axis: string
  /** Series colours — `--chart-1` … `--chart-5`. */
  series: readonly string[]
}

/** The colour this document is currently painting with, as an HTML colour string. */
export function readChartTokens(theme: 'light' | 'dark'): ChartTokens {
  const computed = getComputedStyle(document.documentElement)
  const read = (property: string, fallback: string): string => {
    const value = computed.getPropertyValue(property).trim()
    return value === '' ? fallback : value
  }

  return {
    grid: read('--border', GRID_FALLBACK[theme]),
    axis: read('--muted-foreground', AXIS_FALLBACK[theme]),
    series: SERIES_FALLBACK.map((fallback, index) =>
      read(`--chart-${String(index + 1)}`, fallback),
    ),
  }
}

/** Whether `<html>` carries the dark class — i.e. what the CSS resolves to. */
function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  // `style` as well as `class`: `applyTheme` also sets `color-scheme`, and a
  // theme applied by either route is the same event to a reader of colours.
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
  return () => {
    observer.disconnect()
  }
}

/** The chart colours in force right now, re-read whenever the theme changes. */
export function useChartTokens(): ChartTokens {
  // A string snapshot, so React can compare it: the class name is the whole
  // input, and it changes exactly when the colours might have.
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme)
  return useMemo(() => readChartTokens(theme), [theme])
}
