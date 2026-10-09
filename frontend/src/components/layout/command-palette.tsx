import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { NavGroupView } from '@/config/navigation'

/**
 * Ctrl/Cmd+K command palette (BIG-PROMPT §1.2, §4.10).
 *
 * It renders exactly the groups the sidebar renders: both receive the same
 * `visibleNavigation(access)` result from the shell, so there is no second
 * filtering path to drift. `groups` is a prop rather than a registry read here
 * on purpose — the invitation to filter again inside the palette is how the two
 * surfaces would start to disagree.
 *
 * Keyboard contract (§1.2): Ctrl/Cmd+K opens and closes, typing filters, Enter
 * activates the highlighted entry (cmdk highlights the first match as soon as
 * the list renders — see ARCHITECTURE §12), Escape closes and focus returns to
 * the element that had it (Base UI's dialog restores focus on close).
 */
export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly NavGroupView[]
}

export function CommandPalette({ open, onOpenChange, groups }: CommandPaletteProps) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search the pages available to you and jump to one."
    >
      <Command>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.id} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => {
                    onOpenChange(false)
                    void navigate(item.path)
                  }}
                >
                  {item.icon ? <item.icon /> : null}
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
