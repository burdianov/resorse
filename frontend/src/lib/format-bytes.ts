/**
 * Byte sizes for people (F054's file list).
 *
 * `Intl` formats numbers, dates, currencies and lists — and has no byte
 * formatter, so this is one of the few things the platform genuinely does not
 * provide. The units are the binary ones (1024, KiB/MiB/GiB) rather than the
 * decimal ones, because that is how an operating system and a browser report
 * the size of the file the user just picked, and a list that disagreed with the
 * file chooser beside it would look wrong in a way the user cannot check.
 */

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

/**
 * One decimal place above a kilobyte, none below it: "812 B" and "1.2 MiB" are
 * both what the user expects to read, and "0.8 KiB" for 812 bytes is not.
 */
export function formatBytes(bytes: number, { locale = 'en-AE' }: { locale?: string } = {}): string {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (size < 1024) return `${new Intl.NumberFormat(locale).format(size)} B`

  let value = size
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} ${UNITS[unit]}`
}
