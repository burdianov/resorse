import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { Column, RowData } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { DataTableFeatures } from './data-table'

interface DataTableColumnHeaderProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>
  title: ReactNode
  className?: string
}

/**
 * A sortable column header: the label is a button that cycles the column
 * through unsorted → ascending → descending, and shows which of the two it is.
 *
 * The sorted *state* is not carried by this button's accessible name — it is
 * `aria-sort` on the `<th>`, which is where the ARIA spec puts it and what a
 * screen reader reads out when the header cell is reached. The little index
 * number appears only under multi-sort (Shift-click), where "which column sorts
 * first" is otherwise invisible.
 */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn('text-sm font-medium', className)}>{title}</div>
  }

  const sorted = column.getIsSorted()
  const sortIndex = column.getSortIndex()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-ms-2 h-8 gap-1.5 data-[sorted=true]:text-foreground', className)}
      data-sorted={sorted !== false}
      onClick={(event) => {
        // Shift extends the sort — TanStack's own convention, wired here so a
        // multi-column sort needs no extra UI.
        column.toggleSorting(undefined, event.shiftKey)
      }}
    >
      {title}
      <Icon
        aria-hidden
        className={cn('size-3.5', sorted === false && 'text-muted-foreground')}
      />
      {sortIndex > -1 ? (
        // aria-hidden: the sorted state is `aria-sort` on the <th>, and a name
        // that changes when you use the button ("Name" → "Name 1") is the same
        // trap F019 hit with a loading button's spinner.
        <span aria-hidden className="text-xs tabular-nums text-muted-foreground">
          {sortIndex + 1}
        </span>
      ) : null}
    </Button>
  )
}
