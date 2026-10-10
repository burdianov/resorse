import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Everything a chart needs around its drawing (F054).
 *
 * A chart library draws an SVG, and an SVG is a picture: it tells a screen
 * reader nothing about the numbers in it, and the numbers are the entire point.
 * So a chart in this project is a `figure` with a caption, the drawing, and the
 * same data as a **table that sighted users do not see** (`sr-only`). The table
 * is not a courtesy for the visually impaired — it is the data's real home, and
 * the picture is the rendering of it.
 *
 * The `initialDimension` handed to `ResponsiveContainer` is what the chart is
 * drawn with on the **first** paint. The container measures itself in an effect —
 * with a `ResizeObserver` and a `getBoundingClientRect` that have not run yet —
 * so without it the first frame would be an empty box that fills in a moment
 * later. It is not a substitute for having a box: the measurement wins as soon as
 * it happens, and a document with no layout (jsdom reports 0×0 for everything)
 * therefore still draws nothing. A test that wants a drawing has to give the
 * element a size, which `tests/components/charts.test.tsx` does.
 */

/** One point of the data. Every wrapper here takes the same shape. */
export interface ChartDatum {
  label: string
  value: number
}

export interface ChartFrameProps {
  /** The chart's name. Also the figure's caption. */
  title: string
  /** What the chart shows, in words — the reading a glance is supposed to give. */
  description?: string | undefined
  data: readonly ChartDatum[]
  /** What a value counts, for the table's column and the tooltip's label. */
  valueLabel: string
  /** The drawing area's height in pixels. */
  height?: number
  /** Rendered under the drawing, above the table — a legend, say. */
  footer?: ReactNode
  children: ReactNode
  className?: string | undefined
}

export function ChartFrame({
  title,
  description,
  data,
  valueLabel,
  height = 240,
  footer,
  children,
  className,
}: ChartFrameProps) {
  return (
    <figure
      data-slot="chart-frame"
      className={cn('space-y-3 rounded-lg border p-4', className)}
    >
      <figcaption className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </figcaption>

      {/* The width is the container's; only the height is stated, and it is
          stated so that the measured box has a definite one. */}
      <div className="w-full" style={{ height }}>
        {children}
      </div>

      {footer}

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/**
 * The size a chart starts at, before the container has been measured.
 * Exported so the three wrappers pass the same one for the same reason.
 */
export function initialDimension(height: number): { width: number; height: number } {
  return { width: 640, height }
}

/**
 * The tooltip's presentation.
 *
 * Written as `var()` — unlike the SVG colours in `chart-tokens.ts` — because a
 * tooltip is HTML, and inline styles on an HTML element *are* part of the
 * cascade. The library's own default is a white panel with a light border, which
 * is wrong in dark mode: the palette must come from the theme in force, not from
 * the library's guess.
 */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--popover-foreground)',
  fontSize: '0.75rem',
} as const

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'var(--muted-foreground)',
} as const
