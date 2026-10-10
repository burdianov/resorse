/**
 * Build-time feature flags (BIG-PROMPT §4.5, §12 Phase 5 — F054).
 *
 * The registry has carried a `featureFlag` field since F017 and nothing has
 * ever set one, because nothing in this application was ever *off*. The
 * component lab is the first thing that must be: §4's route table lists
 * `/tools/components` as "dev-only … disabled in production", and a lab that
 * ships is a screen of sample data inside an application whose whole point is
 * that every figure it shows is real (§0.9, and the "no fake data" rule).
 *
 * Two mechanisms, deliberately separate, because they answer two different
 * questions:
 *
 * - **Is this a development build?** `import.meta.env.DEV` — a *literal* in the
 *   bundle, `false` in a production build. The lab's route is registered only
 *   when it is true, so the bundler drops the route object and the lazily
 *   imported page with it. That is what "excluded from production builds" has
 *   to mean in practice: the page does not exist in `dist/`, and a direct
 *   `/tools/components` is the ordinary 404 rather than a hidden screen.
 * - **Is the flag enabled for this caller?** `NavigationAccess.features`, which
 *   `meetsAccess` treats as fail-closed (absent means disabled). This is what
 *   keeps the flag mechanism honest *within* a development build: a caller
 *   whose feature set lacks `dev.tools` sees nothing, superuser or not, so the
 *   mechanism is exercised rather than decorative.
 *
 * Like `./access.ts` this module **imports nothing**: `lib/auth.tsx` reads it
 * while building a session's access and the registry reads it while registering
 * routes, and either direction would otherwise be a cycle.
 */

/** The flag that carries the developer-only surfaces. */
export const DEV_TOOLS_FLAG = 'dev.tools'

/**
 * The flags a build enables. Pure in `dev` on purpose: the production branch
 * cannot be exercised by the process that runs the tests, and an untestable
 * branch is a branch nobody has read.
 */
export function devFeatureFlags(dev: boolean): ReadonlySet<string> {
  return new Set(dev ? [DEV_TOOLS_FLAG] : [])
}

/**
 * What *this build* offers — not what an account holds. There is no `VITE_*`
 * variable and no runtime switch: a flag here reflects the mode the frontend was
 * compiled in, and the lab's registration in `config/navigation.ts` reads the
 * same constant, so the two can never disagree about whether it exists.
 */
export const ENABLED_FEATURES: ReadonlySet<string> = devFeatureFlags(import.meta.env.DEV)
