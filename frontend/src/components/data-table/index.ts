/**
 * The DataTable toolkit (BIG-PROMPT §5.3, §1.1).
 *
 * Delivered by F020 (the table, toolbar, sortable headers, pagination, faceted
 * filter), F021 (view options plus the preferences abstraction behind them) and
 * F022 (CSV export built on `lib/csv.ts`, which owns the injection guard).
 * Still to come, and owned elsewhere on purpose: `data-table-row-actions` with
 * its first consumer (**F034**'s user list) and CSV/Excel import-export in
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
