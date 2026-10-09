import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/components/layout/app-shell'
import { FoundationStatus } from '@/pages/foundation-status'

/**
 * Route table — data-router mode (ARCHITECTURE §5).
 *
 * F006 proved the routing mode end to end; F015 turned the root into a layout
 * route so every page renders inside the sidebar/header shell. The shared
 * navigation registry and its route metadata arrive with F016, and the route
 * states (root and /admin redirects, 403, 404, error boundary) with F017.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <FoundationStatus /> }],
  },
])
