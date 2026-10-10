import type { ColumnOrderState, ColumnVisibilityState } from '@tanstack/react-table'

/**
 * Where a table's column preferences live (BIG-PROMPT §5.3b, F021/F048).
 *
 * The requirement is that visibility and order are remembered **per table key,
 * per user**, and resettable to the defaults. F048 completes it: the server's
 * `user_preferences` (`app.table.<tableKey>`, F041's API) is now the store a
 * signed-in user writes to, seeded once per session by `PreferencesProvider`,
 * so the same account sees the same columns on any machine and two accounts on
 * one machine cannot share.
 *
 * **Two implementations, one interface.** `createLocalTablePreferencesStore`
 * is the per-browser store (still the module default, and what a page rendered
 * outside the provider — a test, or the anonymous shell — reads).
 * `createServerTablePreferencesStore` is the server-backed one: the hydrated
 * snapshot lives **in memory** so `load` stays synchronous (the hook's whole
 * design is that the first render already has the saved state and the table
 * never flashes its defaults), while `save`/`clear` write through to the API.
 *
 * **The server key is `app.table.<tableKey>`.** The user is the session — the
 * preferences API is scoped by construction (F041) and no user id is ever sent
 * — so the server spelling carries no scope segment. The local store's
 * `prefix.scope.tableKey` spelling remains for the per-browser fallback.
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

/** Where the server-backed store sends its writes (F048). */
export interface TablePreferencesWriter {
  put(tableKey: string, preferences: TablePreferences): Promise<void>
  remove(tableKey: string): Promise<void>
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

/** Unusable fields are dropped and the record kept — a stale shape is not a
 * crash, it is "that part was never saved". */
export function coerceTablePreferences(value: unknown): TablePreferences {
  const record = value as Record<string, unknown>
  const columnVisibility = record['columnVisibility']
  const columnOrder = record['columnOrder']
  return {
    columnVisibility: isVisibilityState(columnVisibility) ? columnVisibility : {},
    columnOrder: isStringArray(columnOrder) ? columnOrder : [],
  }
}

/** Anything unrecognised reads as "nothing saved", not as a broken table.
 * A record arrives from the server as JSON already parsed; the local store
 * parses a string first. Both paths end at `coerceTablePreferences`. */
export function parseTablePreferences(raw: string): TablePreferences | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return toTablePreferences(parsed)
  } catch {
    return null
  }
}

/** A stored value that is not a JSON object is not a preferences record: an
 * array is an object to `typeof`, and a scalar never was one. */
export function toTablePreferences(value: unknown): TablePreferences | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return coerceTablePreferences(value)
}

/** The one shape a table preference is stored in, both locally and on the
 * server: the two fields, nothing else. */
export function serializeTablePreferences(preferences: TablePreferences): {
  columnVisibility: ColumnVisibilityState
  columnOrder: ColumnOrderState
} {
  return {
    columnVisibility: preferences.columnVisibility,
    columnOrder: preferences.columnOrder,
  }
}

/** The local (per-browser) store — the module default, and the fallback when
 * no server-backed store is installed (F048's `PreferencesProvider` installs
 * one for a signed-in account). */
export function createLocalTablePreferencesStore({
  scope = ANONYMOUS_SCOPE,
}: { scope?: string } = {}): TablePreferencesStore {
  return {
    load(tableKey) {
      try {
        const raw = window.localStorage.getItem(storageKey(scope, tableKey))
        return raw === null ? null : parseTablePreferences(raw)
      } catch {
        // Private mode or a blocked storage API: behave as if nothing is saved.
        return null
      }
    },

    save(tableKey, preferences) {
      try {
        window.localStorage.setItem(
          storageKey(scope, tableKey),
          JSON.stringify(serializeTablePreferences(preferences)),
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

/**
 * The server-backed store (F048).
 *
 * `seed` is the snapshot `PreferencesProvider` read from
 * `GET /auth/me/preferences` for the signed-in account; it lives in a plain
 * `Map` so `load` answers **synchronously** — the hook's first render already
 * has the saved columns, which is the property that made a gate in front of
 * the shell worth having. Writes update the map first (the UI must not wait on
 * the network to reflect the user's own click) and then go to the server
 * through `writer`, whose rejections are the writer's to surface.
 *
 * "No preference" is the same record as "defaults": `clear` removes the entry
 * and deletes the server key, and the hook only ever calls it for an empty
 * record.
 */
export function createServerTablePreferencesStore(
  seed: Record<string, TablePreferences>,
  writer: TablePreferencesWriter,
): TablePreferencesStore {
  const cache = new Map<string, TablePreferences>(Object.entries(seed))

  return {
    load(tableKey) {
      return cache.get(tableKey) ?? null
    },

    save(tableKey, preferences) {
      cache.set(tableKey, preferences)
      void writer.put(tableKey, preferences)
    },

    clear(tableKey) {
      cache.delete(tableKey)
      void writer.remove(tableKey)
    },
  }
}
