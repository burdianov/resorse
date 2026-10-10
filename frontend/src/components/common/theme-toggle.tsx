import { MoonIcon, SunIcon } from 'lucide-react'

import { isThemeMode, useTheme } from '@/components/providers/theme-provider'
import type { ThemeMode } from '@/components/providers/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const OPTIONS: ReadonlyArray<{ mode: ThemeMode; label: string }> = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
]

/**
 * Compact theme control for the app header (BIG-PROMPT §1.2 places the sun/moon
 * toggle there). F010 shipped a plain three-button group so the persistence was
 * exercisable; the toolbar placement arrived with the shell in F015, so this is
 * the same control in its toolbar form.
 *
 * The source's header only toggles light ↔ dark. Keeping all three choices in a
 * menu instead means `system` stays reachable without a trip to Settings — §1.2
 * requires the three preferences to be explicit, and nothing here is a
 * two-state cycle that can leave the user unable to express "follow the OS".
 */
export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Theme" />}>
        {/* The dark variant of the custom variant is driven by the `.dark` class
            on <html> (F009), so only one icon is ever painted. */}
        <SunIcon className="size-4 dark:hidden" />
        <MoonIcon className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isThemeMode(value)) {
              setMode(value)
            }
          }}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.mode} value={option.mode}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
