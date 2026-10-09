import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { LayoutDashboard } from 'lucide-react'

/**
 * The **protected placeholder** of F017, standing in for the registered pages
 * whose screens are still ahead of them (`/dashboard` → F047).
 *
 * It exists so the route tree is real without inventing anything: the page is
 * reachable, its route state works, the navigation and palette can link to it —
 * and it says plainly that the screen is not built yet. §3.2b forbids fabricated
 * KPIs and sample charts masquerading as data, so there are none; when F047
 * lands, this file is replaced, not extended.
 */
export function DashboardPlaceholder() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Dashboard"
        description="The protected area's home page."
        breadcrumbs={<AppBreadcrumbs />}
      />
      <EmptyState
        icon={LayoutDashboard}
        title="The dashboard screen arrives in F047"
        description="Today the foundation is real: the layout shell, the navigation registry this page is registered in, the command palette (Ctrl+K) and the route states around it. The identity welcome, unread count, system health and recent activity of BIG-PROMPT §7.2 come with the dashboard task — nothing here is mocked in the meantime."
      />
    </div>
  )
}
