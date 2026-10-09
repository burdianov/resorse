import { useState } from 'react'
import { Outlet } from 'react-router'
import { Activity } from 'lucide-react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import type { SidebarNavGroup } from './app-sidebar'
import { resolveInitialSidebarOpen, writeStoredSidebarOpen } from './sidebar-preferences'

/**
 * The dashboard shell: pinned sidebar + 64px header + `p-6` content area
 * (BIG-PROMPT §1.2). Used as a layout route, so every protected page renders
 * through `<Outlet />` with the frame already in place.
 *
 * The sidebar owns the collapse preference (localStorage, see
 * `sidebar-preferences.ts`); the provider is controlled so the preference
 * survives reloads, and the first load falls back to the viewport — expanded on
 * desktop, collapsed on the source's tablet band.
 */

/**
 * TEMPORARY, until the shared navigation registry lands in F016 — the app has
 * exactly one real route today, so it gets exactly one real link. F016 replaces
 * this constant with the permission-filtered registry that the sidebar, the
 * command palette and breadcrumbs will all read (BIG-PROMPT §4.7–§4.10).
 */
const FOUNDATION_NAVIGATION: SidebarNavGroup[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    items: [{ id: 'status', label: 'Status', path: '/', icon: Activity }],
  },
]

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    resolveInitialSidebarOpen(window.innerWidth),
  )

  return (
    // One provider for every tooltip in the frame (rail items today, header
    // controls later — F013 fixed the missing id/describedby wiring, G-8).
    <TooltipProvider>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={(next) => {
          setSidebarOpen(next)
          writeStoredSidebarOpen(next)
        }}
      >
        <AppSidebar groups={FOUNDATION_NAVIGATION} />
        <SidebarInset>
          <AppHeader />
          {/* Page area: 24px padding (§1.2/§4). A div, not a second <main> —
              SidebarInset already renders one. */}
          <div className="flex-1 overflow-x-hidden p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
