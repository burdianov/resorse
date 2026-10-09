import type { ReactNode } from 'react'
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  constructFilterFn,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  ReactTable,
  RowData,
  SortingState,
} from '@tanstack/react-table'

import { EmptyState } from '@/components/common/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table as TablePrimitive, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { DataTableContext } from './data-table-context'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'

/**
 * The DataTable (BIG-PROMPT §5.3), built on TanStack Table **v9**.
 *
 * v9 differs from the v8 API the reference uses, and the difference is not
 * cosmetic: features are declared in one `tableFeatures({…})` value instead of
 * being switched on by row-model options (`getCoreRowModel: getCoreRowModel()`).
 * Sorting, filtering, faceting and pagination arrive as features; the row
 * models come with them. The kit owns that decision — consumers type their
 * columns with `DataTableColumn<TData>` and never touch `tableFeatures`.
 *
 * **One component, both modes.** Client mode hands the table the full array and
 * it sorts, filters and paginates in the browser. Server mode is the same
 * component with `manualPagination`/`manualSorting`/`manualFiltering` and a
 * `rowCount`: the table then renders the page it is given and *reports* state
 * changes through the `on…Change` handlers, which is what a query hook turns
 * into request parameters. Nothing about the rendering changes, so a screen can
 * switch modes without switching components.
 *
 * State is optionally controlled: pass a slice (`sorting`, `pagination`,
 * `globalFilter`) and its handler to own it, pass neither and the table keeps it
 * internally. That is how F021 will persist column preferences and how F022
 * will round-trip state through the URL.
 */

/**
 * The feature set every table in this application shares. Declared once so a
 * page cannot accidentally ship a table that sorts but cannot filter.
 */
/**
 * The faceted filter's filter function: the state is an array of selected
 * values, and a row matches when its value is in that array — whether the
 * column holds one value (`role: 'admin'`) or several (`roles: ['admin', …]`).
 *
 * The built-in `arrIncludesSome` looks similar but is only correct for
 * array-valued columns: given a scalar it returns false for every row, which
 * looks like a filter that silently does nothing. This is the kit's own
 * function so no screen has to discover that.
 */
const filterFn_facetIncludes = constructFilterFn({
  filter: (dataValue: unknown, filterValue: unknown) => {
    if (!Array.isArray(filterValue)) return false
    if (Array.isArray(dataValue)) return dataValue.some((value) => filterValue.includes(value))
    return filterValue.includes(dataValue)
  },
  autoRemove: (value: unknown) => !Array.isArray(value) || value.length === 0,
})

export const dataTableFeatures = tableFeatures({
  // The built-in filter and sort functions are registered by name, which is
  // also what makes `'includesString'`/`'facetIncludes'` type-check in a column def.
  filterFns: { ...filterFns, facetIncludes: filterFn_facetIncludes },
  sortFns: { ...sortFns },
  rowSortingFeature,
  // v9 keeps the derived row models in feature *slots*: a feature without its
  // slot factory still exposes state and APIs, but the pipeline silently skips
  // the stage. Only the core model defaults, so every stage we want is wired.
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  // Visibility is a rendering concern (which cells exist), not a preference —
  // the *persistence* of the choice is F021's.
  columnVisibilityFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
})

export type DataTableFeatures = typeof dataTableFeatures
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData>
export type DataTableInstance<TData extends RowData> = ReactTable<DataTableFeatures, TData>

const DEFAULT_PAGE_SIZE = 10

interface DataTableProps<TData extends RowData> {
  columns: ReadonlyArray<DataTableColumn<TData>>
  data: ReadonlyArray<TData>
  /** Accessible name for the table; there is no visible caption by design. */
  label: string
  /** Renders the search box (global filter) in the toolbar. */
  search?: { placeholder?: string; debounceMs?: number }
  /** Filter controls rendered in the toolbar — they read the table from context. */
  filters?: ReactNode
  /** Right-aligned toolbar actions. */
  actions?: ReactNode
  /** Rows are replaced by skeletons while this is true. */
  isLoading?: boolean
  /** Replaces the default "no results" body when there are no rows. */
  emptyState?: ReactNode
  /** `false` hides the footer; otherwise styles the rows-per-page control. */
  showPagination?: boolean
  pageSizeOptions?: readonly number[]
  /** Rows-per-page for an uncontrolled table. */
  initialPageSize?: number
  /** Controlled slices — omit to let the table keep them. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  globalFilter?: string
  onGlobalFilterChange?: OnChangeFn<string>
  /** Server mode: the corresponding slice is not computed locally. */
  manualPagination?: boolean
  manualSorting?: boolean
  manualFiltering?: boolean
  /** Server mode: total rows on the server, so the footer can count them. */
  rowCount?: number
  getRowId?: (row: TData) => string
  className?: string
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  label,
  search,
  filters,
  actions,
  isLoading = false,
  emptyState,
  showPagination = true,
  pageSizeOptions,
  initialPageSize = DEFAULT_PAGE_SIZE,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  globalFilter,
  onGlobalFilterChange,
  manualPagination = false,
  manualSorting = false,
  manualFiltering = false,
  rowCount,
  getRowId,
  className,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    // Only defined slices are passed: TanStack treats a state slice without a
    // change handler as read-only, so an accidental half-controlled table
    // would simply stop sorting.
    state: {
      ...(sorting !== undefined ? { sorting } : {}),
      ...(pagination !== undefined ? { pagination } : {}),
      ...(globalFilter !== undefined ? { globalFilter } : {}),
    },
    ...(onSortingChange ? { onSortingChange } : {}),
    ...(onPaginationChange ? { onPaginationChange } : {}),
    ...(onGlobalFilterChange ? { onGlobalFilterChange } : {}),
    globalFilterFn: 'includesString',
    manualPagination,
    manualSorting,
    manualFiltering,
    ...(rowCount !== undefined ? { rowCount } : {}),
    ...(getRowId ? { getRowId } : {}),
    initialState: { pagination: { pageIndex: 0, pageSize: initialPageSize } },
  })

  const rows = table.getRowModel().rows
  const columnCount = table.getAllLeafColumns().length
  const showToolbar = search !== undefined || filters !== undefined || actions !== undefined

  return (
    <DataTableContext.Provider value={table}>
      <div data-slot="data-table" className={cn('space-y-4', className)}>
        {showToolbar ? (
          <DataTableToolbar
            {...(search !== undefined ? { search } : {})}
            {...(filters !== undefined ? { filters } : {})}
            {...(actions !== undefined ? { actions } : {})}
          />
        ) : null}

        <div className="rounded-lg border" aria-busy={isLoading}>
          {isLoading ? (
            <span role="status" className="sr-only">
              Loading rows
            </span>
          ) : null}
          <TablePrimitive aria-label={label}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
                        {...(sorted === 'asc'
                          ? { 'aria-sort': 'ascending' as const }
                          : sorted === 'desc'
                            ? { 'aria-sort': 'descending' as const }
                            : {})}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows rows={Math.min(initialPageSize, 5)} columns={columnCount} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={Math.max(columnCount, 1)} className="p-0">
                    {emptyState ?? (
                      <EmptyState
                        title="No results"
                        description="Nothing matches the current filters."
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </TablePrimitive>
        </div>

        {showPagination ? (
          <DataTablePagination
            {...(pageSizeOptions !== undefined ? { pageSizeOptions } : {})}
          />
        ) : null}
      </div>
    </DataTableContext.Provider>
  )
}

function SkeletonRows({ rows, columns }: { rows: number; columns: number }) {
  return Array.from({ length: Math.max(rows, 1) }, (_, rowIndex) => (
    <TableRow key={rowIndex}>
      {Array.from({ length: Math.max(columns, 1) }, (_, columnIndex) => (
        <TableCell key={columnIndex}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ))
}
