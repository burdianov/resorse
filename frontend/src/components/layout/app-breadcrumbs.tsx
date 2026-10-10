import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { buildBreadcrumbs } from '@/config/navigation'
import type { RouteDefinition } from '@/config/navigation'

/**
 * Breadcrumbs for the current path, derived from the same registry as the
 * sidebar and the palette (BIG-PROMPT §4.7: "configure navigation once").
 * Pages place it through `PageHeader`'s `breadcrumbs` slot (F017), rather than
 * every route inheriting a bar from the shell.
 *
 * It draws nothing for a single crumb: a trail of one repeats the page title
 * directly beneath it. What it shows is *hierarchy* — the trail appears where
 * there is a parent to navigate back to.
 */
export function AppBreadcrumbs({ routes }: { routes?: readonly RouteDefinition[] }) {
  const { pathname } = useLocation()
  const crumbs = buildBreadcrumbs(pathname, routes)

  if (crumbs.length < 2) {
    return null
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={`${crumb.id}:${crumb.path}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.path} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {/* The separator is the list's own child, not the item's: both are
                  `<li>`s, and nesting one inside the other is invalid HTML that
                  React reports as a hydration warning (F057's finding). As a
                  sibling in the `<ol>` the trail is a well-formed list, and the
                  separator still carries `role="presentation"` +
                  `aria-hidden`, so a screen reader reads the crumbs and not the
                  chevrons between them. */}
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
