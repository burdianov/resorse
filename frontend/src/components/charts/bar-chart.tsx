import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import {
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  ChartFrame,
  initialDimension,
} from '@/components/charts/chart-frame'
import type { ChartDatum } from '@/components/charts/chart-frame'
import { useChartTokens } from '@/components/charts/chart-tokens'

/**
 * One series across categories that are not a sequence (F054) — roles and how
 * many accounts hold each, permissions and how many roles carry them, files by
 * category.
 *
 * The distinction from `TrendChart` is the reason both exist: a bar chart says
 * the categories are *comparable but not ordered*, so the bars are drawn at
 * equal width with a gap between them and no claim is made about the space
 * between two of them. An area chart over the same numbers would draw a slope
 * through categories that have no in-between.
 *
 * The bars are one colour on purpose. Colouring each bar differently would
 * imply each one is its own series — a legend would then be needed to say what
 * the colours mean, and they would mean nothing.
 */
export interface BarChartProps {
  title: string
  description?: string
  data: readonly ChartDatum[]
  /** What a value counts — "Users", "Roles". */
  valueLabel: string
  height?: number
  className?: string
}

export function CategoryBarChart({
  title,
  description,
  data,
  valueLabel,
  height = 240,
  className,
}: BarChartProps) {
  const tokens = useChartTokens()

  return (
    <ChartFrame
      title={title}
      description={description}
      data={data}
      valueLabel={valueLabel}
      height={height}
      className={className}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension(height)}>
        <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke={tokens.axis}
            tick={{ fill: tokens.axis, fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke={tokens.axis}
            tick={{ fill: tokens.axis, fontSize: 12 }}
            tickLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: tokens.grid, fillOpacity: 0.4 }}
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={tokens.series[0]}
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
