import { api } from '@/lib/api'
import { toTablePreferences } from '@/components/data-table'
import type { TablePreferences } from '@/components/data-table'
import type { PreferenceItem, PreferencesResponse } from '@/lib/generated/api'

/**
 * The `user_preferences` API and the key vocabulary this app stores (F048).
 *
 * F041 built the three endpoints; this module is the one place the frontend
 * names the keys it owns, calls the API, and turns the snapshot into the shapes
 * its consumers want — table preferences here, the theme in
 * `PreferencesProvider`. Nothing else may hand-build a preference key: a
 * second spelling of `app.theme` would be a second preference the user never
 * set.
 *
 * **Keys obey the model's shape** (`^[a-z][a-z0-9_.-]*$`, ≤100 chars — F041's
 * two-layer guard, recorded in `docs/CARRIED_CONSTRAINTS.md` §6): the table
 * keys the admin screens already use (`admin-users`, `admin-audit`, …) satisfy
 * it, so the server spelling is `app.table.<tableKey>` exactly. The user is
 * the session — the endpoints are scoped by construction and take no user id —
 * which is why no scope segment appears on the wire.
 *
 * `PreferencesProvider` owns the lifetime: it fetches once per signed-in
 * account, seeds the table store and the theme from the snapshot, and writes
 * every change back. These functions are the wire; they hold no state.
 */

/** The theme choice (`light`/`dark`/`system`) as a server preference (§7.6). */
export const THEME_PREFERENCE_KEY = 'app.theme'

/** One table's column layout; the server spelling of `useTablePreferences`'s key. */
export function tablePreferenceKey(tableKey: string): string {
  return `app.table.${tableKey}`
}

export const TABLE_PREFERENCE_KEY_PREFIX = 'app.table.'

export function fetchPreferences(): Promise<PreferencesResponse> {
  return api.get<PreferencesResponse>('/api/v1/auth/me/preferences')
}

export function putPreference(key: string, value: unknown): Promise<PreferenceItem> {
  return api.put<PreferenceItem>(`/api/v1/auth/me/preferences/${encodeURIComponent(key)}`, {
    value,
  })
}

export function deletePreference(key: string): Promise<void> {
  return api.delete<void>(`/api/v1/auth/me/preferences/${encodeURIComponent(key)}`)
}

/**
 * The snapshot's table preferences, keyed by the app's own table key.
 *
 * A `app.table.*` entry whose value is not a preferences object is skipped
 * (`toTablePreferences` returns null for a scalar or an array) rather than
 * becoming an empty record: "this key holds something else" and "this table
 * has no saved layout" are different answers, and only the second should make
 * the table fall back to its defaults.
 */
export function tablePreferencesFromItems(
  items: readonly PreferenceItem[],
): Record<string, TablePreferences> {
  const tables: Record<string, TablePreferences> = {}
  for (const item of items) {
    if (!item.key.startsWith(TABLE_PREFERENCE_KEY_PREFIX)) continue
    const tableKey = item.key.slice(TABLE_PREFERENCE_KEY_PREFIX.length)
    if (tableKey === '') continue
    const preferences = toTablePreferences(item.value)
    if (preferences !== null) tables[tableKey] = preferences
  }
  return tables
}
