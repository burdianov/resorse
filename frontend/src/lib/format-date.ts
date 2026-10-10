import { format } from 'date-fns'

/**
 * Date display helper.
 *
 * The reference maps a user-configurable format token (`DD.MM.YYYY`,
 * `MM/DD/YYYY`, …) to date-fns through a module-level global that the settings
 * screen mutates. That setting belongs in `app_settings` and arrives with
 * F039/F040, so this is deliberately a pure formatter with one documented
 * default rather than a mutable global set during render.
 *
 * Dates are stored as ISO calendar days (`YYYY-MM-DD`) — the form the reference
 * and the API both use — and never as instants, so assignment and leave
 * boundaries stay free of timezone drift.
 */
export const DEFAULT_DATE_FORMAT = 'dd.MM.yyyy'

export function formatDate(
  value: string | Date | null | undefined,
  pattern: string = DEFAULT_DATE_FORMAT,
): string {
  if (!value) {
    return '—'
  }
  // A bare calendar date is parsed as local midnight, not UTC: `new Date('2026-10-09')`
  // is UTC and shifts a day for anyone west of Greenwich.
  const date =
    typeof value === 'string'
      ? new Date(value.length === 10 ? `${value}T00:00:00` : value)
      : value

  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return format(date, pattern)
}

/** The storage form for date fields. */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** The storage form for time fields: 24-hour `HH:mm`. */
export function toIsoTime(date: Date): string {
  return format(date, 'HH:mm')
}

/**
 * The platform's own relative formatter (F046's notification timestamps) —
 * never a hand-kept string table, so pluralisation, "yesterday"/"last week"
 * phrasing and future locales all come from the browser (the C29 principle:
 * real sources over maintained copies).
 */
const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** Largest unit first; the first one the gap reaches names the timestamp. */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/**
 * A relative timestamp like "5 minutes ago", "yesterday" or "in 2 hours".
 * `now` is injectable so a caller (or a test) can pin the reference instant
 * instead of racing the clock.
 */
export function formatRelativeTime(value: string | Date, now: number = Date.now()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  const deltaSeconds = Math.round((date.getTime() - now) / 1000)
  const [unit, secondsPerUnit] =
    RELATIVE_UNITS.find(([, seconds]) => Math.abs(deltaSeconds) >= seconds) ?? ['second', 1]
  return relativeFormatter.format(Math.round(deltaSeconds / secondsPerUnit), unit)
}
