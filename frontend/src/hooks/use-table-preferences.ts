import { useCallback, useEffect, useRef, useState } from 'react'
import type { OnChangeFn } from '@tanstack/react-table'

import {
  DEFAULT_TABLE_PREFERENCES,
  getTablePreferencesStore,
} from '@/components/data-table/table-preferences'
import type { TablePreferences } from '@/components/data-table/table-preferences'

export interface UseTablePreferencesResult extends TablePreferences {
  onColumnVisibilityChange: OnChangeFn<TablePreferences['columnVisibility']>
  onColumnOrderChange: OnChangeFn<TablePreferences['columnOrder']>
  /** Back to every column visible, in the defined order — and forget the stored copy. */
  reset: () => void
}

/**
 * A table's column preferences, remembered across reloads (F021, §5.3b).
 *
 * The returned object spreads straight into the DataTable, which is the whole
 * point of the shape:
 *
 * ```tsx
 * const preferences = useTablePreferences('admin-users')
 * <DataTable
 *   label="Users"
 *   columns={columns}
 *   data={rows}
 *   actions={<DataTableViewOptions onReset={preferences.reset} />}
 *   {...preferences}
 * />
 * ```
 *
 * The store is read once per table key (lazily, so the first render already has
 * the saved state and the table never flashes its defaults), and written on
 * every change — including a cleared one, which removes the entry rather than
 * storing the defaults: "no preference" and "preference equal to defaults" are
 * the same thing, and the smaller record is the honest one.
 */
export function useTablePreferences(tableKey: string): UseTablePreferencesResult {
  const [preferences, setPreferences] = useState<TablePreferences>(
    () => getTablePreferencesStore().load(tableKey) ?? DEFAULT_TABLE_PREFERENCES,
  )
  const loadedKey = useRef(tableKey)

  // A component that survives a key change (a detail route switching ids) must
  // not carry the previous table's columns into the next one.
  useEffect(() => {
    if (loadedKey.current === tableKey) return
    loadedKey.current = tableKey
    setPreferences(getTablePreferencesStore().load(tableKey) ?? DEFAULT_TABLE_PREFERENCES)
  }, [tableKey])

  const persist = useCallback(
    (next: TablePreferences) => {
      setPreferences(next)
      const store = getTablePreferencesStore()
      if (Object.keys(next.columnVisibility).length === 0 && next.columnOrder.length === 0) {
        store.clear(tableKey)
      } else {
        store.save(tableKey, next)
      }
    },
    [tableKey],
  )

  const onColumnVisibilityChange = useCallback<OnChangeFn<TablePreferences['columnVisibility']>>(
    (updater) => {
      persist({
        ...preferences,
        columnVisibility:
          typeof updater === 'function' ? updater(preferences.columnVisibility) : updater,
      })
    },
    [persist, preferences],
  )

  const onColumnOrderChange = useCallback<OnChangeFn<TablePreferences['columnOrder']>>(
    (updater) => {
      persist({
        ...preferences,
        columnOrder: typeof updater === 'function' ? updater(preferences.columnOrder) : updater,
      })
    },
    [persist, preferences],
  )

  const reset = useCallback(() => {
    persist(DEFAULT_TABLE_PREFERENCES)
  }, [persist])

  return {
    columnVisibility: preferences.columnVisibility,
    columnOrder: preferences.columnOrder,
    onColumnVisibilityChange,
    onColumnOrderChange,
    reset,
  }
}
