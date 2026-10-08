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
