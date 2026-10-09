import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CSV_MIME,
  UTF8_BOM,
  csvTemplate,
  downloadCsv,
  escapeCsvValue,
  importCsvRows,
  neutralizeFormula,
  parseCsv,
  sanitizeFilename,
  toCsv,
} from '@/lib/csv'
import type { CsvColumn } from '@/lib/csv'

/**
 * CSV, and the attack that comes with it (F022). A CSV is opened in a
 * spreadsheet; a spreadsheet executes what starts with `=`, `+`, `-` or `@`.
 * These tests are the acceptance criterion, and the `-42` case is the one that
 * matters most: the obvious mitigation (`always prefix -`) corrupts every
 * negative number we will ever export.
 */

const COLUMNS: CsvColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
]

describe('formula injection', () => {
  it.each([
    ['a formula', '=1+1'],
    ['a command payload', "=cmd|' /C calc'!A0"],
    ['an addition', '+1+1'],
    ['a function call', '@SUM(A1:A9)'],
    ['a hyperlink', '=HYPERLINK("http://evil.example","click")'],
    ['a tab-prefixed value', '\t=1+1'],
    ['a carriage-return-prefixed value', '\r=1+1'],
    ['a value hiding behind leading spaces', '   =1+1'],
  ])('neutralises %s', (_label, value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`)
  })

  it('neutralises a minus that is not a number', () => {
    expect(neutralizeFormula('-1+1')).toBe("'-1+1")
    expect(neutralizeFormula('-A1')).toBe("'-A1")
  })

  it.each(['-42', '-3.5', '-1e6', '-0.0001', '42', '3.5'])(
    'leaves the number %s alone',
    (value) => {
      expect(neutralizeFormula(value)).toBe(value)
    },
  )

  it('leaves ordinary text alone', () => {
    expect(neutralizeFormula('Ada Lovelace')).toBe('Ada Lovelace')
    expect(neutralizeFormula('')).toBe('')
  })

  it('protects the value that would otherwise be executed', () => {
    expect(escapeCsvValue('=1+1')).toBe("'=1+1")
  })

  it('protects headers too — a column label is a cell', () => {
    const csv = toCsv([], [{ key: 'x', label: '=IMPORTXML("http://evil")' }])

    // Neutralised *and* quoted — the label contains quotes of its own.
    expect(csv).toBe('"\'=IMPORTXML(""http://evil"")"\r\n')
  })

  it('still quotes a neutralised value that needs quoting', () => {
    expect(escapeCsvValue('=A1,B1')).toBe('"\'=A1,B1"')
  })
})

describe('writing', () => {
  it('escapes the characters a spreadsheet cares about', () => {
    expect(escapeCsvValue('Lovelace, Ada')).toBe('"Lovelace, Ada"')
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvValue('line\nbreak')).toBe('"line\nbreak"')
    expect(escapeCsvValue(' padded ')).toBe('" padded "')
  })

  it('writes empty cells for nothing at all', () => {
    expect(escapeCsvValue(null)).toBe('')
    expect(escapeCsvValue(undefined)).toBe('')
  })

  it('stringifies numbers and booleans', () => {
    expect(escapeCsvValue(42)).toBe('42')
    expect(escapeCsvValue(false)).toBe('false')
  })

  it('exports structured values as JSON rather than [object Object]', () => {
    expect(escapeCsvValue({ role: 'admin' })).toBe('"{""role"":""admin""}"')
  })

  it('applies a column formatter', () => {
    const csv = toCsv(
      [{ active: true, name: 'Ada' }],
      [
        { key: 'name', label: 'Name' },
        { key: 'active', label: 'Status', format: (value) => (value ? 'Active' : 'Inactive') },
      ],
    )

    expect(csv).toBe('Name,Status\r\nAda,Active\r\n')
  })

  it('writes a template header with no rows', () => {
    expect(csvTemplate(COLUMNS)).toBe('Name,Email\r\n')
  })
})

describe('reading', () => {
  it('parses a plain document', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual({ headers: ['a', 'b'], rows: [['1', '2']] })
  })

  it('parses quoted commas, escaped quotes and embedded newlines', () => {
    const { rows } = parseCsv('name,note\r\n"Lovelace, Ada","said ""hi""\nthen left"\r\n')

    expect(rows).toEqual([['Lovelace, Ada', 'said "hi"\nthen left']])
  })

  it.each([
    ['LF', 'a,b\n1,2\n'],
    ['CRLF', 'a,b\r\n1,2\r\n'],
    ['CR', 'a,b\r1,2\r'],
    ['no trailing newline', 'a,b\n1,2'],
  ])('accepts %s line endings', (_label, text) => {
    expect(parseCsv(text).rows).toEqual([['1', '2']])
  })

  it('ignores the BOM a spreadsheet writes', () => {
    expect(parseCsv(`${UTF8_BOM}name\r\nAda\r\n`).headers).toEqual(['name'])
  })

  it('says nothing about an empty document', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })

  it('keeps ragged rows rather than inventing columns', () => {
    expect(parseCsv('a,b,c\r\n1,2\r\n').rows).toEqual([['1', '2']])
  })

  it('round-trips what it wrote', () => {
    const rows = [{ name: 'Lovelace, Ada', note: 'line\nbreak' }]
    const columns: CsvColumn[] = [
      { key: 'name', label: 'Name' },
      { key: 'note', label: 'Note' },
    ]

    const { headers, rows: parsed } = parseCsv(toCsv(rows, columns))

    expect(headers).toEqual(['Name', 'Note'])
    expect(parsed).toEqual([['Lovelace, Ada', 'line\nbreak']])
  })
})

describe('filenames', () => {
  it.each([
    ['path traversal', '../../etc/passwd', 'passwd'],
    ['a windows path', 'C:\\Users\\me\\report.csv', 'report.csv'],
    ['a posix path', 'exports/all users.csv', 'all users.csv'],
    ['reserved characters', 'a<b>c:d"e|f?g*h.csv', 'a-b-c-d-e-f-g-h.csv'],
    ['control characters', 'na\u0000me\u001f.csv', 'name.csv'],
    ['surrounding dots and spaces', '.hidden. ', 'hidden'],
    // Bounded at 100 characters; `downloadCsv` appends the extension after.
    ['a very long name', `${'x'.repeat(200)}.csv`, 'x'.repeat(100)],
  ])('cleans %s', (_label, input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected)
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('///')).toBe('export')
    expect(sanitizeFilename('', 'users')).toBe('users')
  })
})

describe('downloading', () => {
  let blobs: Blob[]
  let revoked: string[]
  let clicked: Array<{ download: string }>

  beforeEach(() => {
    blobs = []
    revoked = []
    clicked = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        blobs.push(blob)
        return `blob:test-${blobs.length}`
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url)
      },
    })
    // The anchor is removed again in the same turn, so what the browser would
    // have downloaded is captured from the click itself.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hands the browser a UTF-8 CSV with a sanitised name', async () => {
    downloadCsv({ filename: '../exports/users', csv: 'Name\r\nAda\r\n' })

    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.type).toBe(CSV_MIME)
    // Compared as bytes: `Blob.text()` follows the Encoding spec and strips a
    // leading BOM, so it would happily "pass" a file that has none.
    const bytes = new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0))
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    // `ignoreBOM` keeps the U+FEFF — a plain decoder strips it and the
    // assertion would pass vacuously.
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    expect(decoder.decode(bytes)).toBe(`${UTF8_BOM}Name\r\nAda\r\n`)
    expect(clicked[0]?.download).toBe('users.csv')
    // Nothing is left behind in the document.
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('revokes the object URL — a leaked one holds the file in memory', () => {
    downloadCsv({ filename: 'users.csv', csv: 'Name\r\n' })

    expect(revoked).toEqual(['blob:test-1'])
  })

  it('does not double the extension', () => {
    downloadCsv({ filename: 'users.csv', csv: 'Name\r\n' })

    expect(clicked[0]?.download).toBe('users.csv')
    expect(revoked).toHaveLength(1)
  })
})

describe('importing', () => {
  const columns: CsvColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
  ]

  function parseRow(values: Record<string, string>) {
    const problems: Array<{ column?: string; message: string }> = []
    if (values['name']?.trim() === '') problems.push({ column: 'Name', message: 'Name is required.' })
    if (!values['email']?.includes('@')) {
      problems.push({ column: 'Email', message: 'Enter a valid email address.' })
    }
    if (problems.length > 0) return problems
    return { name: values['name'] ?? '', email: values['email'] ?? '' }
  }

  it('parses records once every row is valid', () => {
    const result = importCsvRows({
      text: 'Name,Email\r\nAda,ada@example.com\r\nZara,zara@example.com\r\n',
      columns,
      parseRow,
    })

    expect(result.ok).toBe(true)
    expect(result.records).toEqual([
      { name: 'Ada', email: 'ada@example.com' },
      { name: 'Zara', email: 'zara@example.com' },
    ])
  })

  it('matches headers by label, ignoring case and surrounding spaces', () => {
    const result = importCsvRows({ text: '  name , EMAIL \r\nAda,ada@example.com\r\n', columns, parseRow })

    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(1)
  })

  it('reports a missing column as a file-level error rather than parsing on', () => {
    const result = importCsvRows({ text: 'Name\r\nAda\r\n', columns, parseRow })

    expect(result.ok).toBe(false)
    expect(result.records).toEqual([])
    expect(result.errors).toEqual([
      { row: 0, column: 'Email', message: 'Missing column "Email".' },
    ])
  })

  it('discloses every bad row, numbered the way the editor numbers them', () => {
    const result = importCsvRows({
      text: 'Name,Email\r\n,nope\r\nZara,zara@example.com\r\n,also-nope\r\n',
      columns,
      parseRow,
    })

    expect(result.ok).toBe(false)
    // Rows 2 and 4 are the bad ones: row 1 is the header, as in the sheet.
    expect(result.errors.map((error) => [error.row, error.column, error.message])).toEqual([
      [2, 'Name', 'Name is required.'],
      [2, 'Email', 'Enter a valid email address.'],
      [4, 'Name', 'Name is required.'],
      [4, 'Email', 'Enter a valid email address.'],
    ])
  })

  it('returns only the valid records, so a partial write cannot happen by accident', () => {
    const result = importCsvRows({
      text: 'Name,Email\r\nAda,ada@example.com\r\nZara,nope\r\n',
      columns,
      parseRow,
    })

    expect(result.ok).toBe(false)
    expect(result.records).toEqual([{ name: 'Ada', email: 'ada@example.com' }])
    // The gate is `ok`, not the length of `records`.
    expect(result.errors).toHaveLength(1)
  })

  it('ignores columns the file carries but the import does not know', () => {
    const result = importCsvRows({
      text: 'Name,Email,Notes\r\nAda,ada@example.com,hello\r\n',
      columns,
      parseRow,
    })

    expect(result.ok).toBe(true)
    expect(result.records).toEqual([{ name: 'Ada', email: 'ada@example.com' }])
  })

  it('round-trips its own template', () => {
    const filled = `${csvTemplate(columns)}Ada,ada@example.com\r\n`

    expect(importCsvRows({ text: filled, columns, parseRow }).ok).toBe(true)
  })
})
