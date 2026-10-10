import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { expectNoBlockingViolations } from './support/a11y'
import { signInAsAdmin } from './support/auth'
import { devOrigin } from './support/origins'
import { THEMES, VIEWPORTS, settle, signInAsRestrictedAccount, useTheme } from './support/quality'

/**
 * The accessibility scans (F058; BIG-PROMPT §10.4).
 *
 * §10.4 asks for axe scans "at least on Login, Dashboard, Admin Users,
 * permission matrix, and Notifications" and for the gate to fail on real
 * violations. Those five are here, in **both themes** — a token set is
 * routinely fine in light and illegible in dark, so a scan that only ever saw
 * one theme would report half the app. Three more states the app can show a
 * person are scanned beside them: the 403 the permission system produces, the
 * 404 the router produces, and the unreachable-server state a failed request
 * produces. None of them is a screen anyone designs on purpose, which is
 * exactly why they are the ones that go wrong.
 *
 * **They run after the workflow** (`playwright.config.ts` says why: the
 * bootstrapped account's first sign-in is a one-time event the workflow owns).
 * The sessions here are therefore ordinary ones: the admin signs in through the
 * form, and the account used for 403 and for the populated inbox is a
 * bootstrap filler the admin gives a two-code notification role and then
 * resets — the same reset route the workflow's step 8 takes, so nothing here
 * depends on a mechanism the app does not have.
 *
 * **What a scan is worth.** axe catches what can be decided from the rendered
 * DOM — names, roles, contrast, structure. It does not catch a missing focus
 * ring, an unreachable control, or a dialog that traps the pointer instead of
 * the keyboard; those are the workflow's step 11 and the unit tests' business.
 * Neither replaces the other, and this file does not pretend to.
 */

test.describe('accessibility scans (§10.4)', () => {
  let admin: Page
  let guest: Page
  let restricted: Page
  const opened: BrowserContext[] = []

  async function createPage(browser: Browser): Promise<Page> {
    const context = await browser.newContext({
      baseURL: devOrigin,
      viewport: VIEWPORTS.desktop,
    })
    opened.push(context)
    return context.newPage()
  }

  test.beforeAll(async ({ browser }) => {
    admin = await createPage(browser)
    await signInAsAdmin(admin)

    restricted = await createPage(browser)
    // Needs the admin, so it follows the sign-in above. Its own reset request is
    // what puts a notice in the inbox the Notifications scan reads.
    await signInAsRestrictedAccount(restricted, admin)

    // Anonymous: the sign-in screen is outside the shell, so a session would
    // only change what it looks like.
    guest = await createPage(browser)
  })

  test.afterAll(async () => {
    await Promise.all(opened.map((context) => context.close()))
  })

  // A note on the shared count: every test below is one scan, and they are
  // independent of one another — each navigates to its own state — so a
  // failure in one still leaves the other thirteen scanned. That is deliberate:
  // with `describe.serial` the first finding would hide every later one, and a
  // reader wants the whole list.

  for (const theme of THEMES) {
    test(`the sign-in screen — ${theme}`, async () => {
      await guest.goto('/login')
      await expect(guest.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await useTheme(guest, theme)
      await settle(guest)
      await expectNoBlockingViolations(guest, `the sign-in screen (${theme})`)
    })

    test(`the dashboard — ${theme}`, async () => {
      await admin.goto('/dashboard')
      await expect(admin.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await useTheme(admin, theme)
      await settle(admin)
      await expectNoBlockingViolations(admin, `the dashboard (${theme})`)
    })

    test(`the user directory — ${theme}`, async () => {
      await admin.goto('/admin/users')
      await expect(admin.getByRole('table', { name: 'Users' })).toBeVisible()
      await useTheme(admin, theme)
      await settle(admin)
      await expectNoBlockingViolations(admin, `the user directory (${theme})`)
    })

    test(`the permission matrix — ${theme}`, async () => {
      await admin.goto('/admin/roles')
      await expect(admin.getByRole('heading', { name: 'Roles' })).toBeVisible()
      await useTheme(admin, theme)
      await settle(admin)
      await expectNoBlockingViolations(admin, `the permission matrix (${theme})`)
    })

    test(`notifications with content — ${theme}`, async () => {
      await restricted.goto('/notifications')
      await expect(restricted.getByRole('heading', { name: /^Notifications/ })).toBeVisible()
      // The scan is only worth its name if there is something in the list: an
      // empty state hides the card markup, its controls and its labels.
      await expect(restricted.locator('ul[aria-label="Notifications"] li').first()).toBeVisible()
      await useTheme(restricted, theme)
      await settle(restricted)
      await expectNoBlockingViolations(restricted, `the notification list (${theme})`)
    })
  }

  test('the 403 page', async () => {
    // The account holds the two inbox codes and nothing else, so the
    // administration is not merely hidden from it: the route denies it (§4.8,
    // §6.2f).
    await restricted.goto('/admin/users')
    await expect(restricted.getByRole('heading', { name: '403 — Not authorised' })).toBeVisible()
    await useTheme(restricted, 'light')
    await settle(restricted)
    await expectNoBlockingViolations(restricted, 'the 403 page')
  })

  test('the 404 page', async () => {
    await admin.goto('/no-such-page')
    await expect(admin.getByRole('heading', { name: '404 — Page not found' })).toBeVisible()
    await useTheme(admin, 'light')
    await settle(admin)
    await expectNoBlockingViolations(admin, 'the 404 page')
  })

  test('the unreachable-server state', async () => {
    // Aborted, not refused: the request leaves with no response at all, which is
    // the state the `offline` copy and its Retry exist for (the workflow's step
    // 11 takes the same route to reach it).
    await admin.route(/\/api\/v1\/admin\/audit/, (route) => route.abort('failed'))
    await admin.goto('/admin/audit')
    await expect(admin.getByRole('alert')).toContainText(/reach the server/)
    await useTheme(admin, 'light')
    await settle(admin)
    await expectNoBlockingViolations(admin, 'the unreachable-server state')
    await admin.unroute(/\/api\/v1\/admin\/audit/)
  })

  test('the mobile navigation drawer', async ({ browser }) => {
    // The off-canvas navigation is a different surface from the sidebar, not a
    // narrower one: it arrives as a dialog with its own roles and its own focus
    // handling, and it only exists below the mobile breakpoint (§1.2).
    const mobile = await browser.newContext({ baseURL: devOrigin, viewport: VIEWPORTS.mobile })
    opened.push(mobile)
    const page = await mobile.newPage()
    await signInAsAdmin(page)

    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await useTheme(page, 'light')
    await settle(page)
    await expectNoBlockingViolations(page, 'the mobile navigation drawer')
  })
})
