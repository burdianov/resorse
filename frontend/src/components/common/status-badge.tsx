import { Badge } from '@/components/ui/badge'
import type { badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * The status badge of BIG-PROMPT §5.2b: a quiet dot plus a word for a lifecycle
 * state (F034's user active/inactive is the first consumer).
 *
 * Colours come only from existing tokens — `primary`, `muted-foreground`,
 * `destructive` — because §1.2 ports the reference's variable set exactly and
 * F009 verified it; inventing an `emerald`/`amber` success-warning pair would
 * quietly grow the design system. If a future screen needs a different hue, add
 * a theme token first (the same rule that kept `no-scrollbar` out).
 */
type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

interface StatusStyle {
  label: string
  variant: BadgeVariant
  dot: string
}

const KNOWN_STATUSES: Record<string, StatusStyle> = {
  active: { label: 'Active', variant: 'secondary', dot: 'bg-primary' },
  inactive: { label: 'Inactive', variant: 'outline', dot: 'bg-muted-foreground' },
  pending: { label: 'Pending', variant: 'outline', dot: 'bg-primary' },
  failed: { label: 'Failed', variant: 'destructive', dot: 'bg-destructive' },
  // D007's project lifecycle (D009's first consumer). Three states, three
  // readings of one question — is this work real yet? A tender is demand that
  // has not been won, an awarded project is live, and a retired row is history
  // the award kept (C57). Colours are the same three tokens as above: a state
  // is not a severity, so no new hue enters the theme for it.
  tender: { label: 'Tender', variant: 'outline', dot: 'bg-muted-foreground' },
  awarded: { label: 'Awarded', variant: 'secondary', dot: 'bg-primary' },
  retired: { label: 'Retired', variant: 'outline', dot: 'bg-destructive' },
}

export interface StatusBadgeProps {
  /** Case-insensitive key; unknown values render as an outline badge with the raw text. */
  status: string
  /** Overrides the vocabulary's label. */
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const style = KNOWN_STATUSES[status.toLowerCase()]

  return (
    <Badge
      variant={style?.variant ?? 'outline'}
      data-slot="status-badge"
      data-status={status.toLowerCase()}
      className={cn('gap-1.5', className)}
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', style?.dot ?? 'bg-muted-foreground')}
      />
      {label ?? style?.label ?? status}
    </Badge>
  )
}
