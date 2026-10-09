import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronDown, ChevronLeft } from 'lucide-react'

import { APP_MARK, APP_NAME } from '@/config/branding'
import type { NavGroupView, NavItemView } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

import { readStoredGroupState, writeStoredGroupState } from './sidebar-preferences'

/**
 * Sidebar navigation in the source's shape (BIG-PROMPT §1.2, §4.9): 64px brand
 * region, 11px uppercase group labels, ~40px rows with 20px Lucide icons,
 * collapsible groups, an icon-only rail with tooltips, and a round collapse
 * chevron on the outside edge.
 *
 * The **items are fed in** as `groups`: the shell passes
 * `visibleNavigation(access)`, the same filtered value the command palette
 * receives, so this file owns the navigation *mechanics* and the registry owns
 * what exists and who may see it. Group open state persists per group id
 * (§4.9: "persistent group/sidebar state").
 */

/**
 * Presentation aliases of the shared registry view types (`config/navigation.ts`),
 * so the sidebar renders whatever the registry filtered and nothing else.
 */
export type SidebarNavItem = NavItemView
export type SidebarNavGroup = NavGroupView

/**
 * Exact match, plus descendant matches for section paths — `/admin/users`
 * keeps `/admin` lit. `/` is exact only, or it would match every route.
 */
export function isNavItemActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function AppSidebar({
  groups,
  footer,
}: {
  /** Already filtered for the caller: produce with `visibleNavigation(access)`. */
  groups: readonly SidebarNavGroup[]
  /** Pinned-bottom slot; F032 puts the profile menu here. */
  footer?: ReactNode
}) {
  const { pathname } = useLocation()
  const { open, toggleSidebar } = useSidebar()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readStoredGroupState)
  const contentRef = useRef<HTMLDivElement>(null)

  const setGroupOpen = (id: string, next: boolean) => {
    const updated = { ...openGroups, [id]: next }
    setOpenGroups(updated)
    writeStoredGroupState(updated)
  }

  // Keep the active route visible: open its group if the user had closed it,
  // then scroll the active row into view (§4.9). Re-runs after the open lands,
  // so the row exists before it is scrolled to — no timer needed.
  useEffect(() => {
    const activeGroup = groups.find((group) =>
      group.items.some((item) => isNavItemActive(pathname, item.path)),
    )
    if (activeGroup && openGroups[activeGroup.id] === false) {
      setGroupOpen(activeGroup.id, true)
      return
    }
    contentRef.current
      ?.querySelector('[data-sidebar="menu-button"][data-active]')
      ?.scrollIntoView({ block: 'nearest' })
    // setGroupOpen is derived from openGroups, which is a dependency below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, openGroups, groups])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 shrink-0 justify-center border-b border-sidebar-border p-0">
        <Link
          to="/"
          className="flex h-16 items-center gap-2 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {/* Branding is neutral by design (§0.2): a drawn mark and a
              configurable name, never the reference's logo assets. */}
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            {APP_MARK}
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
        </Link>
      </SidebarHeader>

      {/* Round outward collapse chevron on the sidebar edge (§1.2). Hidden in
          the mobile drawer, where collapsing is meaningless. */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        className="absolute top-19 -right-3 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex"
      >
        <ChevronLeft
          className={cn('size-3 transition-transform duration-200', !open && 'rotate-180')}
        />
      </button>

      <SidebarContent ref={contentRef}>
        {groups.map((group) => {
          const isOpen = openGroups[group.id] ?? true
          return (
            <Collapsible
              key={group.id}
              open={isOpen}
              onOpenChange={(next) => {
                setGroupOpen(group.id, next)
              }}
              className="group/collapsible"
            >
              <SidebarGroup className="px-3 py-1">
                <SidebarGroupLabel className="mb-1 px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  <CollapsibleTrigger className="flex w-full items-center justify-between">
                    {group.label}
                    <ChevronDown
                      className={cn(
                        'size-3 transition-transform duration-200',
                        !isOpen && '-rotate-90',
                      )}
                    />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0.5">
                      {group.items.map((item) => {
                        const active = isNavItemActive(pathname, item.path)
                        const Icon = item.icon
                        return (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              render={
                                <Link
                                  to={item.path}
                                  aria-current={active ? 'page' : undefined}
                                />
                              }
                              isActive={active}
                              // Shown by the rail when the sidebar is collapsed.
                              tooltip={item.label}
                              className={cn(
                                'h-10 text-sidebar-foreground/70 transition-colors duration-150',
                                active &&
                                  'bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary',
                              )}
                            >
                              {Icon ? (
                                <Icon className={cn('size-5!', active && 'text-primary')} />
                              ) : null}
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>

      {footer ? (
        <SidebarFooter className="border-t border-sidebar-border">{footer}</SidebarFooter>
      ) : null}
    </Sidebar>
  )
}
