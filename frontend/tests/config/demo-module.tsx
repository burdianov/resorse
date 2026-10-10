import { FileText } from 'lucide-react'

import { PageHeader } from '@/components/common/page-header'
import type { AppModule } from '@/config/modules'

/**
 * A test-only extension module (F063): the frontend half of
 * `docs/ADDING_A_MODULE.md` §3, living in the test tree so it cannot reach the
 * bundle. `APP_MODULES` in `src/config/modules.ts` stays empty — the registry a
 * build compiles in never sees this object — and the compiled page is a test
 * fixture, not a screen.
 *
 * It is the guide's `demo_records` shape with two recorded divergences, both
 * consequences of *test-only* rather than of the contract:
 *
 * - **`requiredPermissions` names codes the server actually enforces.** The
 *   guide's illustrative `demo_records.read` exists nowhere in the backend
 *   vocabulary: `require_permission` takes a `PermissionCode` member and the
 *   vocabulary is registered server-side, so a route demanding that code would
 *   be demanding a right no API answers to. §3's rule 1 decides it — the route
 *   demands the codes the API enforces, and this module reuses two that are
 *   registered.
 * - **`permissions` still declares a code it cannot hold.** The declaration is
 *   the part of the contract that says *the frontend declares, the server
 *   registers*; nothing in the registry reads it, which is exactly what
 *   `modules.test.tsx` asserts by granting a caller that code and nothing else.
 */
export const DEMO_MODULE: AppModule = {
  id: 'demo_records',
  navigation: [{ id: 'records', label: 'Records', order: 40 }],
  routes: [
    {
      id: 'demo-records',
      path: '/records',
      label: 'Records',
      icon: FileText,
      group: 'records',
      requiredPermissions: ['files.read'],
      component: DemoRecordsPage,
    },
  ],
  permissions: [{ code: 'demo_records.read', description: 'View the demo records.' }],
}

/**
 * The module's page. Deliberately says what it is rather than dressing up as a
 * feature: a proof module that rendered an empty table would be the inert
 * surface `ADDING_A_MODULE.md` §5 forbids, and inventing rows would be the fake
 * data it forbids next to it.
 */
function DemoRecordsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Records"
        description="A test-only page. It exists to prove the extension contract, and it ships nowhere."
      />
      <p className="text-sm text-muted-foreground">
        A real module renders its API&rsquo;s rows here; this one has no API to call.
      </p>
    </div>
  )
}
