import { useTheme } from '@/components/providers/theme-provider'
import type { ThemeMode } from '@/components/providers/theme-provider'

const OPTIONS: ReadonlyArray<{ mode: ThemeMode; label: string }> = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
]

/**
 * Three-way theme control. Styled with the semantic tokens themselves, so it
 * repaints with the theme it controls.
 *
 * F010 keeps it deliberately plain — the UI primitives arrive in F011–F014 and
 * the toolbar placement in F015, at which point this becomes a Select or a
 * Button group. It exists now so the persistence in this task is exercisable.
 */
export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted p-1"
    >
      {OPTIONS.map((option) => {
        const active = mode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setMode(option.mode)
            }}
            className={
              active
                ? 'rounded-sm bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm'
                : 'rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
