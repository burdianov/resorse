import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/components/layout/app-shell'
import { buildRouteObjects } from '@/config/navigation'

/**
 * Route table — data-router mode (ARCHITECTURE §5).
 *
 * The children are **generated from the navigation registry** (F016), so a page
 * is mounted exactly when it is registered and described there once. The shell
 * is the layout route; F017 adds the root and `/admin` redirects, the 403/404
 * routes and the error boundary around this table.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: buildRouteObjects(),
  },
])
