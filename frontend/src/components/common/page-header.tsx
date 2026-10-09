import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The page header of BIG-PROMPT §5.2b: `title`, `description`, `actions` and a
 * `breadcrumbs` slot. Geometry follows §1.2 — `text-2xl font-semibold
 * tracking-tight` title, a small muted explanation, the primary action at the
 * upper right — so every page is laid out the same way and a page that is not
 * one of the source's screens still looks like it belongs.
 *
 * `breadcrumbs` takes a node rather than data: `AppBreadcrumbs` already derives
 * the trail from the registry, and keeping the slot generic lets a page pass a
 * hand-built trail when it is not a registry route.
 */
export interface PageHeaderProps {
  title: string
  description?: string
  /** Primary actions, laid out at the upper right on wide screens. */
  actions?: ReactNode
  /** Typically `<AppBreadcrumbs />`; renders above the title. */
  breadcrumbs?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-2', className)}>
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
