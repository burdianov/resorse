import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DataTable,
  DataTableViewOptions,
  exportTableCsv,
  exportTableCsvTemplate,
  useDataTable,
} from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { useTablePreferences } from '@/hooks/use-table-preferences'

/**
 * The F021 + F022 join: the CSV a user downloads is the table they are looking
 * at — their visible columns, in their order. Anything else is a file that
 * quietly disagrees with the screen.
 */
interface Person {
  id: string
  name: string
  email: string
  role: string
}

const PEOPLE: Person[] = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: '2', name: 'Marcus Webb', email: 'marcus@example.com', role: 'viewer' },
]

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'name', meta: { label: 'Name' }, header: 'Name' },
  { accessorKey: 'email', meta: { label: 'Email' }, header: 'Email' },
  { accessorKey: 'role', meta: { label: 'Role' }, header: 'Role' },
]

let latestCsv: string | undefined

function ExportProbe({
  filename = 'people.csv',
  rows,
  template = false,
}: {
  filename?: string
  rows?: readonly Person[]
  template?: boolean
}) {
  const table = useDataTable<Person>()

  return (
    <button
      type="button"
      onClick={() => {
        if (template) exportTableCsvTemplate({ table, filename })
        else exportTableCsv({ table, filename, ...(rows ? { rows } : {}) })
      }}
    >
      {template ? 'Download template' : 'Export CSV'}
    </button>
  )
}

function Harness(props: { rows?: readonly Person[]; template?: boolean }) {
  const preferences = useTablePreferences('export-test')

  return (
    <DataTable
      label="People"
      columns={columns}
      data={PEOPLE}
      actions={
        <>
          <DataTableViewOptions onReset={preferences.reset} />
          <ExportProbe {...props} />
        </>
      }
      {...preferences}
    />
  )
}

beforeEach(() => {
  latestCsv = undefined
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      void blob.text().then((text) => {
        // The BOM is invisible and not part of what these tests are about.
        // Built from its code point rather than written into the source: a
        // literal BOM is irregular whitespace to ESLint (F055) and invisible
        // in review, so neither a string nor a regex here carries one.
        latestCsv = text.replace(String.fromCharCode(0xfeff), '')
      })
      return 'blob:test'
    },
    revokeObjectURL: () => {},
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('CSV export from a table', () => {
  it('exports every visible column, in order, with the rows on screen', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      expect(latestCsv).toBe(
        'Name,Email,Role\r\n' +
          'Ada Lovelace,ada@example.com,admin\r\n' +
          'Marcus Webb,marcus@example.com,viewer\r\n',
      )
    })
  })

  it('follows the column preferences — a hidden column stays out of the file', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'View options' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }))
    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: 'Email' })).toBeNull()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      expect(latestCsv?.split('\r\n')[0]).toBe('Name,Role')
    })
  })

  it('follows the column order too', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'View options' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move Role left' }))

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      expect(latestCsv?.split('\r\n')[0]).toBe('Name,Role,Email')
    })
  })

  it('exports the rows it is handed, for a server-mode full export', async () => {
    const everything = [
      ...PEOPLE,
      { id: '3', name: 'Zara Okafor', email: 'zara@example.com', role: 'admin' },
    ]
    render(<Harness rows={everything} />)

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      // Three data rows, though the table itself only ever held two.
      expect(latestCsv?.trimEnd().split('\r\n')).toHaveLength(4)
    })
  })

  it('writes a template with headers and no rows', async () => {
    render(<Harness template />)

    await userEvent.click(screen.getByRole('button', { name: 'Download template' }))

    await waitFor(() => {
      expect(latestCsv).toBe('Name,Email,Role\r\n')
    })
  })

  it('protects a formula in a cell on the way out', async () => {
    render(
      <Harness rows={[{ id: '9', name: "=cmd|'/C calc'!A0", email: 'x@y.z', role: 'admin' }]} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      // Neutralised with a leading apostrophe. Quoting alone would not help —
      // a spreadsheet evaluates the cell either way.
      expect(latestCsv).toContain("'=cmd|'/C calc'!A0")
    })
  })
})
