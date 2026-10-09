import type { ReactNode } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * The loading state of BIG-PROMPT §5.2b, shaped after the reference's
 * `CenteredSpinner`: one polite live region announcing the wait, a spinner and
 * an optional label. `minHeight` stays a caller decision because a table row
 * and a whole page want different footprints.
 */
export interface LoadingStateProps {
  /** Announced and shown; also the accessible name of the status region. */
  label?: string
  /** Tailwind min-height utility, e.g. `min-h-40`. */
  minHeight?: string
  className?: string
  children?: ReactNode
}

export function LoadingState({
  label = 'Loading…',
  minHeight = 'min-h-40',
  className,
  children,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3',
        minHeight,
        className,
      )}
    >
      {/* The Spinner carries its own role="status"; nested live regions
          announce twice, so this one is decorative and the region above
          announces once with the caller's label. */}
      <Spinner aria-hidden className="size-5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
