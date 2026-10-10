import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { LoadingState } from '@/components/common/loading-state'
import {
  createServerTablePreferencesStore,
  serializeTablePreferences,
  setTablePreferencesStore,
} from '@/components/data-table'
import type { TablePreferencesStore, TablePreferencesWriter } from '@/components/data-table'
import { isThemeMode, useTheme } from '@/components/providers/theme-provider'
import type { ThemeMode } from '@/components/providers/theme-provider'
import { useAuth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import {
  THEME_PREFERENCE_KEY,
  deletePreference,
  fetchPreferences,
  putPreference,
  tablePreferenceKey,
  tablePreferencesFromItems,
} from '@/lib/preferences'
import type { PreferenceItem } from '@/lib/generated/api'
import { queryKeys } from '@/lib/query-keys'

/**
 * The signed-in account's server preferences, reconciled once per session
 * (F048, BIG-PROMPT §5.3b and §7.6).
 *
 * F021 built the table-preference seam and F041 built the API; this provider is
 * the join. On each authenticated identity it reads
 * `GET /auth/me/preferences` **once**, installs a server-backed
 * `TablePreferencesStore` seeded from that snapshot, and adopts the account's
 * theme. Two consequences are deliberate:
 *
 * - **The shell waits for the snapshot.** The store's `load` must answer
 *   synchronously for the first render to carry the saved columns — that is
 *   what stops a table flashing "every column visible" and then snapping. The
 *   wait is one request, once per identity (the query is `staleTime: Infinity`,
 *   so navigating afterwards never re-gates), and F032's identity change clears
 *   the cache, so the next account re-reads rather than inheriting.
 * - **A failure never blocks and never signs anyone out.** If the snapshot
 *   cannot be read, the shell renders with the default local store — the same
 *   posture F032 takes for `/auth/me`. Preferences are display data; losing
 *   them for a session is a cosmetic cost, and the cold-failure toast policy
 *   (§4 of `docs/OPENAPI_CLIENT.md`) keeps the query layer quiet about it.
 *
 * **Theme** follows the split ARCHITECTURE §5 records: the local value is the
 * first-paint source (it must be — no network runs before paint), and the
 * account's value is adopted once the snapshot lands. A change the user makes
 * is written back; see `THEME_PREFERENCE_KEY`'s contract in C36 for why an
 * account with no stored theme is not force-written with a value nobody chose.
 */

/** Where the table store's writes go. Rejections surface as a toast — a lost
 * column layout should say so rather than silently reverting on the next load. */
function surfaceWriteFailure(error: unknown): void {
  const apiError = toApiError(error)
  // Canceled requests are a navigation, not a failure (F018's rule).
  if (apiError.isCanceled) return
  toast.error(apiError.detail)
}

function themeModeFrom(items: readonly PreferenceItem[]): ThemeMode | null {
  const value = items.find((item) => item.key === THEME_PREFERENCE_KEY)?.value
  return isThemeMode(value) ? value : null
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()

  const userId = auth.user?.id ?? null
  // A forced change outranks preferences: the endpoints are gated (F031), so
  // reading them would 403 and the shell is being redirected away anyway.
  const active = auth.status === 'authenticated' && auth.user?.must_change_password !== true

  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences(userId),
    queryFn: fetchPreferences,
    enabled: active,
    // Read once per identity: preferences are edited on this screen and by this
    // account only, so a background refetch would only risk clobbering an edit.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const snapshot = preferencesQuery.data

  const writer = useMemo<TablePreferencesWriter>(
    () => ({
      async put(tableKey, preferences) {
        try {
          await putPreference(tablePreferenceKey(tableKey), serializeTablePreferences(preferences))
        } catch (error) {
          surfaceWriteFailure(error)
        }
      },
      async remove(tableKey) {
        try {
          await deletePreference(tablePreferenceKey(tableKey))
        } catch (error) {
          surfaceWriteFailure(error)
        }
      },
    }),
    [],
  )

  // The store for this identity, and the install that makes it visible.
  //
  // Ordering is the whole trick. A table reads the store in a `useState`
  // initialiser, so the install has to have happened *before the table's first
  // render* — installing from an effect that runs alongside the children would
  // be a commit too late, and the table would have already initialised from the
  // default store. So the store is memoised (stable across re-renders, so the
  // in-memory copy of an edit outlives the network write), installed from a
  // layout effect, and the children are withheld for exactly the one render
  // between the snapshot arriving and that install committing. Being a layout
  // effect, that render happens before paint: the table's first paint already
  // carries the account's columns, and no loading frame is seen for it.
  const store = useMemo<TablePreferencesStore | null>(
    () =>
      !active || userId === null || snapshot === undefined
        ? null
        : createServerTablePreferencesStore(tablePreferencesFromItems(snapshot.items), writer),
    [active, userId, snapshot, writer],
  )

  const [installed, setInstalled] = useState<TablePreferencesStore | null | undefined>(undefined)
  useLayoutEffect(() => {
    setTablePreferencesStore(store)
    setInstalled(store)
  }, [store])

  // Nothing from one account may survive into the next (belt to the key's
  // suspenders — the query key already carries the id and F032 clears the cache).
  const agreedTheme = useRef<ThemeMode | null>(null)
  useEffect(() => {
    agreedTheme.current = null
  }, [userId])

  // Reconcile the theme, in both directions and once per agreed value.
  useEffect(() => {
    if (!active || snapshot === undefined) return
    const account = themeModeFrom(snapshot.items)
    const agreed = agreedTheme.current

    if (agreed === null && account !== null && account !== themeMode) {
      // First snapshot for this account, and it disagrees with the device:
      // the account wins after first paint, and we mark it agreed so the
      // write-back below does not mirror it straight back to the server.
      agreedTheme.current = account
      setThemeMode(account)
      return
    }

    if (agreed === themeMode || account === themeMode) {
      // Already in agreement — adopting, or the account simply matches.
      agreedTheme.current = themeMode
      return
    }

    if (agreed === null && account === null) {
      // The account has no theme and the user has not chosen one this session:
      // the device's local value stands, and nothing is written (C36).
      agreedTheme.current = themeMode
      return
    }

    agreedTheme.current = themeMode
    void putPreference(THEME_PREFERENCE_KEY, themeMode).catch(surfaceWriteFailure)
  }, [active, snapshot, themeMode, setThemeMode])

  // Wait for the snapshot, and for its install: a table rendered before the
  // store is in place would initialise from the defaults and never look again.
  if (active && (preferencesQuery.isPending || installed !== store)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoadingState label="Loading your preferences" />
      </div>
    )
  }

  return <>{children}</>
}
