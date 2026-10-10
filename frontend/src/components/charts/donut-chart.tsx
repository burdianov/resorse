import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import {
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  ChartFrame,
  initialDimension,
} from '@/components/charts/chart-frame'
import type { ChartDatum } from '@/components/charts/chart-frame'
import { useChartTokens } from '@/components/charts/chart-tokens'

/**
 * Parts of a whole (F054) — the one chart whose values are expected to add up to
 * something, and the one that is easy to misuse: a donut normalises whatever it
 * is given, so a series that is not a whole looks like one anyway. The wrappers
 * here cannot detect that, so the description is where a caller says what the
 * whole is ("of 412 accounts").
 *
 * The legend is an ordinary list under the chart rather than the library's own:
 * the library's legend is a row of coloured boxes that reflows unpredictably at
 * narrow widths, while a list wraps like text and lets each entry carry the
 * count beside its name — which is what a reader of a donut actually needs, since
 * comparing two arcs by eye is exactly what a donut is bad at.
 */
export interface DonutChartProps {
  title: string
  description?: string
  data: readonly ChartDatum[]
  /** What a value counts — "Users", "Files". */
  valueLabel: string
  height?: number
  className?: string
}

export function DonutChart({
  title,
  description,
  data,
  valueLabel,
  height = 240,
  className,
}: DonutChartProps) {
  const tokens = useChartTokens()

  return (
    <ChartFrame
      title={title}
      description={description}
      data={data}
      valueLabel={valueLabel}
      height={height}
      className={className}
      footer={
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {data.map((point, index) => (
            <li key={point.label} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: seriesColour(tokens.series, index) }}
              />
              <span className="text-muted-foreground">{point.label}</span>
              <span className="tabular-nums">{point.value}</span>
            </li>
          ))}
        </ul>
      }
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension(height)}>
        <PieChart>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
          <Pie
            data={[...data]}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="none"
            labelLine={false}
          >
            {data.map((point, index) => (
              <Cell key={point.label} fill={seriesColour(tokens.series, index)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* The ring leaves its centre free, but a total written in it would need
          absolute coordinates over the SVG and would drift the moment the box
          resized. The caption and the legend carry the numbers instead, so
          nothing here draws a total. */}
    </ChartFrame>
  )
}

/**
 * Series colours wrap around the five tokens. A sixth category reuses the first
 * colour — visible, and deliberately so: a chart with more categories than the
 * palette has colours is a chart that should have been a bar chart, and silently
 * inventing a hue would hide that.
 */
function seriesColour(series: readonly string[], index: number): string {
  return series[index % series.length] ?? series[0] ?? 'currentColor'
}
