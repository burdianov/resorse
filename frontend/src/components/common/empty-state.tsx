import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The empty state of BIG-PROMPT §5.2b — and §0.9's rule that empty is a real
 * state, not a blank panel: it always says what is missing and, when the caller
 * can do something about it, offers that action.
 *
 * Deliberately not a Card: an empty region is a *hole* in a page rather than a
 * surface on it, so it reads as a dashed outline instead of another panel.
 */
export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Primary action, e.g. a Button or a SecureLink. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-8 text-muted-foreground" /> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
