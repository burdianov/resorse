import { useState } from 'react'
import { ClockIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Time picker — not a registry item, so it is composed here, following the
 * reference project's design: a 12-hour display over a 24-hour `HH:mm` value,
 * so the stored form is locale-neutral and sorts as a string.
 */
interface TimePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Matches `DatePicker`: the form kit drives invalid state through this. */
  invalid?: boolean
  /** Forwarded to the trigger — see the note in `date-picker.tsx` (F019). */
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const PERIODS = ['AM', 'PM'] as const

type Period = (typeof PERIODS)[number]

function split(value: string | undefined): { hour12: number; minute: string; period: Period } {
  const [rawHour = '', rawMinute = ''] = value ? value.split(':') : []
  const hour24 = Number.parseInt(rawHour, 10)
  if (Number.isNaN(hour24)) {
    return { hour12: 0, minute: rawMinute, period: 'AM' }
  }
  const period: Period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12, minute: rawMinute, period }
}

function join(hour12: number, minute: string, period: Period): string {
  let hour24 = hour12 % 12
  if (period === 'PM') {
    hour24 += 12
  }
  return `${String(hour24).padStart(2, '0')}:${minute}`
}

function display(value: string): string {
  const { hour12, minute, period } = split(value)
  return `${hour12}:${minute} ${period}`
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <span className="px-2 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">{children}</div>
    </div>
  )
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select a time',
  disabled = false,
  id,
  invalid = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const current = split(value)

  const update = (next: Partial<{ hour12: number; minute: string; period: Period }>): void => {
    const hour12 = next.hour12 ?? (current.hour12 || 12)
    const minute = next.minute ?? (current.minute || '00')
    const period = next.period ?? current.period
    onChange?.(join(hour12, minute, period))
  }

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
        <ClockIcon />
        {value ? display(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <div className="flex gap-1">
          <Column label="Hour">
            {HOURS.map((hour) => (
              <Button
                key={hour}
                type="button"
                size="sm"
                variant={current.hour12 === hour ? 'secondary' : 'ghost'}
                aria-pressed={current.hour12 === hour}
                onClick={() => {
                  update({ hour12: hour })
                }}
              >
                {hour}
              </Button>
            ))}
          </Column>
          <Column label="Minute">
            {MINUTES.map((minute) => (
              <Button
                key={minute}
                type="button"
                size="sm"
                variant={current.minute === minute ? 'secondary' : 'ghost'}
                aria-pressed={current.minute === minute}
                onClick={() => {
                  update({ minute })
                }}
              >
                {minute}
              </Button>
            ))}
          </Column>
          <Column label="Period">
            {PERIODS.map((period) => (
              <Button
                key={period}
                type="button"
                size="sm"
                variant={current.period === period ? 'secondary' : 'ghost'}
                aria-pressed={current.period === period}
                onClick={() => {
                  update({ period })
                }}
              >
                {period}
              </Button>
            ))}
          </Column>
        </div>
      </PopoverContent>
    </Popover>
  )
}
