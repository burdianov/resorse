import { describe, expect, it } from 'vitest'

import {
  TABLE_PREFERENCE_KEY_PREFIX,
  THEME_PREFERENCE_KEY,
  tablePreferenceKey,
  tablePreferencesFromItems,
} from '@/lib/preferences'

/**
 * The key vocabulary F048 owns (C36). One spelling per preference, and every
 * spelling inside the server's own key shape (F041's model pattern, mirrored
 * here) — a key the API would answer 422 to is a preference that could never
 * be stored, so it is worth pinning at the boundary rather than discovering it
 * as a failed write.
 */
const SERVER_KEY_PATTERN = /^[a-z][a-z0-9_.-]*$/
const MAX_KEY_LENGTH = 100

describe('preference keys', () => {
  it('names the theme within the server key shape', () => {
    expect(THEME_PREFERENCE_KEY).toBe('app.theme')
    expect(THEME_PREFERENCE_KEY).toMatch(SERVER_KEY_PATTERN)
  })

  it('names every table key inside the server key shape', () => {
    // The keys the shipped admin screens use; a new screen must satisfy this
    // too, which is why the prefix is a constant and not a literal at call sites.
    for (const tableKey of ['admin-users', 'admin-permissions', 'admin-roles', 'admin-audit']) {
      const key = tablePreferenceKey(tableKey)
      expect(key).toBe(`app.table.${tableKey}`)
      expect(key).toMatch(SERVER_KEY_PATTERN)
      expect(key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH)
    }
  })
})

describe('tablePreferencesFromItems', () => {
  it('keeps the app.table entries, keyed by the app table key', () => {
    const tables = tablePreferencesFromItems([
      {
        key: 'app.table.admin-users',
        value: { columnVisibility: { email: false }, columnOrder: ['status', 'full_name'] },
      },
      { key: 'app.theme', value: 'dark' },
      { key: 'display.density', value: 'compact' },
    ])

    expect(Object.keys(tables)).toEqual(['admin-users'])
    expect(tables['admin-users']).toEqual({
      columnVisibility: { email: false },
      columnOrder: ['status', 'full_name'],
    })
  })

  it('skips a table key whose value is not a layout at all', () => {
    // "Holds something else" and "holds no layout" are different answers: only
    // the second should leave a table on its defaults.
    const tables = tablePreferencesFromItems([
      { key: 'app.table.broken', value: 'not-a-layout' },
      { key: 'app.table.list', value: [1, 2, 3] },
      { key: 'app.table.blank', value: null },
    ])

    expect(tables).toEqual({})
  })

  it('drops unusable fields but keeps the record', () => {
    const tables = tablePreferencesFromItems([
      {
        key: 'app.table.partial',
        value: { columnVisibility: { email: 'yes' }, columnOrder: ['name'] },
      },
    ])

    expect(tables['partial']).toEqual({ columnVisibility: {}, columnOrder: ['name'] })
  })

  it('ignores the bare prefix with no table key', () => {
    expect(tablePreferencesFromItems([{ key: TABLE_PREFERENCE_KEY_PREFIX, value: {} }])).toEqual({})
  })
})
