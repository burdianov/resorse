import type { RowData } from '@tanstack/react-table'

import { csvTemplate, downloadCsv, toCsv } from '@/lib/csv'
import type { CsvColumn } from '@/lib/csv'

import { columnLabel } from './column-label'
import type { DataTableInstance } from './data-table'

/**
 * CSV export for a DataTable (F022, §7.9d).
 *
 * **It exports what the user sees.** The columns are the table's *visible leaf
 * columns, in their current order* — so the column preferences F021 persists
 * decide the file the user gets, instead of a hard-coded list that quietly
 * disagrees with the screen. A hidden column stays out; a moved column moves.
 *
 * **It exports the rows it is given, and defaults to the page on screen.** In
 * server mode the table only holds the current page, so a screen that wants the
 * whole result set must fetch it (its own query, its own parameters) and pass it
 * in. Silently exporting "the dataset" from the page's rows would produce a
 * file that looks complete and is not — the kind of quiet wrongness this
 * project keeps refusing.
 */
export function csvColumnsFromTable<TData extends RowData>(
  table: DataTableInstance<TData>,
): CsvColumn[] {
  return table.getVisibleLeafColumns().map((column) => ({
    key: column.id,
    label: columnLabel(column),
  }))
}

/** Records for the given data, keyed by column id so `toCsv` can map them. */
function recordsFor<TData extends RowData>(
  table: DataTableInstance<TData>,
  rows: readonly TData[],
): Array<Record<string, unknown>> {
  const visible = table.getVisibleLeafColumns()
  return rows.map((data) => {
    const record: Record<string, unknown> = {}
    for (const column of visible) {
      // The column's accessor does the lookup, so `accessorFn` columns work
      // exactly like `accessorKey` ones.
      record[column.id] = column.accessorFn?.(data, 0)
    }
    return record
  })
}

export function exportTableCsv<TData extends RowData>({
  table,
  filename,
  rows,
}: {
  table: DataTableInstance<TData>
  /** Sanitised by `downloadCsv`; `.csv` is added if missing. */
  filename: string
  /** Defaults to the table's current row model — what is on screen. */
  rows?: readonly TData[]
}): void {
  const data = rows ?? table.getRowModel().rows.map((row) => row.original)
  downloadCsv({ filename, csv: toCsv(recordsFor(table, data), csvColumnsFromTable(table)) })
}

/** The header row alone, for the "download a template, fill it in" import path. */
export function exportTableCsvTemplate<TData extends RowData>({
  table,
  filename,
}: {
  table: DataTableInstance<TData>
  filename: string
}): void {
  downloadCsv({ filename, csv: csvTemplate(csvColumnsFromTable(table)) })
}
