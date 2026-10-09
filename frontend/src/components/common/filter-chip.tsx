import type { ReactNode } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A removable chip for an active filter (BIG-PROMPT §5.2b, G-2).
 *
 * The remove control is a real `<button>`; the chip itself is not one. That
 * matters: the reference renders its chips *inside* the filter's trigger
 * button, which nests a button in a button — invalid HTML that browsers
 * "resolve" by closing the outer button early, so what the DOM contains is not
 * what the code says. Here the chips sit beside the trigger, each independently
 * removable (§0.12: improve on the source where it is wrong).
 */
interface FilterChipProps {
  /** What is being filtered, e.g. "Role". */
  label: ReactNode
  /** The selected value, e.g. "Administrator". */
  value?: ReactNode
  onRemove: () => void
  className?: string
}

export function FilterChip({ label, value, onRemove, className }: FilterChipProps) {
  const name = typeof label === 'string' ? label : 'filter'

  return (
    <span
      data-slot="filter-chip"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-secondary py-0.5 ps-2.5 pe-0.5 text-xs font-medium text-secondary-foreground',
        className,
      )}
    >
      <span>
        {label}
        {value !== undefined ? (
          <>
            {': '}
            <span className="font-semibold">{value}</span>
          </>
        ) : null}
      </span>
      <button
        type="button"
        aria-label={`Remove filter: ${name}`}
        className="rounded-full p-0.5 outline-none transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRemove}
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  )
}
