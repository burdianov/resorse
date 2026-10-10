import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { RowData } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useDataTable } from './data-table-context'

/**
 * The pagination bar of BIG-PROMPT §5.2b (G-2), used as the DataTable's footer.
 *
 * It reads the table from context, so it is identical in both modes: in client
 * mode `getRowCount()` is the *filtered* row count from the row-model pipeline;
 * in server mode the caller's `rowCount` wins (TanStack's own resolution order),
 * which is why server mode must pass it — without it the footer would count the
 * rows of the page it was given and claim the dataset is one page long.
 *
 * `1–10 of 42` is deliberately the whole story: the reference shows the same
 * figures, and "page 3 of 5" without a total is the kind of number users have to
 * do arithmetic on.
 */
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const

interface DataTablePaginationProps {
  pageSizeOptions?: readonly number[]
  className?: string
}

export function DataTablePagination({
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  className,
}: DataTablePaginationProps) {
  const table = useDataTable<RowData>()
  const { pageIndex, pageSize } = table.state.pagination
  const rowCount = table.getRowCount()
  const pageCount = Math.max(table.getPageCount(), 1)
  const firstRow = rowCount === 0 ? 0 : pageIndex * pageSize + 1
  const lastRow = Math.min((pageIndex + 1) * pageSize, rowCount)

  return (
    <div
      data-slot="data-table-pagination"
      className={cn('flex flex-wrap items-center justify-between gap-2 px-1', className)}
    >
      <p className="text-sm text-muted-foreground">
        {rowCount === 0 ? 'No rows' : `${firstRow}–${lastRow} of ${rowCount}`}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">rows per page</span>
        </div>

        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1} of {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => {
              table.firstPage()
            }}
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage()
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => {
              table.nextPage()
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={!table.getCanLastPage()}
            onClick={() => {
              table.lastPage()
            }}
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
