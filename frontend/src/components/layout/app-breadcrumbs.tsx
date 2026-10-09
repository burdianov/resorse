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
 *
 * Not mounted in the shell yet, deliberately: §5.2b gives `PageHeader` a
 * `breadcrumbs` slot, and F017 builds that header — pages then compose the
 * trail where it belongs instead of every route inheriting a bar. The trail and
 * the rendering are finished and tested here so F017 only places them.
 */
export function AppBreadcrumbs({ routes }: { routes?: readonly RouteDefinition[] }) {
  const { pathname } = useLocation()
  const crumbs = buildBreadcrumbs(pathname, routes)

  if (crumbs.length === 0) {
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
