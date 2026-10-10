import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DataTable, DataTableColumnHeader, DataTableFacetedFilter } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import type { PaginationState, SortingState } from '@tanstack/react-table'

/**
 * The DataTable, exercised with real fixture rows and no mocks: sorting,
 * searching and pagination run through the real row-model pipeline, and the
 * server-mode tests prove the same component *reports* state instead of
 * computing it. The fixtures are deliberately out of order so a sort is
 * visible, and long enough to paginate.
 */
interface Person {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
}

const PEOPLE: Person[] = [
  { id: '1', name: 'Zara Okafor', email: 'zara@example.com', role: 'admin', status: 'active' },
  { id: '2', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin', status: 'active' },
  { id: '3', name: 'Marcus Webb', email: 'marcus@example.com', role: 'viewer', status: 'inactive' },
  { id: '4', name: 'Priya Raman', email: 'priya@example.com', role: 'editor', status: 'active' },
  { id: '5', name: 'Tomás Ferreira', email: 'tomas@example.com', role: 'viewer', status: 'active' },
  { id: '6', name: 'Lena Fischer', email: 'lena@example.com', role: 'admin', status: 'inactive' },
  { id: '7', name: 'Yusuf Demir', email: 'yusuf@example.com', role: 'editor', status: 'active' },
  { id: '8', name: 'Nia Mwangi', email: 'nia@example.com', role: 'viewer', status: 'active' },
  { id: '9', name: 'Ivan Petrov', email: 'ivan@example.com', role: 'admin', status: 'active' },
  { id: '10', name: 'Sofia Rossi', email: 'sofia@example.com', role: 'editor', status: 'inactive' },
  { id: '11', name: 'Hana Suzuki', email: 'hana@example.com', role: 'viewer', status: 'active' },
  { id: '12', name: 'Omar Haddad', email: 'omar@example.com', role: 'admin', status: 'active' },
]

const columns: DataTableColumn<Person>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.name,
  },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'role',
    header: 'Role',
    // The kit's facet filter: the state is the array of selected values.
    filterFn: 'facetIncludes',
  },
  { accessorKey: 'status', header: 'Status' },
]

const ROLE_OPTIONS = [
  { label: 'Administrator', value: 'admin' },
  { label: 'Editor', value: 'editor' },
  { label: 'Viewer', value: 'viewer' },
]

function bodyRows(): HTMLElement[][] {
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  return rows.slice(1).map((row) => within(row).getAllByRole('cell'))
}

function namesInOrder(): string[] {
  return bodyRows().map((cells) => cells[0]?.textContent ?? '')
}

function renderTable(ui: React.ReactElement) {
  return render(ui)
}

describe('client mode', () => {
  it('renders the rows it is given, in the order it is given them', () => {
    renderTable(
      <DataTable label="People" columns={columns} data={PEOPLE} search={{ debounceMs: 0 }} />,
    )

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument()
    expect(namesInOrder()[0]).toBe('Zara Okafor')
    expect(screen.getByText('1–10 of 12')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('sorts by a header, cycling through ascending and descending', async () => {
    renderTable(<DataTable label="People" columns={columns} data={PEOPLE} />)

    const nameHeader = screen.getByRole('columnheader', { name: 'Name' })
    expect(nameHeader).not.toHaveAttribute('aria-sort')

    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(namesInOrder()[0]).toBe('Ada Lovelace')

    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    expect(namesInOrder()[0]).toBe('Zara Okafor')
  })

  it('filters across the searchable columns from the toolbar', async () => {
    renderTable(
      <DataTable label="People" columns={columns} data={PEOPLE} search={{ debounceMs: 0 }} />,
    )

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'example.com')

    await waitFor(() => {
      expect(screen.getByText('1–10 of 12')).toBeInTheDocument()
    })

    await userEvent.clear(screen.getByRole('searchbox', { name: /search/i }))
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'Ada')

    await waitFor(() => {
      expect(namesInOrder()).toEqual(['Ada Lovelace'])
    })
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
  })

  it('paginates and reports the range it is showing', async () => {
    renderTable(<DataTable label="People" columns={columns} data={PEOPLE} initialPageSize={5} />)

    expect(screen.getByText('1–5 of 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('6–10 of 12')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Last page' }))
    expect(screen.getByText('11–12 of 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'First page' }))
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument()
  })

  it('changes the page size from the footer', async () => {
    renderTable(<DataTable label="People" columns={columns} data={PEOPLE} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    await userEvent.click(await screen.findByRole('option', { name: '25' }))

    expect(screen.getByText('1–12 of 12')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
  })

  it('shows the empty state when nothing matches, and when there is nothing at all', async () => {
    const { unmount } = renderTable(
      <DataTable label="People" columns={columns} data={PEOPLE} search={{ debounceMs: 0 }} />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'nobody')
    expect(await screen.findByText('No results')).toBeInTheDocument()
    expect(screen.getByText('No rows')).toBeInTheDocument()
    unmount()

    renderTable(<DataTable label="People" columns={columns} data={[]} />)
    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.getByText('No rows')).toBeInTheDocument()
  })

  it('replaces the body with skeletons while loading, and says so', () => {
    renderTable(
      <DataTable label="People" columns={columns} data={[]} isLoading initialPageSize={3} />,
    )

    expect(screen.getByText('Loading rows')).toBeInTheDocument()
    // The body is placeholders, not data: three skeleton rows of four cells.
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3 * columns.length)
    expect(bodyRows()).toHaveLength(3)
    expect(screen.queryByText('Zara Okafor')).toBeNull()
    expect(screen.queryByText('No results')).toBeNull()
  })
})

describe('server mode', () => {
  /** The wiring a page will use: state lives here, the table reports changes. */
  function ServerTable({
    data = PEOPLE.slice(0, 3),
    rowCount = 42,
    manualPagination = true,
  }: {
    data?: Person[]
    rowCount?: number
    manualPagination?: boolean
  }) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [pagination, setPagination] = useState<PaginationState>({
      pageIndex: 0,
      pageSize: 10,
    })
    const [globalFilter, setGlobalFilter] = useState('')

    return (
      <DataTable
        label="People"
        columns={columns}
        data={data}
        search={{ debounceMs: 0 }}
        sorting={sorting}
        onSortingChange={setSorting}
        pagination={pagination}
        onPaginationChange={setPagination}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        manualPagination={manualPagination}
        manualSorting
        manualFiltering
        rowCount={rowCount}
      />
    )
  }

  it('counts rows the way the server does, not the way the page looks', () => {
    renderTable(<ServerTable />)

    // Three rows are on screen; the server says there are forty-two.
    expect(bodyRows()).toHaveLength(3)
    expect(screen.getByText('1–10 of 42')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument()
  })

  it('reports paging intent without slicing anything itself', async () => {
    renderTable(<ServerTable />)

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    // Same three rows: the table did not invent a second page, it asked for one.
    expect(bodyRows()).toHaveLength(3)
    expect(screen.getByText('11–20 of 42')).toBeInTheDocument()
  })

  it('reports sorting intent without reordering locally', async () => {
    renderTable(<ServerTable />)

    await userEvent.click(screen.getByRole('button', { name: 'Name' }))

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    // Fixture order untouched — the server owns the ordering.
    expect(namesInOrder()).toEqual(['Zara Okafor', 'Ada Lovelace', 'Marcus Webb'])
  })

  it('reports the search term without filtering locally', async () => {
    renderTable(<ServerTable />)

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'Ada')

    expect(bodyRows()).toHaveLength(3)
    expect(screen.getByText('1–10 of 42')).toBeInTheDocument()
  })
})

describe('faceted filter', () => {
  function FilteredTable() {
    return (
      <DataTable
        label="People"
        columns={columns}
        data={PEOPLE}
        search={{ debounceMs: 0 }}
        filters={<DataTableFacetedFilter column="role" title="Role" options={ROLE_OPTIONS} />}
      />
    )
  }

  it('offers the options with counts taken from the data', async () => {
    renderTable(<FilteredTable />)

    await userEvent.click(screen.getByRole('button', { name: /^Role/ }))

    const option = await screen.findByRole('option', { name: /Administrator/ })
    // Five admins in the fixtures, and the count is visible next to the label.
    expect(option).toHaveTextContent('Administrator')
    expect(option).toHaveTextContent('Administrator5')
  })

  it('filters the rows, shows a chip, and removes the chip to restore them', async () => {
    renderTable(<FilteredTable />)

    await userEvent.click(screen.getByRole('button', { name: /^Role/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Viewer/ }))

    await waitFor(() => {
      expect(bodyRows()).toHaveLength(4)
    })
    expect(screen.getByText('1–4 of 4')).toBeInTheDocument()
    // The chip says what is filtered, in the option's own words — the internal
    // value ('viewer') never reaches the screen.
    expect(
      screen.getByRole('button', { name: 'Remove filter: Role' }).parentElement,
    ).toHaveTextContent('Role: Viewer')

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Role' }))

    await waitFor(() => {
      expect(screen.getByText('1–10 of 12')).toBeInTheDocument()
    })
  })

  it('counts the options that survive the other filters', async () => {
    renderTable(<FilteredTable />)

    // "Ada" leaves one row — an admin — so every other facet count is zero.
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'Ada')
    await waitFor(() => {
      expect(bodyRows()).toHaveLength(1)
    })

    await userEvent.click(screen.getByRole('button', { name: /^Role/ }))
    expect(await screen.findByRole('option', { name: /Administrator/ })).toHaveTextContent('1')
    expect(screen.getByRole('option', { name: /Editor/ })).toHaveTextContent('0')
  })

  it('clears every selected value from the popover', async () => {
    renderTable(<FilteredTable />)

    await userEvent.click(screen.getByRole('button', { name: /^Role/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Viewer/ }))
    await userEvent.click(screen.getByRole('option', { name: /Administrator/ }))
    // Four viewers plus five admins.
    await waitFor(() => {
      expect(screen.getByText('1–9 of 9')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('option', { name: /Clear role/ }))

    await waitFor(() => {
      expect(screen.getByText('1–10 of 12')).toBeInTheDocument()
    })
  })

  it('fails loudly when the column id does not exist', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      renderTable(
        <DataTable
          label="People"
          columns={columns}
          data={PEOPLE}
          filters={<DataTableFacetedFilter column="nope" title="Nope" options={[]} />}
        />,
      ),
    ).toThrow('the table has no column "nope"')
    spy.mockRestore()
  })
})
