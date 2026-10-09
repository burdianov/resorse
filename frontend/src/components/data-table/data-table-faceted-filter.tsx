import { Check, PlusCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RowData } from '@tanstack/react-table'

import { FilterChip } from '@/components/common/filter-chip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { useDataTable } from './data-table-context'

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: LucideIcon
}

interface DataTableFacetedFilterProps {
  /** Column **id** — the filter reads and writes that column's value. */
  column: string
  title: string
  options: readonly FacetedFilterOption[]
}

/**
 * A multi-select filter for one column, with the counts each option would leave
 * behind (BIG-PROMPT §5.3: faceted filters + chips). The counts come from the
 * column's faceted row model — they respect the *other* filters and the search
 * box, so "Administrator (3)" means three rows would match, not three rows
 * exist.
 *
 * The column declares `filterFn: 'facetIncludes'` (registered by the kit):
 * the filter state is the array of selected values, and a row matches when its
 * own value — scalar or array — is in that array.
 *
 * **Deviation from the reference, on purpose:** the source renders its chips
 * inside the filter's trigger button, nesting a `<button>` (the chip's remove
 * control) inside another one. That is invalid HTML, and the DOM browsers build
 * from it does not match the DOM the code describes. Here the chips sit next to
 * the trigger, each independently removable, and the trigger carries a count
 * badge (§0.12).
 */
export function DataTableFacetedFilter({
  column: columnId,
  title,
  options,
}: DataTableFacetedFilterProps) {
  const table = useDataTable<RowData>()
  const column = table.getColumn(columnId)
  if (!column) {
    // A wrong id is a wiring mistake, and silence would hide it until someone
    // notices a filter that never filters.
    throw new Error(`DataTableFacetedFilter: the table has no column "${columnId}"`)
  }

  const selected = (column.getFilterValue() as string[] | undefined) ?? []
  const facetCounts = column.getFacetedUniqueValues()
  const labelOf = (value: string): string =>
    options.find((option) => option.value === value)?.label ?? value

  const setSelection = (values: string[]): void => {
    column.setFilterValue(values.length === 0 ? undefined : values)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover>
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="sm" className="border-dashed" />}
        >
          <PlusCircle aria-hidden />
          {title}
          {selected.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {selected.length}
              </Badge>
            </>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command>
            <CommandInput placeholder={title} />
            <CommandList>
              <CommandEmpty>No matching options.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selected.includes(option.value)
                  // Always a number: with other filters applied, "0" tells the
                  // user this option would return nothing — an absent count
                  // leaves them guessing whether it is zero or uncalculated.
                  const count = facetCounts.get(option.value) ?? 0
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => {
                        setSelection(
                          isSelected
                            ? selected.filter((value) => value !== option.value)
                            : [...selected, option.value],
                        )
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 items-center justify-center rounded-sm border border-primary',
                          isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50',
                        )}
                      >
                        {isSelected ? <Check className="size-3" /> : null}
                      </span>
                      {option.icon ? <option.icon aria-hidden className="size-4" /> : null}
                      <span>{option.label}</span>
                      <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              {selected.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      className="justify-center"
                      onSelect={() => {
                        setSelection([])
                      }}
                    >
                      Clear {title.toLowerCase()}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.map((value) => (
        <FilterChip
          key={value}
          label={title}
          value={labelOf(value)}
          onRemove={() => {
            setSelection(selected.filter((item) => item !== value))
          }}
        />
      ))}
    </div>
  )
}
