import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Light / dark / system theme, persisted across reloads.
 *
 * Why not `next-themes`: BIG-PROMPT §2.1 allows it only if verified to work in a
 * Vite SPA, otherwise "use an equally small framework-agnostic theme provider and
 * document this exception". next-themes exists to bridge Next.js's server/ client
 * theme split; this project has no Next.js, no SSR and no hydration, so the whole
 * problem reduces to reading a stored value and toggling a class. That is smaller
 * than the dependency's surface, and it keeps the anti-flash script below in our
 * own hands. See docs/ARCHITECTURE.md §5 and docs/STACK_VERSIONS.md.
 *
 * The mode is stored in localStorage so it is available on the very first paint.
 * Syncing it to the server-side `user_preferences` record is F048's job; §7.6
 * lists the theme choice as a server preference, so when that lands the local
 * value remains the first-paint source and the server value reconciles after
 * sign-in.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Kept in sync by hand with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'app.theme'

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Pure so it can be reasoned about (and tested) without a DOM. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light'
  }
  return mode
}

function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    // Private mode or a blocked storage API: fall back rather than break the app.
    return 'system'
  }
}

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  // Keeps native UI (scrollbars, form controls, spinners) in the same theme.
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredMode(), systemPrefersDark()),
  )

  useEffect(() => {
    const resolved = resolveTheme(mode, systemPrefersDark())
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [mode])

  // While in 'system', follow the OS if the user changes it mid-session.
  useEffect(() => {
    if (mode !== 'system') {
      return
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      const resolved = resolveTheme('system', query.matches)
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [mode])

  // Another tab changing the theme should not leave this one stale.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== THEME_STORAGE_KEY) {
        return
      }
      setModeState(isThemeMode(event.newValue) ? event.newValue : 'system')
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    if (isThemeMode(next)) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Storage unavailable: the theme still applies for this session.
      }
    }
    setModeState(isThemeMode(next) ? next : 'system')
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider')
  }
  return context
}
