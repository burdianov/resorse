import { createContext, useContext } from 'react'
import type { RowData } from '@tanstack/react-table'

import type { DataTableInstance } from './data-table'

/**
 * The table instance, shared by the pieces that compose around it — the
 * toolbar, the pagination bar, the faceted filter.
 *
 * **This module exists to break a cycle**, the same way `config/access.ts` does
 * (ARCHITECTURE §12): `data-table.tsx` renders the toolbar and the footer, and
 * those need the table — importing it back from `data-table.tsx` closes a loop
 * that native ESM evaluates before the component exists, and
 * `tests/lib/module-graph.test.ts` fails on it. Everything that needs the table
 * imports it from here; the context holds no styling and no behaviour.
 *
 * The type import of `DataTableInstance` is erased at build time
 * (`verbatimModuleSyntax`), so it creates no runtime edge back to the component.
 */
export const DataTableContext = createContext<unknown>(null)

/**
 * The table instance of the enclosing `<DataTable>`. The cast is the price of
 * one untyped context: the provider cannot know `TData` across the boundary, so
 * the caller states it — exactly as it does for `useQuery`.
 */
export function useDataTable<TData extends RowData>(): DataTableInstance<TData> {
  const table = useContext(DataTableContext)
  if (!table) {
    throw new Error('useDataTable must be used inside <DataTable>')
  }
  return table as DataTableInstance<TData>
}
