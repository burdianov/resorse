import { ArrowLeft, ArrowRight, SlidersHorizontal } from 'lucide-react'
import type { RowData } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { columnLabel } from './column-label'
import { useDataTable } from './data-table-context'

/**
 * The view-options menu (the sixth of the source's seven data-table files,
 * F021): which columns are shown, and in what order.
 *
 * Ordering is deliberately buttons rather than drag-and-drop. Drag is the
 * reference's gesture, but it needs a pointer, is invisible to keyboard users
 * unless it is re-implemented, and is barely testable in jsdom; two labelled
 * move items are accessible by default and exactly as persistent. If the
 * operator wants drag later, `@dnd-kit` is already in the stack list and can
 * layer on top of the same `columnOrder` state.
 *
 * `onReset` comes from `useTablePreferences` — the component reads the table
 * from context but must not own storage, so the caller passes the one function
 * that touches it.
 */
interface DataTableViewOptionsProps {
  /** Restores every column, in the defined order, and forgets the stored copy. */
  onReset?: () => void
}

export function DataTableViewOptions({ onReset }: DataTableViewOptionsProps) {
  const table = useDataTable<RowData>()

  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide())
  const visible = table.getVisibleLeafColumns()
  const order = visible.map((column) => column.id)

  const move = (columnId: string, delta: number): void => {
    const from = order.indexOf(columnId)
    const to = from + delta
    if (from === -1 || to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    // The rest of the columns keep their relative places; ids of hidden
    // columns follow, so showing one again lands it after the visible set.
    const hidden = table
      .getAllLeafColumns()
      .map((column) => column.id)
      .filter((id) => !next.includes(id))
    table.setColumnOrder([...next, ...hidden])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size="sm" aria-label="View options" />}
      >
        <SlidersHorizontal aria-hidden />
        <span className="hidden sm:inline">View</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* Base UI's labels require a group ancestor, and its items fire
            onClick — `onSelect` is the Radix API this stack does not use. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {hideable.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => {
                column.toggleVisibility(checked)
              }}
            >
              {columnLabel(column)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>

        {visible.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Column order</DropdownMenuLabel>
              {visible.flatMap((column) => {
                const label = columnLabel(column)
                const position = order.indexOf(column.id)
                return [
                  <DropdownMenuItem
                    key={`${column.id}-left`}
                    disabled={position === 0}
                    onClick={() => {
                      move(column.id, -1)
                    }}
                  >
                    <ArrowLeft aria-hidden />
                    Move {label} left
                  </DropdownMenuItem>,
                  <DropdownMenuItem
                    key={`${column.id}-right`}
                    disabled={position === order.length - 1}
                    onClick={() => {
                      move(column.id, 1)
                    }}
                  >
                    <ArrowRight aria-hidden />
                    Move {label} right
                  </DropdownMenuItem>,
                ]
              })}
            </DropdownMenuGroup>
          </>
        ) : null}

        {onReset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onReset}>Reset columns</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
