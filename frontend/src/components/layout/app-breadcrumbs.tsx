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
            <BreadcrumbItem key={`${crumb.id}:${crumb.path}`}>
              {isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink render={<Link to={crumb.path} />}>{crumb.label}</BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
