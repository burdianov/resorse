import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  ChartFrame,
  initialDimension,
} from '@/components/charts/chart-frame'
import type { ChartDatum } from '@/components/charts/chart-frame'
import { useChartTokens } from '@/components/charts/chart-tokens'

/**
 * A single series over an ordered set of labels (F054) — the shape of anything
 * counted *by day*: logins per day, files stored per week, reports generated per
 * month.
 *
 * One series, deliberately. A second series is a different data shape
 * (`{ label, [series]: value }`) and needs a legend to say which band is which;
 * bending this component to accept both would give every caller of the simple
 * case the option of a chart it cannot label. When a screen needs two, it gets
 * its own wrapper.
 *
 * The labels are drawn as given: the caller orders them and is the only one who
 * can, because a date axis is not this component's business.
 */
export interface TrendChartProps {
  title: string
  description?: string
  /** In the order they are to be drawn, oldest first. */
  data: readonly ChartDatum[]
  /** What a value counts — "Logins", "Files". */
  valueLabel: string
  height?: number
  className?: string
}

export function TrendChart({
  title,
  description,
  data,
  valueLabel,
  height = 240,
  className,
}: TrendChartProps) {
  const tokens = useChartTokens()
  const series = tokens.series[0]

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
        <AreaChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          {/* The tooltip reads its own label from the series' `name`, so the
              number is always captioned with what it counts. */}
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
          {/* A flat wash rather than a gradient: a gradient needs an id per
              chart instance to keep two charts from sharing one, and a
              duplicated id in an SVG `url(#…)` reference is a bug that shows up
              as one chart painted with another's colours. */}
          <Area
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke={series}
            strokeWidth={2}
            fill={series}
            fillOpacity={0.15}
            dot={{ r: 2, fill: series }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
