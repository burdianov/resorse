import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ANONYMOUS_SCOPE,
  createLocalTablePreferencesStore,
  DEFAULT_TABLE_PREFERENCES,
  getTablePreferencesStore,
  setTablePreferencesStore,
  TABLE_PREFERENCES_PREFIX,
} from '@/components/data-table'
import type { TablePreferences } from '@/components/data-table'

/**
 * The storage boundary behind F021. It is treated as hostile on purpose:
 * `localStorage` is user-writable and throws in private mode, so every failure
 * has to degrade to "no saved preference" rather than a broken table.
 */
const SAVED: TablePreferences = {
  columnVisibility: { email: false },
  columnOrder: ['status', 'name', 'email', 'role'],
}

afterEach(() => {
  window.localStorage.clear()
  setTablePreferencesStore(null)
})

describe('local table preferences store', () => {
  it('round-trips visibility and order under a scoped key', () => {
    const store = createLocalTablePreferencesStore({ scope: 'user-1' })

    store.save('admin-users', SAVED)

    expect(store.load('admin-users')).toEqual(SAVED)
    expect(window.localStorage.getItem(`${TABLE_PREFERENCES_PREFIX}.user-1.admin-users`)).not.toBeNull()
  })

  it('has nothing to say about a table it has never seen', () => {
    expect(createLocalTablePreferencesStore().load('never-opened')).toBeNull()
  })

  it.each([
    ['not json', 'oops'],
    ['a json scalar', '42'],
    ['an array', '[1,2,3]'],
    ['an empty file', ''],
  ])('reads %s as no preference at all', (_label, raw) => {
    window.localStorage.setItem(`${TABLE_PREFERENCES_PREFIX}.${ANONYMOUS_SCOPE}.weird`, raw)

    expect(createLocalTablePreferencesStore().load('weird')).toBeNull()
  })

  it('drops unusable fields but keeps the record — a stale shape is not a crash', () => {
    window.localStorage.setItem(
      `${TABLE_PREFERENCES_PREFIX}.${ANONYMOUS_SCOPE}.stale`,
      JSON.stringify({ columnVisibility: { email: 'yes' }, columnOrder: [1, 2] }),
    )

    expect(createLocalTablePreferencesStore().load('stale')).toEqual({
      columnVisibility: {},
      columnOrder: [],
    })
  })

  it('ignores a partially valid record rather than failing the whole load', () => {
    window.localStorage.setItem(
      `${TABLE_PREFERENCES_PREFIX}.${ANONYMOUS_SCOPE}.partial`,
      JSON.stringify({ columnVisibility: { email: false }, columnOrder: 'nope' }),
    )

    expect(createLocalTablePreferencesStore().load('partial')).toEqual({
      columnVisibility: { email: false },
      columnOrder: [],
    })
  })

  it('keeps two scopes apart — the user boundary F032 will start using', () => {
    const first = createLocalTablePreferencesStore({ scope: 'user-1' })
    const second = createLocalTablePreferencesStore({ scope: 'user-2' })
    first.save('admin-users', SAVED)

    expect(first.load('admin-users')).toEqual(SAVED)
    expect(second.load('admin-users')).toBeNull()
  })

  it('keeps two table keys apart', () => {
    const store = createLocalTablePreferencesStore()
    store.save('admin-users', SAVED)

    expect(store.load('admin-audit')).toBeNull()
  })

  it('clears a saved preference', () => {
    const store = createLocalTablePreferencesStore()
    store.save('admin-users', SAVED)

    store.clear('admin-users')

    expect(store.load('admin-users')).toBeNull()
  })

  it('swallows a storage that refuses to be read or written', () => {
    const failing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const spy = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(failing as unknown as Storage)
    const store = createLocalTablePreferencesStore()

    expect(() => {
      store.save('admin-users', SAVED)
      store.clear('admin-users')
    }).not.toThrow()
    expect(store.load('admin-users')).toBeNull()
    spy.mockRestore()
  })

  it('is replaceable — the seam F048 will swap for the server store', () => {
    const double = {
      load: vi.fn(() => SAVED),
      save: vi.fn(),
      clear: vi.fn(),
    }
    setTablePreferencesStore(double)

    expect(getTablePreferencesStore().load('anything')).toEqual(SAVED)
    expect(getTablePreferencesStore()).toBe(double)
  })

  it('defaults to "everything visible, defined order"', () => {
    expect(DEFAULT_TABLE_PREFERENCES).toEqual({ columnVisibility: {}, columnOrder: [] })
  })
})
