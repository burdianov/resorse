import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import {
  DataTable,
  DataTableColumnHeader,
  DataTableViewOptions,
  createLocalTablePreferencesStore,
  setTablePreferencesStore,
} from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { useTablePreferences } from '@/hooks/use-table-preferences'

/**
 * F021's acceptance: **reload** and **isolation**. The preferences run through
 * the real hook, the real table and the real menu; "reload" is a fresh mount
 * reading the same storage, and isolation is checked at both boundaries that
 * matter — two tables, and two users.
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
  {
    accessorKey: 'name',
    meta: { label: 'Name' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.name,
  },
  { accessorKey: 'email', meta: { label: 'Email' }, header: 'Email' },
  { accessorKey: 'role', meta: { label: 'Role' }, header: 'Role' },
]

function headerLabelsFor(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent ?? '')
}

function headerLabels(): string[] {
  return headerLabelsFor(screen.getByRole('table'))
}

function PreferencesTable({ tableKey = 'people' }: { tableKey?: string }) {
  const preferences = useTablePreferences(tableKey)

  return (
    <DataTable
      label="People"
      columns={columns}
      data={PEOPLE}
      actions={<DataTableViewOptions onReset={preferences.reset} />}
      {...preferences}
    />
  )
}

async function openViewOptions() {
  await userEvent.click(screen.getByRole('button', { name: 'View options' }))
}

afterEach(() => {
  window.localStorage.clear()
  setTablePreferencesStore(null)
})

describe('column visibility', () => {
  it('hides a column, and the choice survives a reload', async () => {
    const first = render(<PreferencesTable />)
    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }))

    await waitFor(() => {
      expect(headerLabels()).toEqual(['Name', 'Role'])
    })

    // Reload: the component goes away and comes back; only storage remains.
    first.unmount()
    render(<PreferencesTable />)

    expect(headerLabels()).toEqual(['Name', 'Role'])
  })

  it('restores everything from Reset columns, and forgets the stored copy', async () => {
    render(<PreferencesTable />)
    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }))
    await waitFor(() => {
      expect(headerLabels()).toEqual(['Name', 'Role'])
    })
    // A checkbox item does not close the menu (base-ui keeps it open while
    // toggling columns), so the reset item is already there — clicking the
    // trigger again would close it.
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset columns' }))

    await waitFor(() => {
      expect(headerLabels()).toEqual(['Name', 'Email', 'Role'])
    })
    // "No preference" is the honest record — not the defaults written out.
    expect(
      Object.keys(window.localStorage).filter((key) => key.startsWith('app.table')),
    ).toHaveLength(0)
  })
})

describe('column order', () => {
  it('moves a column and keeps the new order across a reload', async () => {
    const first = render(<PreferencesTable />)

    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move Role left' }))

    await waitFor(() => {
      expect(headerLabels()).toEqual(['Name', 'Role', 'Email'])
    })

    first.unmount()
    render(<PreferencesTable />)

    expect(headerLabels()).toEqual(['Name', 'Role', 'Email'])
  })

  it('cannot move the first column further left', async () => {
    render(<PreferencesTable />)
    await openViewOptions()

    expect(await screen.findByRole('menuitem', { name: 'Move Name left' })).toHaveAttribute(
      'data-disabled',
    )
  })
})

describe('isolation', () => {
  it('keeps two tables on one page apart', async () => {
    render(
      <>
        <PreferencesTable tableKey="people" />
        <PreferencesTable tableKey="staff" />
      </>,
    )

    const [people, staff] = screen.getAllByRole('table')
    // The actions sit in the toolbar, a sibling of the table, so the trigger is
    // picked by position: the first table's button is the first one.
    await userEvent.click(screen.getAllByRole('button', { name: 'View options' })[0] as HTMLElement)
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }))

    await waitFor(() => {
      expect(headerLabelsFor(people as HTMLElement)).toEqual(['Name', 'Role'])
    })
    // The other table still has all of its columns: the preference is keyed.
    expect(headerLabelsFor(staff as HTMLElement)).toEqual(['Name', 'Email', 'Role'])
  })

  it('keeps two users apart — the boundary F032 will start supplying', async () => {
    setTablePreferencesStore(createLocalTablePreferencesStore({ scope: 'user-1' }))
    const first = render(<PreferencesTable />)
    await openViewOptions()
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }))
    await waitFor(() => {
      expect(headerLabels()).toEqual(['Name', 'Role'])
    })
    first.unmount()

    // Same machine, same table, different person: their columns are their own.
    setTablePreferencesStore(createLocalTablePreferencesStore({ scope: 'user-2' }))
    render(<PreferencesTable />)

    expect(headerLabels()).toEqual(['Name', 'Email', 'Role'])
  })
})
