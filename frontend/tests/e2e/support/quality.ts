import { expect, type Locator, type Page } from '@playwright/test'

import { apiDelete, apiGet, apiPatch, apiPost } from './requests'
import { changeForcedPassword, signIn } from './auth'

/**
 * Ground the two quality scans share (F058; BIG-PROMPT §10.4, §5.5).
 *
 * An accessibility scan and a visual comparison both need the same three things
 * settled before they can mean anything — **which theme**, **which viewport**,
 * and **is the screen finished changing** — and the answers have to be the same
 * in both specs, or a "difference" is really a race between the suite and the
 * app. So they live here rather than in either spec.
 */

/** §10.4's three viewports, named the way §5.5 names the widths beside them. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 900, height: 800 },
  mobile: { width: 390, height: 844 },
} as const

export type ViewportName = keyof typeof VIEWPORTS

/** §10.4: "baseline screenshot comparisons in light/dark". */
export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** A screenshot name that says which state, theme and width it is. */
export function shotName(state: string, theme: Theme, viewport: ViewportName): string {
  return `${state}-${theme}-${viewport}.png`
}

/**
 * Fix the resolved theme, then prove it took.
 *
 * The app's stored mode is `system` unless somebody chose otherwise, and
 * `system` resolves through `prefers-color-scheme` (`theme-provider.tsx`), so
 * emulating that media feature is what makes "dark" mean dark on a machine
 * whose OS is set to either. It is also why a *signed-in* page needs the
 * assertion: the shell adopts the account's server-stored preference once it
 * lands, and an account that ever stored an explicit `light` would silently
 * turn a dark run into a light one — which the baselines would not notice,
 * because they would have been captured the same wrong way. Here the run says
 * so instead.
 */
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  // Polled, never read once. Emulating the media feature is only what *tells* the
  // page to resolve again: the page does that itself, in the `change` listener it
  // holds while the mode is `system` (`theme-provider.tsx`), which runs a task
  // after the emulation lands. A single read therefore races it and reports
  // whichever screen happened to be quickest — F058's first full axe run failed
  // exactly one scan of fourteen with "the page resolved to light, but dark was
  // requested" on the sign-in screen, where nothing was wrong. `expect.poll`
  // keeps the claim, the matcher and the message and merely waits for the class
  // instead of assuming it is already there.
  await expect
    .poll(
      () => page.locator('html').evaluate((root: HTMLElement) => root.classList.contains('dark')),
      {
        message: `the page never resolved to ${theme} — html.dark stayed ${theme === 'dark' ? 'absent' : 'present'}`,
      },
    )
    .toBe(theme === 'dark')
}

/**
 * Ends every transition and animation on the page, and pins the one volatile
 * box a mask cannot fix by itself.
 *
 * `transition-duration: 0s` is what Playwright's own `animations: 'disabled'`
 * does to a screenshot, and it is here for the same reason at a different
 * moment: a property that is mid-transition has a value that exists for a
 * hundred milliseconds and appears in no token, no design and no baseline.
 * Animations are only ever *interpolations* between the two states the page
 * really has, so ending them costs nothing and makes what follows a reading of
 * the state the app rests in.
 *
 * The second rule is narrower and answers a different problem. Masking the
 * notification card's `<time>` hides the phrase — but not the phrase's *width*,
 * which is part of the layout: the card's text block is `flex-1`, so a
 * timestamp one character shorter moves the mask's left edge and leaves a strip
 * the baseline covered and this run does not. F058 measured it at last: 1111..1193
 * against 1118..1193, both right-anchored on the delete button, seven pixels of
 * "12 minutes ago" against "5 minutes ago" — which is also why the failure
 * depended on how long the run had been going, the dark group's inbox being
 * older than the light group's. A minimum width gives the box a floor under
 * every phrase the platform's formatter can produce ("in a few seconds" is the
 * widest, and measures 83px), so the mask lands in the same place whatever it
 * says. Only the inbox is affected: `<time>` appears nowhere else in the app.
 */
const STILL = `*, *::before, *::after {
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
ul[aria-label="Notifications"] time {
  min-width: 7rem !important;
}`

const STILL_ID = 'f058-still'

/**
 * Wait until the screen has stopped changing — including the changes CSS makes
 * on its own.
 *
 * Three things outlive the document's `load`: the shell's one-shot read of the
 * account's preferences (which arrives after the first paint and can change
 * what is on screen), the page's own data, and **the theme**. That last one is
 * the one this suite had to learn the hard way: `applyTheme` toggles `.dark` on
 * `<html>` *after* the first paint, so every element carrying
 * `transition-colors` animates from its light value to its dark one. A scan
 * fired in the middle of that reports contrast failures against greys — `#828282`
 * on `#1b1b1b`, `#a9a9a9` on `#505050` — that match no token in the theme, and
 * it names different elements on each run, which is how a suite teaches its
 * reader to ignore it. Hence the stylesheet below, and the two frames: one for
 * the snap to the final value, one to be sure it has been painted.
 *
 * `networkidle` with a short timeout rather than a fixed pause: a page that
 * never goes quiet — a poll, a background refetch — still has to be compared,
 * and a suite that hangs on one is worse than one that compares a slightly
 * busy frame. `document.fonts.ready` is the second half of §10.4's "stabilize
 * fonts": a webfont swapping in after the shutter is a real pixel difference.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
  await page.evaluate(
    ({ id, css }) => {
      // A navigation wipes it, so it is added per state rather than per page —
      // and the id keeps repeated calls from stacking copies of the same rule.
      if (document.getElementById(id) === null) {
        const style = document.createElement('style')
        style.id = id
        style.textContent = css
        document.head.append(style)
      }
    },
    { id: STILL_ID, css: STILL },
  )
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
  })
}

/**
 * The regions whose text is generated per run and therefore cannot be compared.
 *
 * Timestamps are the run's own wall clock, and a relative one ("4 minutes ago")
 * says so even more loudly than an absolute date. Masking them is §10.4's
 * "stabilize … seed data" taken literally: the layout, the column, the header
 * and everything around the cell are still compared for real.
 *
 * The addresses are *not* masked, which is why the directory state is filtered
 * to the seeded accounts: those have a deterministic address
 * (`e2e-filler-07@resors-e2e.com`), while the two accounts the workflow creates
 * carry a random local part (`runEmail`) — so the filter buys a stable
 * comparison without hiding a column that has real content in it.
 *
 * `<time>` is masked wholesale: by definition it holds a moment, and marking the
 * ones that vary with the `datetime` attribute is cheaper than teaching each
 * caller which of its stamps are volatile.
 */
export function volatileRegions(page: Page): Locator[] {
  return [page.locator('tbody [data-column-id="created_at"]'), page.locator('time')]
}

/** What `signInAsRestrictedAccount` hands back, for a caller that asserts on it. */
export interface RestrictedAccount {
  email: string
  fullName: string
  /** The password the forced change produced, for a caller signing it in again. */
  password: string
}

/** The account it uses: a filler, so the run does not depend on workflow state. */
const RESTRICTED_EMAIL = 'e2e-filler-01@resors-e2e.com'
const RESTRICTED_NAME = 'E2E Filler 01'

/**
 * The role that account is given, and the only codes in it.
 *
 * The inbox is permission-gated, not merely session-scoped: `/notifications`
 * sits behind `notifications.read` (`config/navigation.ts`), and the API behind
 * the screen enforces the same code. So a filler holding *no* roles — which is
 * what the bootstrap leaves it with — is shown the 403 there, and the state
 * §10.4 asks to scan would not exist to scan. These two codes are the smallest
 * grant that fixes that while leaving the account unable to reach `/admin/*`,
 * which is what the 403 state still needs it for.
 */
const NOTIFICATION_ROLE = 'E2E Notifications Reader'
const NOTIFICATION_CODES = ['notifications.read', 'notifications.manage_own']

/**
 * A signed-in account that holds no administrative role.
 *
 * §5.5 wants the 403 state and the §10.4 Notifications scan; both need a
 * session that is not the administrator's — the admin is a super-user and can
 * reach everything, so no page denies them. The bootstrap's filler accounts are
 * exactly this, and their password is not knowable: the preparation generates
 * one *shared* password and discards it, so the admin resets this account's
 * through the API first, which is also what puts a real notice in its inbox
 * (C34: a password reset is the one event this platform notifies about — so
 * this is the only way the suite can photograph a *populated* notification
 * list, since an administrator cannot reset their own password through the
 * screen that would notify them).
 *
 * Signing in then goes through the same forced-change gate every
 * administrator-created account meets (BP-6.1b) — the gate is not stepped
 * over, because a session that skipped it would not be the session the app
 * hands anybody.
 */
export async function signInAsRestrictedAccount(
  page: Page,
  admin: Page,
): Promise<RestrictedAccount> {
  const list = await apiGet(admin, `/api/v1/admin/users?search=${RESTRICTED_EMAIL}`)
  expect(list.status(), 'the directory did not answer the admin').toBe(200)
  const body = (await list.json()) as { items: { id: string; email: string }[] }
  const target = body.items.find((item) => item.email === RESTRICTED_EMAIL)
  expect(target, `${RESTRICTED_EMAIL} is not in the directory`).toBeDefined()

  await grantNotificationAccess(admin, target!.id)

  const reset = await apiPost(admin, `/api/v1/admin/users/${target!.id}/reset-password`)
  expect(reset.status(), 'the reset was refused').toBe(200)
  const { temporary_password: temporary } = (await reset.json()) as {
    temporary_password: string
  }

  await signIn(page, RESTRICTED_EMAIL, temporary)
  const password = await changeForcedPassword(page, temporary)
  // Where it lands is not asserted: the account holds no administrative
  // permission, so whether the dashboard renders or denies is the app's
  // business and the workflow's subject (step 4), not this helper's. That it
  // left the gate is this helper's: `changeForcedPassword` waited for exactly
  // that.
  await expect(page).not.toHaveURL(/\/change-password$/)

  await leaveOneNotification(page)

  return { email: RESTRICTED_EMAIL, fullName: RESTRICTED_NAME, password }
}

/**
 * Leave the inbox holding exactly the notice this call produced.
 *
 * The reset above is what fills the inbox, and it fills it by exactly one — but
 * this helper does not run once. Both quality specs call it, and Playwright
 * restarts a worker after any failure, which re-runs `beforeAll`; the F058
 * diagnosis measured 31 resets against the 30 failures of one full run, each
 * further call adding one more notice. The notification states would then
 * photograph the suite's own history instead of the app: the baseline shows one
 * card and "1 unread", and the failing run showed six of each, which is a
 * difference no reader of the diff could attribute to the product.
 *
 * Trimming is the fix rather than a guard on the reset, because the credential
 * the reset hands back is the only way in: the replacement password is
 * generated, so a second call cannot sign in without resetting again. The list
 * arrives newest first (F045 says so), so what is kept is the notice this call
 * just made and what is dropped is every earlier one.
 */
async function leaveOneNotification(page: Page): Promise<void> {
  const listed = await apiGet(page, '/api/v1/notifications?page_size=100')
  expect(listed.status(), 'the inbox did not answer its owner').toBe(200)
  const { items } = (await listed.json()) as { items: { id: string }[] }
  expect(items.length, 'the reset produced no notice to photograph').toBeGreaterThan(0)

  for (const extra of items.slice(1)) {
    const dropped = await apiDelete(page, `/api/v1/notifications/${extra.id}`)
    expect(dropped.status(), 'an earlier notice could not be dropped').toBe(204)
  }
}

/**
 * Give an account the two notification codes, through a role of its own.
 *
 * Idempotent on purpose: the *database* is recreated per `playwright test`
 * invocation, but both quality specs run inside one, in two workers, against
 * the same database — so whichever of them gets here second finds the role
 * already there and only re-assigns it. `role_ids` replaces the account's
 * roles rather than adding to them, which is harmless here for the same
 * reason: the filler holds nothing else, before or after.
 */
async function grantNotificationAccess(admin: Page, userId: string): Promise<void> {
  const catalogue = await apiGet(admin, '/api/v1/admin/roles')
  expect(catalogue.status(), 'the role catalogue did not answer the admin').toBe(200)
  const { items } = (await catalogue.json()) as { items: { id: string; name: string }[] }

  let roleId = items.find((role) => role.name === NOTIFICATION_ROLE)?.id
  if (roleId === undefined) {
    const created = await apiPost(admin, '/api/v1/admin/roles', {
      name: NOTIFICATION_ROLE,
      description: 'Created by the F058 quality scans: the two inbox codes and nothing else.',
      permission_codes: NOTIFICATION_CODES,
    })
    expect(created.status(), 'the notification role was refused').toBe(201)
    roleId = ((await created.json()) as { id: string }).id
  }

  const assigned = await apiPatch(admin, `/api/v1/admin/users/${userId}`, {
    role_ids: [roleId],
  })
  expect(assigned.status(), 'the notification role could not be assigned').toBe(200)
}
