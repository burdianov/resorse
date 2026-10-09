import type { ReactNode } from 'react'
import { EllipsisIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The row-level action menu the toolkit's index promised for F034 — its first
 * consumer is the user directory, and every later list (roles, permissions,
 * audit) reuses this shape rather than re-declaring a trigger button.
 *
 * It owns exactly what must be identical everywhere: the trigger (ghost icon
 * button, `…`, labelled per row for screen readers) and the menu surface. The
 * *items* come from the page, because they are the page's business — its
 * permissions, its dialogs, its confirmations.
 *
 * One deliberate default: with an empty `children`, nothing renders — a
 * three-dot button that opens an empty menu is a dead control (§1.2).
 */
export interface DataTableRowActionsProps {
  /** The row's accessible name — "Actions for Ada Lovelace". */
  label: string
  children?: ReactNode
}

export function DataTableRowActions({ label, children }: DataTableRowActionsProps) {
  if (children === undefined || children === null) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
            <EllipsisIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
