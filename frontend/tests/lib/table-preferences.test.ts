import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ANONYMOUS_SCOPE,
  createLocalTablePreferencesStore,
  createServerTablePreferencesStore,
  DEFAULT_TABLE_PREFERENCES,
  getTablePreferencesStore,
  setTablePreferencesStore,
  TABLE_PREFERENCES_PREFIX,
} from '@/components/data-table'
import type { TablePreferences, TablePreferencesWriter } from '@/components/data-table'

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

/**
 * F048's store. Its two jobs are what the sync provider depends on: `load` must
 * answer **synchronously** from the hydrated snapshot (the hook reads it in a
 * `useState` initialiser, which is what keeps a table from flashing its
 * defaults), and every write must reach the server through the writer.
 */
describe('server table preferences store', () => {
  function writerSpy(): TablePreferencesWriter & {
    put: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  } {
    return {
      put: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    }
  }

  it('answers synchronously from the seeded snapshot', () => {
    const store = createServerTablePreferencesStore({ 'admin-users': SAVED }, writerSpy())

    expect(store.load('admin-users')).toEqual(SAVED)
    // A table the account has no layout for is "no preference", not "defaults".
    expect(store.load('admin-audit')).toBeNull()
  })

  it('saves into the snapshot and writes through to the server', () => {
    const writer = writerSpy()
    const store = createServerTablePreferencesStore({}, writer)

    store.save('admin-users', SAVED)

    // The in-memory copy is updated first — the UI must not wait on the network
    // to reflect the user's own click.
    expect(store.load('admin-users')).toEqual(SAVED)
    expect(writer.put).toHaveBeenCalledExactlyOnceWith('admin-users', SAVED)
    expect(writer.remove).not.toHaveBeenCalled()
  })

  it('clears the entry and deletes the server key', () => {
    const writer = writerSpy()
    const store = createServerTablePreferencesStore({ 'admin-users': SAVED }, writer)

    store.clear('admin-users')

    expect(store.load('admin-users')).toBeNull()
    expect(writer.remove).toHaveBeenCalledExactlyOnceWith('admin-users')
    expect(writer.put).not.toHaveBeenCalled()
  })

  it('keeps two accounts apart — two stores never share state', () => {
    const ada = createServerTablePreferencesStore({}, writerSpy())
    const grace = createServerTablePreferencesStore({}, writerSpy())

    ada.save('admin-users', SAVED)

    expect(ada.load('admin-users')).toEqual(SAVED)
    expect(grace.load('admin-users')).toBeNull()
  })
})
