/**
 * The DataTable toolkit (BIG-PROMPT §5.3, §1.1).
 *
 * Delivered by F020 (the table, toolbar, sortable headers, pagination, faceted
 * filter), F021 (view options plus the preferences abstraction behind them),
 * F022 (CSV export built on `lib/csv.ts`, which owns the injection guard) and
 * F034 (`data-table-row-actions`, whose first consumer is the user list).
 * CSV/Excel import-export remains F022's later half. Nothing here is a stub —
 * each file shipped is used by the tests and by the next tasks.
 */
export { DataTable, dataTableFeatures } from './data-table'
export { useDataTable } from './data-table-context'
export type { DataTableColumn, DataTableFeatures, DataTableInstance } from './data-table'
export { DataTableToolbar } from './data-table-toolbar'
export { DataTableColumnHeader } from './data-table-column-header'
export { DataTablePagination } from './data-table-pagination'
export { DataTableRowActions } from './data-table-row-actions'
export { DataTableFacetedFilter } from './data-table-faceted-filter'
export type { FacetedFilterOption } from './data-table-faceted-filter'
export { DataTableViewOptions } from './data-table-view-options'
export { exportTableCsv, exportTableCsvTemplate, csvColumnsFromTable } from './data-table-export'
export {
  ANONYMOUS_SCOPE,
  createLocalTablePreferencesStore,
  DEFAULT_TABLE_PREFERENCES,
  getTablePreferencesStore,
  setTablePreferencesStore,
  TABLE_PREFERENCES_PREFIX,
} from './table-preferences'
export type { TablePreferences, TablePreferencesStore } from './table-preferences'
