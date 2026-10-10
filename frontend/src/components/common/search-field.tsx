import { useEffect, useId, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The search control of BIG-PROMPT §5.2b, and the DataTable's global filter
 * (F020). It exists because two behaviours are easy to get wrong and tedious to
 * repeat on every screen:
 *
 * - **Typing is immediate; reporting is debounced.** A server-backed search
 *   fires one request per keystroke without this. The input updates on every
 *   key, `onValueChange` follows after `debounceMs` (default 250).
 * - **An external reset survives.** When the parent clears the filter (a "reset"
 *   button, a route change), the field follows it — and does not echo the change
 *   straight back.
 *
 * Clearing by the user's X reports *immediately*: a clear is a decision, not
 * typing, and making the table wait 250 ms to un-filter looks broken.
 */
interface SearchFieldProps {
  /** The reported value. Pass it to keep the field in step with external resets. */
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** 0 reports on every keystroke. */
  debounceMs?: number
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search…',
  debounceMs = 250,
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
}: SearchFieldProps) {
  const generatedId = useId()
  const inputId = id ?? `${generatedId}-search`
  const [text, setText] = useState(value ?? '')
  /** The last value this field reported — the anchor for "did the outside change?" */
  const reported = useRef(value ?? '')
  const handler = useRef(onValueChange)
  // The "latest ref" pattern, written from an effect rather than during render:
  // `react-hooks/refs` (F055) forbids touching a ref while rendering, and the
  // effect still lands before any debounce timer this render could schedule.
  useEffect(() => {
    handler.current = onValueChange
  })

  // External change (a reset, a route change): adopt it without re-reporting.
  useEffect(() => {
    if (value === undefined || value === reported.current || value === text) return
    reported.current = value
    setText(value)
  }, [value, text])

  // Debounced reporting of what the user typed.
  useEffect(() => {
    if (debounceMs === 0 || text === reported.current) return
    const timer = setTimeout(() => {
      reported.current = text
      handler.current(text)
    }, debounceMs)
    return () => {
      clearTimeout(timer)
    }
  }, [text, debounceMs])

  const clear = (): void => {
    setText('')
    reported.current = ''
    handler.current('')
  }

  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel ?? placeholder}
      </label>
      <Search
        aria-hidden
        className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={inputId}
        type="search"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        className="ps-8 pe-8"
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (debounceMs === 0) {
            reported.current = next
            handler.current(next)
          }
        }}
      />
      {text !== '' && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute end-1 top-1/2 -translate-y-1/2"
          onClick={clear}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
