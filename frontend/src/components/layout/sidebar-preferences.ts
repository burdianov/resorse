/**
 * Sidebar and navigation-group preferences, persisted locally.
 *
 * BIG-PROMPT §4.9 requires "persistent group/sidebar state". The theme sets the
 * precedent (F010): the preference lives in localStorage, not a cookie — this is
 * a client-only SPA with no server render to seed (ARCHITECTURE §2). Server-side
 * `user_preferences` sync, if it ever covers layout, belongs to F048.
 *
 * Storage is best-effort on both sides: private mode or a blocked Storage API
 * must not break the shell, so every access is guarded and falls back to the
 * in-memory default.
 */

/** Collapse preference for the pinned (desktop/tablet) sidebar. */
export const SIDEBAR_STORAGE_KEY = 'app.sidebar'

/** Per-group open/closed state, keyed by nav group id. */
export const SIDEBAR_GROUPS_STORAGE_KEY = 'app.sidebar.groups'

/** Source tablet band (§1.2): pinned sidebar, but auto-collapsed on first load. */
const TABLET_MIN = 768
const TABLET_MAX = 1023

export function isTabletViewport(width: number): boolean {
  return width >= TABLET_MIN && width <= TABLET_MAX
}

export function readStoredSidebarOpen(): boolean | null {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === 'expanded') return true
    if (stored === 'collapsed') return false
    return null
  } catch {
    return null
  }
}

export function writeStoredSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'expanded' : 'collapsed')
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}

/**
 * A stored preference always wins; the viewport only decides the very first
 * load, where the source auto-collapses on tablet widths (§1.2: "respecting
 * first-load viewport"). The reference re-forces the viewport default on every
 * load and resize, which silently discards the user's choice — this is the
 * corrected reading.
 */
export function resolveInitialSidebarOpen(
  viewportWidth: number,
  stored: boolean | null = readStoredSidebarOpen(),
): boolean {
  if (stored !== null) return stored
  return !isTabletViewport(viewportWidth)
}

export function readStoredGroupState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const state: Record<string, boolean> = {}
    for (const [id, open] of Object.entries(parsed)) {
      if (typeof open === 'boolean') state[id] = open
    }
    return state
  } catch {
    return {}
  }
}

export function writeStoredGroupState(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}
