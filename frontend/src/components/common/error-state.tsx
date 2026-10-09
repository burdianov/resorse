import type { ReactNode } from 'react'
import { TriangleAlert, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The error state of BIG-PROMPT §5.2b, with the two flavours §6.2f asks for:
 * a failed request ("something went wrong") and an unreachable server
 * ("offline"), both offering **Retry** rather than a dead end.
 *
 * It renders only caller-supplied strings — never a thrown error, a response
 * body or a stack. §6.2f: an error must not leak what the caller may not see,
 * and a raw exception is exactly that leak.
 */
export interface ErrorStateProps {
  /** `offline` is the network/5xx case: different icon, copy and retry label. */
  variant?: 'error' | 'offline'
  title?: string
  description?: string
  /** Wired to the failing query's refetch (F018+) or a page reload. */
  onRetry?: () => void
  retryLabel?: string
  /** Extra actions, e.g. a link back home. */
  children?: ReactNode
  className?: string
}

const COPY = {
  error: {
    icon: TriangleAlert,
    title: 'Something went wrong',
    description: 'The page could not be displayed. Retrying often helps.',
    retryLabel: 'Try again',
  },
  offline: {
    icon: WifiOff,
    title: 'Can’t reach the server',
    description: 'Check your connection and try again.',
    retryLabel: 'Retry',
  },
} as const

export function ErrorState({
  variant = 'error',
  title,
  description,
  onRetry,
  retryLabel,
  children,
  className,
}: ErrorStateProps) {
  const copy = COPY[variant]
  const Icon = copy.icon

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-border px-6 py-10 text-center',
        className,
      )}
    >
      <Icon aria-hidden className="size-8 text-destructive" />
      <p className="text-sm font-medium text-foreground">{title ?? copy.title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description ?? copy.description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {retryLabel ?? copy.retryLabel}
        </Button>
      ) : null}
      {children ? <div className="mt-2 flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
