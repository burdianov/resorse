import type { ReactNode } from 'react'
import type { RowData } from '@tanstack/react-table'

import { SearchField } from '@/components/common/search-field'
import { cn } from '@/lib/utils'

import { useDataTable } from './data-table-context'

interface DataTableToolbarProps {
  /** Renders the global-filter search box. */
  search?: { placeholder?: string; debounceMs?: number }
  /** Filter controls — faceted filters and chips read the table from context. */
  filters?: ReactNode
  /** Pushed to the trailing edge. */
  actions?: ReactNode
  className?: string
}

/**
 * The toolbar row above the table: search, filters, actions. The search box is
 * bound to the table's `globalFilter` slice, so it works in both modes — client
 * filtering locally, server mode reporting through `onGlobalFilterChange`.
 *
 * Filters are passed as children rather than as table columns because a filter
 * needs the table instance, not the other way round: `DataTableFacetedFilter`
 * looks its column up by id through `useDataTable`.
 */
export function DataTableToolbar({ search, filters, actions, className }: DataTableToolbarProps) {
  const table = useDataTable<RowData>()

  return (
    <div
      data-slot="data-table-toolbar"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {search ? (
        <SearchField
          value={(table.state.globalFilter as string | undefined) ?? ''}
          onValueChange={(value) => {
            table.setGlobalFilter(value === '' ? undefined : value)
          }}
          {...(search.placeholder !== undefined ? { placeholder: search.placeholder } : {})}
          {...(search.debounceMs !== undefined ? { debounceMs: search.debounceMs } : {})}
        />
      ) : null}
      {filters}
      {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
