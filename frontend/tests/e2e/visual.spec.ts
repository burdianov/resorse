import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { signIn, signInAsAdmin } from './support/auth'
import { devOrigin } from './support/origins'
import {
  THEMES,
  VIEWPORTS,
  settle,
  shotName,
  signInAsRestrictedAccount,
  useTheme,
  volatileRegions,
} from './support/quality'
import type { RestrictedAccount, Theme, ViewportName } from './support/quality'

/**
 * The baseline screenshots (F058; BIG-PROMPT §5.5, §10.4).
 *
 * §5.5 asks to "visually compare at desktop width about 1440px, tablet about
 * 900px and mobile about 390px for" a named list of states, and §10.4 turns that
 * into "baseline screenshot comparisons in light/dark at 1440×900, 900×800,
 * 390×844". The table below is that list, one entry per state, and every entry
 * is captured at every width it exists at (the sidebar has no collapsed state
 * to photograph on a phone) in both themes.
 *
 * **What a baseline is, and is not.** It pins *proportions* — spacing, density,
 * hierarchy, what is visible without scrolling — which is what §5.5's last line
 * protects ("Protect existing visual proportions from generic redesigns"). It is
 * not a correctness check: the Vitest suite is where a control's behaviour is
 * asserted, and a pixel can be identical while a label is wrong.
 *
 * **Run it twice before believing it.** The first run with `--update-snapshots`
 * writes whatever the app happens to show, including anything unstable it
 * happens to catch; the run after it is the one that says the baselines are
 * stable. `pnpm run test:visual:update` is the first, `pnpm run test:visual` the
 * second — and a change that only ever passes on the machine that wrote it is
 * not a baseline, it is a recording.
 *
 * **Every state is arranged through the app.** No state is reached by writing
 * to a store or a database: the sidebar is collapsed by clicking the control
 * that collapses it, the palette is opened with the keyboard the way a user
 * opens it. A screenshot of a state the app cannot actually be put into would
 * be a promise the product does not make.
 */

type Role = 'guest' | 'admin' | 'restricted'

interface State {
  /** The file name, minus theme and viewport. */
  name: string
  /** Whose session it is photographed in. */
  role: Role
  /** The widths it exists at; §5.5's three unless the state is width-bound. */
  viewports: readonly ViewportName[]
  /**
   * The pinned sidebar it is photographed with.
   *
   * `'expanded'` and `'collapsed'` are arranged by clicking the control.
   * `'default'` is for a state whose photograph *is* whatever the app gives that
   * account on its own: the restricted session's inbox and 403 are the two, and
   * they are also the reason the distinction is worth drawing — on desktop the
   * app opens the sidebar and at 900px it auto-collapses (§1.2), so those two
   * baselines genuinely differ by width, and forcing either one on both widths
   * would have replaced two correct photographs with two wrong ones. Nothing in
   * that context toggles the rail, which is what keeps the default the default.
   *
   * Absent is for a state with no pinned sidebar to arrange at all: the sign-in
   * screen sits outside the shell, and `dashboard-nav-drawer` is at a width where
   * the navigation is an off-canvas drawer instead.
   */
  sidebar?: 'expanded' | 'collapsed' | 'default'
  /** Put the page into the state. Always starts from a navigation. */
  arrange: (page: Page) => Promise<void>
}

const ALL: readonly ViewportName[] = ['desktop', 'tablet', 'mobile']

/** The directory search that selects the seeded accounts and nothing else. */
const SEEDED = 'E2E Filler'

/**
 * The audit search that makes the trail state comparable (see `audit-table`).
 *
 * It names Filler 01, whose creation by the run's bootstrap is the one row the
 * state photographs. Search alone does not fix the count: the account is acted
 * on several times per run — `signInAsRestrictedAccount` reassigns its roles
 * and resets its password, and the workflow touches its neighbours — so the
 * number of rows it matches grows with what the run did. The Action filter
 * beside it narrows the search to `user.create`, and *that* pair is stable.
 * The workflow's own accounts carry a random local part (`runEmail`), so an
 * unfiltered trail would photograph a different run every time.
 */
const AUDIT_SEARCH = 'e2e-filler-01'

const STATES: readonly State[] = [
  {
    name: 'login',
    role: 'guest',
    viewports: ALL,
    arrange: async (page) => {
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    },
  },
  {
    name: 'dashboard-expanded',
    role: 'admin',
    // A phone has no sidebar to expand: at that width the navigation is off
    // canvas, and `dashboard-nav-drawer` below is its state.
    viewports: ['desktop', 'tablet'],
    sidebar: 'expanded',
    arrange: async (page) => {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    },
  },
  {
    name: 'dashboard-collapsed',
    role: 'admin',
    viewports: ['desktop', 'tablet'],
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    },
  },
  {
    name: 'dashboard-nav-drawer',
    role: 'admin',
    viewports: ['mobile'],
    arrange: async (page) => {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'command-dialog',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/dashboard')
      // The header's search affordance is the frame being mounted and listening
      // — the same wait the workflow's step 7 makes before pressing the
      // shortcut. It exists from the `md` breakpoint up: the compact bar at
      // 390px carries the hamburger and the brand instead (`app-header.tsx`
      // hides the button below `md`, and the drawer has no search entry). The
      // listener is on `document` either way, so the shortcut still opens the
      // palette there — the mobile state simply has no button to wait for, and
      // states the mount by the heading instead.
      if ((page.viewportSize()?.width ?? 0) >= 768) {
        await expect(page.getByRole('button', { name: /Search anything/ })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      }
      await page.keyboard.press('Control+k')
      const palette = page.getByRole('dialog')
      await expect(palette).toBeVisible()
      await palette.getByRole('combobox').fill('audit')
      await expect(palette.getByRole('option', { name: 'Audit Trail' })).toBeVisible()
    },
  },
  {
    name: 'profile-menu',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/dashboard')
      await page.getByRole('button', { name: 'Account menu' }).click()
      await expect(page.getByRole('menu')).toBeVisible()
    },
  },
  {
    name: 'user-list-filters',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/users')
      await page.getByLabel(/Search name or email/).fill(SEEDED)
      // Sorted by name rather than left in the server's default order: the
      // seeded accounts share one creation timestamp to the microsecond, so the
      // default `created_at desc` has nothing to break the tie with and the row
      // order is the database's to choose. Asking for the order makes the
      // comparison the app's rather than the planner's.
      await page.getByRole('button', { name: 'Full name', exact: true }).click()
      await expect(page.locator('tbody tr').first()).toContainText('E2E Filler 01')
    },
  },
  {
    name: 'user-create-dialog',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/users')
      // The directory behind the dialog is fixed the same way the list state
      // fixes it, and for a sharper reason: the two accounts the workflow
      // creates carry a random local part, they are the newest rows, and the
      // overlay dims them without hiding them — so an unfiltered background
      // would be a different photograph on every run, and the diff would be
      // about the run rather than about the dialog.
      await page.getByLabel(/Search name or email/).fill(SEEDED)
      await page.getByRole('button', { name: 'Full name', exact: true }).click()
      await expect(page.locator('tbody tr').first()).toContainText('E2E Filler 01')
      await page.getByRole('button', { name: 'Add user' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'user-edit-dialog',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/users')
      await page.getByLabel(/Search name or email/).fill('E2E Filler 01')
      await expect(page.getByText('1–1 of 1')).toBeVisible()
      await page.getByRole('button', { name: 'Actions for E2E Filler 01' }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'permission-matrix',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/roles')
      await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    },
  },
  {
    name: 'audit-table',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/audit')
      await expect(page.getByRole('table', { name: 'Audit trail' })).toBeVisible()
      // One row, chosen rather than left as the whole trail. Three reasons, and
      // all of them are about the photograph being of *this* app rather than of
      // one run: the trail's newest rows are whatever the workflow did last, and
      // it acts on accounts whose addresses carry a random local part; the run's
      // 27 seeded accounts are created in one transaction, so they share
      // `created_at` to the microsecond and the newest-first order among equals
      // is the planner's to choose; and the one account this does filter to is
      // created once and then acted on repeatedly, so searching for it without
      // the action filter photographs however many resets this run happened to
      // make. Action plus search is exactly one row of fixed text — the count
      // assertion below states it, so drift fails loudly instead of diffing.
      // By role and exact name, not `getByLabel('Action')`: a row's own action
      // button is labelled "Actions for …", which contains "Action", and a
      // substring match would then resolve to one element per rendered row —
      // passing whenever the rows happened not to have arrived yet.
      await page.getByRole('combobox', { name: 'Action', exact: true }).click()
      await page.getByRole('option', { name: 'user.create', exact: true }).click()
      await page.getByLabel(/Search summaries or actors/).fill(AUDIT_SEARCH)
      await expect(page.getByText('1–1 of 1')).toBeVisible()
      await expect(page.locator('tbody tr').first()).toContainText(AUDIT_SEARCH)
    },
  },
  {
    name: 'settings-card',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/admin/settings')
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    },
  },
  {
    name: 'notifications-list',
    role: 'restricted',
    viewports: ALL,
    sidebar: 'default',
    arrange: async (page) => {
      await page.goto('/notifications')
      // The one account that can be given an inbox: an administrator cannot
      // reset their own password, so the notices only ever land on somebody
      // else (see `signInAsRestrictedAccount`).
      await expect(page.locator('ul[aria-label="Notifications"] li').first()).toBeVisible()
    },
  },
  {
    name: 'notifications-empty',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/notifications')
      await expect(page.getByText('No notifications yet')).toBeVisible()
    },
  },
  {
    name: 'forbidden',
    role: 'restricted',
    viewports: ALL,
    sidebar: 'default',
    arrange: async (page) => {
      await page.goto('/admin/users')
      await expect(page.getByRole('heading', { name: '403 — Not authorised' })).toBeVisible()
    },
  },
  {
    name: 'not-found',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      await page.goto('/no-such-page')
      await expect(page.getByRole('heading', { name: '404 — Page not found' })).toBeVisible()
    },
  },
  {
    name: 'error-state',
    role: 'admin',
    viewports: ALL,
    sidebar: 'collapsed',
    arrange: async (page) => {
      // Aborted rather than refused: no response at all is the offline state,
      // and it is the one with copy and a Retry of its own.
      await page.route(/\/api\/v1\/admin\/audit/, (route) => route.abort('failed'))
      await page.goto('/admin/audit')
      await expect(page.getByRole('alert')).toContainText(/reach the server/)
      await page.unroute(/\/api\/v1\/admin\/audit/)
    },
  },
]

test.describe('visual baselines (§5.5, §10.4)', () => {
  let restricted: RestrictedAccount

  /**
   * One page per (session, theme, width), reused across the states.
   *
   * Not one per *state*: every page begins by signing in, and ninety-four
   * sign-ins would spend the run's login budget (the throttle counts per source
   * address for the whole process) on the suite's own bookkeeping instead of on
   * the app. Reuse costs nothing here because every `arrange` starts with its own
   * navigation, which resets everything but `localStorage` — the sidebar's own
   * store, which is why every state that photographs a pinned sidebar declares
   * which one it is, and `arrangeSidebar` makes it so.
   */
  const pages = new Map<string, Page>()
  const opened: BrowserContext[] = []

  async function pageFor(
    browser: Browser,
    role: Role,
    theme: Theme,
    viewport: ViewportName,
  ): Promise<Page> {
    const key = `${role}:${theme}:${viewport}`
    const existing = pages.get(key)
    if (existing !== undefined) return existing

    const context = await browser.newContext({
      baseURL: devOrigin,
      viewport: VIEWPORTS[viewport],
      // The theme is a property of the session here, so it is set before the
      // first paint rather than toggled after one.
      colorScheme: theme,
    })
    opened.push(context)
    const page = await context.newPage()
    pages.set(key, page)

    if (role === 'admin') {
      await signInAsAdmin(page)
    } else if (role === 'restricted') {
      await signIn(page, restricted.email, restricted.password)
      await page.waitForURL((url) => !url.pathname.startsWith('/login'))
    }
    return page
  }

  /**
   * Put the pinned sidebar into the state this photograph is of.
   *
   * It has to be *arranged* rather than assumed, because the sidebar is the one
   * piece of screen state a navigation does not reset: `sidebar-preferences.ts`
   * keeps the choice in `localStorage` and lets a stored preference win over the
   * viewport's own default. That is right for a person and wrong for a suite
   * that reuses one context across seventeen states — each state would inherit
   * whatever the state before it happened to leave behind, so the order of the
   * loop, and worse, whether an earlier test failed and restarted the worker,
   * would show up as a difference in a screen that has nothing to do with the
   * sidebar. (It did: the first re-run of the committed baselines had the two
   * restricted states at 900px photographed with the rail open — the whole page
   * shifted, on a state whose subject is a 403 — because the stored preference
   * that run's context held was not the one the baseline's context had.)
   *
   * So every state that photographs a pinned sidebar says which one — and this
   * makes it so the way a person does: by clicking the control, on a page that
   * has one. It runs *before* the state's own `arrange`, because an open dialog
   * puts the control under a modal overlay where it can no longer be clicked —
   * and the choice survives the navigation that follows, which is the whole
   * point of it being stored.
   *
   * The toggle is labelled with the state it will *produce*, so the face that is
   * visible is the one for the opposite of what is wanted: clicking only when
   * that face is there is what makes this idempotent, and the assertion after it
   * is the proof that the click landed.
   */
  async function arrangeSidebar(page: Page, open: boolean): Promise<void> {
    // Below `md` the navigation is the off-canvas drawer, which is a state of its
    // own (`dashboard-nav-drawer`) at a width with no pinned sidebar to arrange.
    if ((page.viewportSize()?.width ?? 0) < 768) return

    await page.goto('/dashboard')
    // Either face of the toggle stands for the same thing: the shell is mounted.
    // Waiting on the page's own heading would not do — for the account the 403
    // and inbox states are photographed with, the dashboard is a screen the app
    // is entitled to deny, and denying it still renders the shell.
    await expect(page.getByRole('button', { name: /(Expand|Collapse) sidebar/ })).toBeVisible()

    const wrongWay = page.getByRole('button', {
      name: open ? 'Expand sidebar' : 'Collapse sidebar',
    })
    if (await wrongWay.isVisible()) {
      await wrongWay.click()
    }
    await expect(
      page.getByRole('button', { name: open ? 'Collapse sidebar' : 'Expand sidebar' }),
    ).toBeVisible()
  }

  test.beforeAll(async ({ browser }) => {
    // An admin session used for nothing else: it is what resets the filler's
    // password, and the reset is what gives that account an inbox. Two
    // contexts, not two pages in one — a page shares its context's cookie jar,
    // so signing the filler in beside the admin would end the admin's session
    // rather than sit next to it.
    const adminContext = await browser.newContext({
      baseURL: devOrigin,
      viewport: VIEWPORTS.desktop,
    })
    opened.push(adminContext)
    const admin = await adminContext.newPage()
    await signInAsAdmin(admin)

    const fillerContext = await browser.newContext({
      baseURL: devOrigin,
      viewport: VIEWPORTS.desktop,
    })
    opened.push(fillerContext)
    restricted = await signInAsRestrictedAccount(await fillerContext.newPage(), admin)
  })

  test.afterAll(async () => {
    await Promise.all(opened.map((context) => context.close()))
  })

  // One test per photograph rather than one per width and theme: a state whose
  // baseline drifted is then a single named failure with its own diff image,
  // instead of the first of a dozen that the rest of the loop never reaches.
  for (const theme of THEMES) {
    for (const viewport of ALL) {
      for (const state of STATES) {
        if (!state.viewports.includes(viewport)) continue

        test(`${state.name} — ${theme} — ${viewport}`, async ({ browser }) => {
          const page = await pageFor(browser, state.role, theme, viewport)
          if (state.sidebar === 'expanded' || state.sidebar === 'collapsed') {
            await arrangeSidebar(page, state.sidebar === 'expanded')
          }
          await state.arrange(page)
          await useTheme(page, theme)
          await settle(page)
          await expect(page).toHaveScreenshot(shotName(state.name, theme, viewport), {
            mask: volatileRegions(page),
          })
        })
      }
    }
  }
})
