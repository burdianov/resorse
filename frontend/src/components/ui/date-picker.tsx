import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, toIsoDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

/**
 * Date picker — not a registry item, so it is composed here from Calendar and
 * Popover, as the reference project does.
 *
 * The value is an ISO calendar day (`YYYY-MM-DD`) rather than a `Date`, so the
 * stored form matches the API and cannot drift by a timezone.
 */
interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  id?: string
  /**
   * Forwarded to the trigger. The form kit's `FormControl` injects it, and a
   * component that does not pass it on drops the field's connection to its
   * description and error message — silently, in the DOM (F019).
   */
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select a date',
  invalid = false,
  disabled = false,
  id,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T00:00:00`) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={invalid}
            aria-describedby={ariaDescribedBy}
            data-empty={value ? 'false' : 'true'}
            className={cn(
              'w-full justify-start gap-2 font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {value ? formatDate(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          onSelect={(date) => {
            if (date) {
              onChange?.(toIsoDate(date))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
