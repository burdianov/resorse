/**
 * The DataTable toolkit (BIG-PROMPT §5.3, §1.1).
 *
 * Delivered by F020: the table itself, the toolbar, sortable column headers,
 * the pagination bar and the faceted filter with its chips. Still to come, and
 * owned elsewhere on purpose: `data-table-view-options` in **F021** (column
 * visibility and order need the preferences abstraction), `data-table-row-actions`
 * with its first consumer (**F034**'s user list), and CSV/Excel import-export in
 * **F022**. Nothing here is a stub — each file shipped is used by the tests and
 * by the next tasks, and the deferred ones are absent rather than inert.
 */
export { DataTable, dataTableFeatures } from './data-table'
export { useDataTable } from './data-table-context'
export type { DataTableColumn, DataTableFeatures, DataTableInstance } from './data-table'
export { DataTableToolbar } from './data-table-toolbar'
export { DataTableColumnHeader } from './data-table-column-header'
export { DataTablePagination } from './data-table-pagination'
export { DataTableFacetedFilter } from './data-table-faceted-filter'
export type { FacetedFilterOption } from './data-table-faceted-filter'
