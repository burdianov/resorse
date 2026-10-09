import { MenuIcon, SearchIcon } from 'lucide-react'

import { ThemeToggle } from '@/components/common/theme-toggle'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { APP_MARK, APP_NAME } from '@/config/branding'

import { ContextSwitcherSlot } from './context-switcher-slot'
import type { ContextSwitcherAdapter } from './context-switcher-slot'

/**
 * The 64px top bar (BIG-PROMPT §1.2): `h-16`, `px-4 md:px-6`, bottom border,
 * desktop search trigger, theme control, and the optional context-selector slot.
 *
 * Only controls whose backing feature exists are rendered. The search trigger
 * appears when a real `onSearchClick` is supplied — the command palette that
 * handler opens is F016. Notifications (F046) and the profile menu (F032) are
 * **absent rather than inert**: CLAUDE_MASTER forbids placeholder controls, and
 * a bell with no inbox behind it is exactly that. Their owners add them here.
 */
export interface AppHeaderProps {
  /** Supplied by the command palette owner (F016); without it no trigger renders. */
  onSearchClick?: () => void
  /** Workspace-context slot (BIG-PROMPT §3.2a). A disabled adapter renders nothing. */
  contextAdapter?: ContextSwitcherAdapter<unknown>
}

export function AppHeader({ onSearchClick, contextAdapter }: AppHeaderProps) {
  const { toggleSidebar } = useSidebar()

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-border px-4 md:px-6">
      {/* Below md the pinned sidebar becomes the off-canvas drawer, so the
          compact bar carries the hamburger and the brand itself. */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={toggleSidebar}
        aria-label="Open navigation"
      >
        <MenuIcon className="size-5" />
      </Button>
      <span className="flex items-center gap-2 md:hidden">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
        >
          {APP_MARK}
        </span>
        <span className="truncate text-sm font-semibold">{APP_NAME}</span>
      </span>

      {onSearchClick ? (
        <button
          type="button"
          onClick={onSearchClick}
          className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 md:flex"
        >
          <SearchIcon className="size-4" />
          <span>Search anything...</span>
          <kbd className="pointer-events-none ml-auto hidden h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {contextAdapter ? <ContextSwitcherSlot adapter={contextAdapter} /> : null}
        <ThemeToggle />
      </div>
    </header>
  )
}
