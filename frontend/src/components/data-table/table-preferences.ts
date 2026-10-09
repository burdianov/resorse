import type { ColumnOrderState, ColumnVisibilityState } from '@tanstack/react-table'

/**
 * Where a table's column preferences live (BIG-PROMPT §5.3b, F021).
 *
 * The requirement is that visibility and order are remembered **per table key,
 * per user**, and resettable to the defaults. Today the only place they can be
 * remembered is this browser — `localStorage` — because the server half
 * (`user_preferences`, the API in F041 and the sync in F048) does not exist yet.
 * So the deliverable is the *abstraction*: a store interface with a local
 * implementation behind it, and the seam F048 replaces.
 *
 * **The key is `prefix.scope.tableKey`.** `scope` identifies the user; until
 * F032 supplies a session it is `anonymous`, which is the honest answer rather
 * than a placeholder — there is no one else to be. When the session lands, the
 * scope becomes the user id and two accounts on one machine stop sharing
 * preferences; the isolation test proves the mechanism works at that boundary
 * today.
 *
 * Storage is treated as hostile: it is user-writable, may hold another
 * version's shape, and throws in private mode. A corrupt or unreadable entry
 * means "no saved preference", never a crash — the theme provider (F010) set
 * the same precedent for the same reason.
 */
export interface TablePreferences {
  /** Column id → visible? Absent ids are visible (TanStack's default). */
  columnVisibility: ColumnVisibilityState
  /** Column ids in display order; columns not listed keep their defined order. */
  columnOrder: ColumnOrderState
}

/** No saved preference: every column visible, defined order. */
export const DEFAULT_TABLE_PREFERENCES: TablePreferences = {
  columnVisibility: {},
  columnOrder: [],
}

export interface TablePreferencesStore {
  load(tableKey: string): TablePreferences | null
  save(tableKey: string, preferences: TablePreferences): void
  clear(tableKey: string): void
}

export const TABLE_PREFERENCES_PREFIX = 'app.table'

/** Until F032 supplies a session, every browser user is the same anonymous one. */
export const ANONYMOUS_SCOPE = 'anonymous'

function storageKey(scope: string, tableKey: string): string {
  return `${TABLE_PREFERENCES_PREFIX}.${scope}.${tableKey}`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isVisibilityState(value: unknown): value is ColumnVisibilityState {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'boolean')
  )
}

/** Anything unrecognised reads as "nothing saved", not as a broken table. */
function parsePreferences(raw: string): TablePreferences | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    // An array is an object to `typeof`, and it is never a preferences record.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const columnVisibility = record['columnVisibility']
    const columnOrder = record['columnOrder']
    const visibility = isVisibilityState(columnVisibility) ? columnVisibility : {}
    const order = isStringArray(columnOrder) ? columnOrder : []
    return { columnVisibility: visibility, columnOrder: order }
  } catch {
    return null
  }
}

/** The local (per-browser) store. F048 swaps in the server-backed one. */
export function createLocalTablePreferencesStore({
  scope = ANONYMOUS_SCOPE,
}: { scope?: string } = {}): TablePreferencesStore {
  return {
    load(tableKey) {
      try {
        const raw = window.localStorage.getItem(storageKey(scope, tableKey))
        return raw === null ? null : parsePreferences(raw)
      } catch {
        // Private mode or a blocked storage API: behave as if nothing is saved.
        return null
      }
    },

    save(tableKey, preferences) {
      try {
        window.localStorage.setItem(
          storageKey(scope, tableKey),
          JSON.stringify({
            columnVisibility: preferences.columnVisibility,
            columnOrder: preferences.columnOrder,
          }),
        )
      } catch {
        // Quota or private mode: losing the preference is not worth an error.
      }
    },

    clear(tableKey) {
      try {
        window.localStorage.removeItem(storageKey(scope, tableKey))
      } catch {
        // As above.
      }
    },
  }
}

let store: TablePreferencesStore = createLocalTablePreferencesStore()

export function getTablePreferencesStore(): TablePreferencesStore {
  return store
}

/**
 * Replace the store — F048's server-backed implementation, or a test double.
 * Passing `null` restores the default local store.
 */
export function setTablePreferencesStore(next: TablePreferencesStore | null): void {
  store = next ?? createLocalTablePreferencesStore()
}
