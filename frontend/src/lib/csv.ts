/**
 * CSV in and out, with the parts that are easy to get wrong handled once
 * (BIG-PROMPT §7.9d, §3.2e): **formula-injection protection** on the way out,
 * RFC-4180 quoting on both sides, filename sanitation, and an import that
 * reports *every* bad row instead of the first.
 *
 * **Why injection protection is not optional.** A CSV is opened in a
 * spreadsheet, and a spreadsheet treats a cell starting with `=`, `+`, `-` or
 * `@` as a formula. A user whose display name is `=HYPERLINK("http://evil",
 * "click")` — or `=cmd|'/C calc'!A0` — otherwise turns an export into an
 * attack on whoever opens it. The mitigation is to prefix such values with an
 * apostrophe, which spreadsheets read as "this is text".
 *
 * The one trap in that mitigation is `-`: negatives are numbers, and turning
 * `-42` into `'-42` would corrupt every amount we ever export. So a leading
 * `-` is only neutralised when what follows is not a number, and the rule is
 * spelled out in `neutralizeFormula`.
 *
 * Excel itself is out of scope here: the client writes CSV. XLSX generation
 * belongs to the backend (`openpyxl`, F051), which is where a spreadsheet with
 * types, widths and multiple sheets can be produced honestly.
 */

export const CSV_MIME = 'text/csv;charset=utf-8'

/**
 * Prepended to downloaded CSV so Excel reads the file as UTF-8 instead of the
 * system code page. It is added at download time, not by `toCsv`, so the
 * string a caller compares in a test has no invisible character in it.
 */
export const UTF8_BOM = '\uFEFF'

export interface CsvColumn {
  /** Key into each record. */
  key: string
  /** Header text written to the file — and matched on import. */
  label: string
  /** Optional display formatting (dates, booleans); the value is stringified otherwise. */
  format?: (value: unknown) => string
}

/** A problem with one row (or, with `row: 0`, with the file itself). */
export interface CsvImportError {
  /**
   * The spreadsheet row number — header is row 1, the first data row is 2 —
   * because that is the number the user sees in their editor.
   */
  row: number
  /** The column label the problem belongs to, when it belongs to one. */
  column?: string
  message: string
}

export interface CsvImportResult<TRecord> {
  /** Parsed records — **only meaningful when `ok`**, see the note on import. */
  records: TRecord[]
  /** Every problem found, not just the first. */
  errors: CsvImportError[]
  ok: boolean
}

const FORMULA_TRIGGERS = new Set(['=', '+', '@', '\t', '\r'])

/** `-42`, `-3.5`, `-1e6` are numbers; `-1+1` is a formula. */
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/

/**
 * Prefix a value that a spreadsheet would execute with an apostrophe.
 *
 * Applies when the first character *after leading whitespace* is `=`, `+`, `@`,
 * a tab or a carriage return — importers trim, so a leading space is not a
 * defence. A `-` is treated the same way **unless the whole value is a
 * number**, which keeps negative amounts intact.
 */
export function neutralizeFormula(value: string): string {
  const withoutLeadingSpace = value.trimStart()
  const first = withoutLeadingSpace.charAt(0)
  if (first === '') return value

  if (FORMULA_TRIGGERS.has(first)) return `'${value}`
  if (first === '-' && !NUMBER.test(withoutLeadingSpace)) return `'${value}`
  return value
}

/** One cell, quoted and escaped per RFC 4180. */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text: string
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = String(value)
  } else {
    // Anything structured is exported as JSON rather than as "[object Object]".
    text = JSON.stringify(value) ?? ''
  }

  const safe = neutralizeFormula(text)
  const needsQuotes =
    safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r') ||
    safe !== safe.trim()
  if (!needsQuotes) return safe
  return `"${safe.replaceAll('"', '""')}"`
}

/** A CSV document: header row, CRLF line endings, trailing newline. */
export function toCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: readonly CsvColumn[],
): string {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(',')
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const value = row[column.key]
        return escapeCsvValue(column.format ? column.format(value) : value)
      })
      .join(','),
  )
  return [header, ...lines].join('\r\n') + '\r\n'
}

/**
 * Parse a CSV document into a header list and raw rows. Handles quoted fields
 * containing commas, quotes and newlines, and all three line endings — the
 * things a naive `split(',')` gets wrong and a user's paste buffer contains.
 */
export function parseCsv(text: string, { delimiter = ',' } = {}): {
  headers: string[]
  rows: string[][]
} {
  const source = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\r' || char === '\n') {
      // CRLF counts once.
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      grid.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  // A final line without a newline, or a trailing newline to ignore.
  if (field !== '' || row.length > 0) {
    row.push(field)
    grid.push(row)
  }

  const [headers = [], ...rows] = grid
  return { headers: headers.map((header) => header.trim()), rows }
}

/**
 * Turn a filename into something a filesystem will accept: no directory
 * traversal, no control characters, nothing Windows reserves, bounded length.
 * The extension is the caller's business (`downloadCsv` ensures `.csv`).
 */
export function sanitizeFilename(name: string, fallback = 'export'): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    // Control characters are exactly what we strip, hence the range.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
  // Bounded by code points, not code units: a truncated emoji is a broken name.
  if (cleaned === '') return fallback
  return [...cleaned].slice(0, 100).join('')
}

/**
 * Hand a text file to the browser. The object URL is revoked in the same turn —
 * "error cleanup" in §7.9d means exactly this: a leaked blob URL holds the
 * whole document in memory for the life of the page.
 */
export function downloadTextFile({
  filename,
  content,
  mime,
}: {
  filename: string
  content: string
  mime: string
}): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = sanitizeFilename(filename)
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Revoked even if the click path threw: the download already holds its copy.
    URL.revokeObjectURL(url)
  }
}

/** CSV with the UTF-8 BOM, so Excel opens it as UTF-8 rather than mojibake. */
export function downloadCsv({ filename, csv }: { filename: string; csv: string }): void {
  const name = sanitizeFilename(filename).replace(/\.csv$/i, '')
  downloadTextFile({ filename: `${name}.csv`, content: `${UTF8_BOM}${csv}`, mime: CSV_MIME })
}

/** A template: the header row only, ready to be filled in and imported back. */
export function csvTemplate(columns: readonly CsvColumn[]): string {
  return toCsv([], columns)
}

/**
 * Import a CSV against a column definition.
 *
 * Two rules from §3.2e are compiled in rather than documented and hoped for:
 *
 * - **Every bad row is reported**, not the first: a user fixing a 200-row file
 *   one error per attempt is a support ticket.
 * - **No silent partial writes.** The parsed records are returned *alongside*
 *   the errors, and `ok` is the only thing a caller may branch a write on. A
 *   record whose row failed validation is still returned (so a preview can show
 *   it) — writing it would be the silent partial write the requirement forbids.
 *
 * Headers are matched by **label**, case-insensitively, because a template the
 * user has edited keeps the labels, not our keys. Unknown extra columns are
 * ignored; a missing one is a file-level error (row 0).
 */
export function importCsvRows<TRecord>({
  text,
  columns,
  parseRow,
}: {
  text: string
  columns: readonly CsvColumn[]
  /** Return the record, or the problems with that row (without row numbers). */
  parseRow: (
    values: Record<string, string>,
    context: { row: number },
  ) => TRecord | Array<{ column?: string; message: string }>
}): CsvImportResult<TRecord> {
  const { headers, rows } = parseCsv(text)
  const errors: CsvImportError[] = []

  const indexByKey = new Map<string, number>()
  for (const column of columns) {
    const index = headers.findIndex(
      (header) => header.toLowerCase() === column.label.toLowerCase(),
    )
    if (index === -1) {
      errors.push({ row: 0, column: column.label, message: `Missing column "${column.label}".` })
    }
    indexByKey.set(column.key, index)
  }
  if (errors.length > 0) return { records: [], errors, ok: false }

  const records: TRecord[] = []
  rows.forEach((row, rowIndex) => {
    // Row 1 is the header; the user's editor calls the first data row 2.
    const rowNumber = rowIndex + 2
    const values: Record<string, string> = {}
    for (const column of columns) {
      const index = indexByKey.get(column.key) ?? -1
      values[column.key] = index === -1 ? '' : (row[index] ?? '')
    }

    const parsed = parseRow(values, { row: rowNumber })
    if (Array.isArray(parsed)) {
      for (const problem of parsed) {
        errors.push({
          row: rowNumber,
          ...(problem.column !== undefined ? { column: problem.column } : {}),
          message: problem.message,
        })
      }
      return
    }
    records.push(parsed)
  })

  return { records, errors, ok: errors.length === 0 }
}
