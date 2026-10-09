import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'

import { AccessProvider } from '@/components/providers/access-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANONYMOUS_ACCESS, visibleNavigation } from '@/config/navigation'

import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { CommandPalette } from './command-palette'
import { resolveInitialSidebarOpen, writeStoredSidebarOpen } from './sidebar-preferences'

/**
 * The dashboard shell: pinned sidebar + 64px header + `p-6` content area
 * (BIG-PROMPT §1.2). Used as a layout route, so every protected page renders
 * through `<Outlet />` with the frame already in place.
 *
 * The navigation comes from the shared registry (`config/navigation.ts`),
 * filtered **once** here and handed to both the sidebar and the command palette
 * — §4.10 requires them to share exactly the same definition. Pages load
 * lazily (the registry stores `lazy()` components), so the content area owns
 * the pending state.
 *
 * The sidebar owns the collapse preference (localStorage, see
 * `sidebar-preferences.ts`); the provider is controlled so the preference
 * survives reloads, and the first load falls back to the viewport — expanded on
 * desktop, collapsed on the source's tablet band.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    resolveInitialSidebarOpen(window.innerWidth),
  )
  const [paletteOpen, setPaletteOpen] = useState(false)

  // There is no session until F032, so the caller here genuinely *is* anonymous,
  // and the registry correctly shows such a caller only the routes that require
  // nothing. Tests drive the other cases through `visibleNavigation` directly.
  const access = ANONYMOUS_ACCESS
  const groups = visibleNavigation(access)

  return (
    <AccessProvider access={access}>
      {/* One provider for every tooltip in the frame (rail items today, header
          controls later — F013 fixed the missing id/describedby wiring, G-8). */}
      <TooltipProvider>
        <SidebarProvider
          open={sidebarOpen}
          onOpenChange={(next) => {
            setSidebarOpen(next)
            writeStoredSidebarOpen(next)
          }}
        >
          <AppSidebar groups={groups} />
          <SidebarInset>
            <AppHeader onSearchClick={() => setPaletteOpen(true)} />
            {/* Page area: 24px padding (§1.2/§4). A div, not a second <main> —
                SidebarInset already renders one. */}
            <div className="flex-1 overflow-x-hidden p-6">
              <Suspense fallback={<RoutePending />}>
                <Outlet />
              </Suspense>
            </div>
          </SidebarInset>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} />
        </SidebarProvider>
      </TooltipProvider>
    </AccessProvider>
  )
}

/** Shown while a registry page chunk loads (BP §4: Suspense/pending skeletons). */
function RoutePending() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner className="size-5" />
    </div>
  )
}
