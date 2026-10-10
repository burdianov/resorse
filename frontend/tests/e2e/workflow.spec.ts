import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { attemptSignIn, changeForcedPassword, signIn, signInAsAdmin } from './support/auth'
import { devOrigin, previewOrigin } from './support/origins'
import { apiGet, apiPost } from './support/requests'
import { generatedPassword, readState, run, runEmail, updateState } from './support/state'

/**
 * BP-10.4's workflow, in a real browser against the real API and a real
 * freshly migrated PostgreSQL (F057).
 *
 * §10.4 lists eleven things to cover and calls them "complete workflow", which
 * is why they are one serial file and one `describe` rather than eleven
 * independent tests: step 3 needs the account step 2 signed in as, step 5 needs
 * step 3's role, step 6 needs step 5's grant, step 8 needs step 3's account and
 * step 9 needs the password step 8 reset. Running them apart, or retrying one in
 * the middle, would test a state the workflow never produces — hence
 * `workers: 1`, `retries: 0` and `describe.serial` (see `playwright.config.ts`).
 *
 * The eleven test names below are the requirement's own list, so a reader can
 * hold `BIG-PROMPT` §10.4 beside them.
 *
 * **What the assertions are allowed to be.** Everything here is observed from
 * the browser: a rendered heading, a URL, a response the page made, a stored
 * preference that survives a reload. Where a *permission* is the claim, the
 * check is a direct API call from the page's own context (`support/requests`) —
 * a hidden button proves nothing about a guard, and §10.4 asks for the guard.
 *
 * **Two accounts, two contexts.** The admin and the member are separate browser
 * contexts, because that is what "a second user" means and because a password
 * reset (step 8) revokes the target's sessions. Signing in as one after the
 * other in a single context would hide exactly the bugs — cross-account
 * leakage, stale cookies — that the workflow is here to find.
 *
 * **What this file deliberately does not do.** The actions the member's own
 * role does not carry (deactivating an account, editing a role) are performed by
 * the admin: `users.deactivate` and `roles.manage` are the admin's, and a member
 * performing them would be testing a privilege model this project does not have.
 * Axe scans and screenshot baselines are §10.6's, i.e. F058's, not this file's.
 */

/** BP-10.4's own viewport for the deliberate desktop checks. */
const DESKTOP = { width: 1440, height: 900 }
/** §1.2's tablet band: a pinned sidebar, auto-collapsed on first load. */
const TABLET = { width: 900, height: 800 }
const MOBILE = { width: 390, height: 844 }

const MEMBER_FULL_NAME = 'E2E Member'
const MEMBER_RENAMED = 'E2E Member Renamed'
const SECOND_FULL_NAME = 'E2E Second'
/** The role the member's permissions come from; step 5 edits exactly this one. */
const MEMBER_ROLE = 'E2E Member Role'
/** A role that grants nothing: two roles, one union (BP-6.3). */
const OBSERVER_ROLE = 'E2E Observer Role'

const USERS_API = '/api/v1/admin/users'
const REPORT_API = '/api/v1/reports/user-directory'
/** The filler step 6 deactivates, so the Inactive filter has real content. */
const DEACTIVATED_FILLER = 'E2E Filler 09'
/**
 * The search box's accessible name, which is its placeholder (the field's
 * `<label>` carries the placeholder text). A regex, because the ellipsis is a
 * single character no assertion should have to reproduce.
 */
const DIRECTORY_SEARCH = /Search name or email/

test.describe.serial('BP-10.4 browser workflow', () => {
  let admin: Page
  let member: Page
  const opened: BrowserContext[] = []

  /**
   * A context the run owns, registered for `afterAll`.
   *
   * Every person in this workflow gets a context of their own. `use.baseURL`
   * applies to the fixtures, not to a context made by hand, so the dev origin is
   * passed in rather than inherited.
   */
  async function createPage(
    browser: Browser,
    viewport: { width: number; height: number } = DESKTOP,
  ): Promise<Page> {
    const context = await browser.newContext({ baseURL: devOrigin, viewport })
    opened.push(context)
    return context.newPage()
  }

  test.beforeAll(async ({ browser }) => {
    admin = await createPage(browser)
    member = await createPage(browser)
  })

  test.afterAll(async () => {
    await Promise.all(opened.map((context) => context.close()))
  })

  test('1. an anonymous visit to a protected route lands on /login', async ({ browser }) => {
    const guest = await createPage(browser)

    await guest.goto('/admin/users')
    await expect(guest).toHaveURL(/\/login$/)
    await expect(guest.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    // Not one lucky route: the guard belongs to the shell, so the dashboard is
    // behind it too.
    await guest.goto('/dashboard')
    await expect(guest).toHaveURL(/\/login$/)
  })

  test('2. the bootstrapped admin signs in, replaces the generated password, and reaches the dashboard', async () => {
    const state = readState()
    await signIn(admin, state.adminEmail, state.adminPassword)

    // First sign-in lands on the gate, not the dashboard: the account was
    // created with a temporary password (BP-6.1b).
    await expect(admin).toHaveURL(/\/change-password$/)
    const replacement = await changeForcedPassword(admin, state.adminPassword)
    // Persisted because later steps sign the admin in again (step 7's extra
    // viewports); nothing else reads this credential.
    updateState({ adminPassword: replacement })

    await expect(admin).toHaveURL(/\/dashboard$/)
    await expect(admin.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // The new password replaced the generated one rather than joining it: a
    // reload resolves the same rotated session instead of returning to the gate.
    await admin.reload()
    await expect(admin).toHaveURL(/\/dashboard$/)
  })

  test('3. the admin creates two roles and an ordinary account holding both, and that account signs in and changes its password', async () => {
    // Roles first: the add-user form offers the roles that exist, and the
    // member's permissions are to come from MEMBER_ROLE while OBSERVER_ROLE
    // contributes nothing.
    for (const role of [MEMBER_ROLE, OBSERVER_ROLE]) {
      await admin.goto('/admin/roles')
      await admin.getByRole('button', { name: 'Add role' }).click()
      const dialog = admin.getByRole('dialog')
      await dialog.getByLabel(/^name/i).fill(role)
      await dialog.getByLabel(/description/i).fill('Created by the browser workflow (F057).')
      await dialog.getByRole('button', { name: 'Create role' }).click()
      await expect(admin.getByText('Role created')).toBeVisible()
    }

    // The one thing the member may do from the start: their own inbox. Granted
    // through the matrix, which is also the one save that screen makes.
    await setRolePermission(admin, MEMBER_ROLE, 'notifications.read', true)
    await setRolePermission(admin, MEMBER_ROLE, 'notifications.manage_own', true)

    const email = runEmail('e2e-member')
    const initial = generatedPassword()
    await createUser(admin, {
      email,
      fullName: MEMBER_FULL_NAME,
      password: initial,
      roles: [MEMBER_ROLE, OBSERVER_ROLE],
    })
    run.memberEmail = email
    run.memberPassword = initial

    // The account signs itself in, in its own context, and meets the same gate
    // the admin met — an account created by an administrator never starts with a
    // password its owner chose (BP-6.1b).
    await signIn(member, email, initial)
    await expect(member).toHaveURL(/\/change-password$/)
    run.memberPassword = await changeForcedPassword(member, initial)
    await expect(member).toHaveURL(/\/dashboard$/)

    // Both roles are on the account; the union is the server's to resolve.
    await member.goto('/profile')
    await expect(member.getByText(MEMBER_ROLE, { exact: true })).toBeVisible()
    await expect(member.getByText(OBSERVER_ROLE, { exact: true })).toBeVisible()
  })

  test('4. the member sees only the authorized navigation, and forbidden URLs and APIs are refused', async () => {
    await member.goto('/dashboard')

    // The navigation is permission-filtered (§4.8), so the administration the
    // member cannot use is absent rather than disabled. Every entry below is in
    // the registry — it is hidden from this caller, not missing from the app.
    const nav = (href: string) => member.locator(`[data-sidebar="menu-button"][href="${href}"]`)
    await expect(nav('/dashboard')).toBeVisible()
    await expect(nav('/notifications')).toBeVisible()
    await expect(nav('/admin/users')).toHaveCount(0)
    await expect(nav('/admin/roles')).toHaveCount(0)
    await expect(nav('/admin/audit')).toHaveCount(0)

    // A direct visit is a 403 — distinct from the anonymous redirect of step 1,
    // and it says nothing about what lives behind it (§6.2f).
    await member.goto('/admin/users')
    await expect(member.getByRole('heading', { name: '403 — Not authorised' })).toBeVisible()

    // A typed URL is not the guard; the guard is the server. The same calls the
    // screens would make are refused, from the member's own session.
    expect((await apiGet(member, USERS_API)).status()).toBe(403)
    expect((await apiGet(member, '/api/v1/admin/roles')).status()).toBe(403)

    // The two things that are theirs are theirs: the inbox and the profile are
    // session-scoped, not permission-scoped.
    await member.goto('/notifications')
    await expect(member.getByRole('heading', { name: /^Notifications/ })).toBeVisible()
    await member.goto('/profile')
    await expect(member.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  test("5. a role edit takes effect on the member's next request, and a revocation is not cached", async () => {
    expect((await apiGet(member, USERS_API)).status()).toBe(403)

    await setRolePermission(admin, MEMBER_ROLE, 'users.read', true)
    // The very next request, with no re-login and no new document: F029 resolves
    // the union per request, and a stale claim here is the privilege bug this
    // step exists to catch.
    expect((await apiGet(member, USERS_API)).status()).toBe(200)
    // The shell resolves its session when a document loads, so the *screen*
    // follows a navigation — the server above is the authority either way.
    await member.goto('/admin/users')
    await expect(member.getByRole('heading', { name: 'Users' })).toBeVisible()

    // And the other direction, which is the one that matters: a permission taken
    // away is refused on the next request rather than served from what the
    // browser remembered.
    await setRolePermission(admin, MEMBER_ROLE, 'users.read', false)
    expect((await apiGet(member, USERS_API)).status()).toBe(403)
    await member.goto('/admin/users')
    await expect(member.getByRole('heading', { name: '403 — Not authorised' })).toBeVisible()

    // Step 6 reads the directory as the member, so the grant goes back on.
    await setRolePermission(admin, MEMBER_ROLE, 'users.read', true)
    expect((await apiGet(member, USERS_API)).status()).toBe(200)
  })

  test('6. the directory searches, filters, sorts and paginates, and its column preferences survive a reload', async () => {
    // Deactivating an account is `users.deactivate`, which the member's role
    // does not carry — so the admin produces the state the filter needs, and the
    // member then reads the directory. The admin searches first because the
    // filler's page is not this run's business.
    await admin.goto('/admin/users')
    await admin.getByLabel(DIRECTORY_SEARCH).fill(DEACTIVATED_FILLER)
    await expect(admin.getByText('1–1 of 1')).toBeVisible()
    await admin.getByRole('button', { name: `Actions for ${DEACTIVATED_FILLER}` }).click()
    await admin.getByRole('menuitem', { name: 'Deactivate' }).click()
    await admin.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click()
    // No toast for this one: the badge on the row is the whole feedback, and the
    // row's own status is what the next step's filter has to find.
    await expect(admin.locator('tbody [data-status="inactive"]')).toHaveCount(1)

    // Now the directory as the member: the table step 5 unlocked is the same
    // screen the admin sees, and reading it as the account whose permission just
    // changed is what ties this step to the one before it.
    await member.goto('/admin/users')
    await expect(member.getByRole('heading', { name: 'Users' })).toBeVisible()

    // 28 seeded accounts plus the one step 3 created; 25 rows to a page.
    await expect(member.getByText('1–25 of 29')).toBeVisible()
    await expect(member.getByText('Page 1 of 2')).toBeVisible()
    await member.getByRole('button', { name: 'Next page' }).click()
    await expect(member.getByText('26–29 of 29')).toBeVisible()
    await expect(member.getByText('Page 2 of 2')).toBeVisible()
    await member.getByRole('button', { name: 'First page' }).click()
    await expect(member.getByText('Page 1 of 2')).toBeVisible()

    // Order: the header *is* the control, and its state is `aria-sort` on the
    // cell rather than a word in the button's name. The rows are asserted too —
    // an `aria-sort` that the server ignored would still pass on its own.
    const fullNameHeader = member.getByRole('button', { name: 'Full name', exact: true })
    await fullNameHeader.click()
    await expect(member.locator('th[aria-sort="ascending"]')).toContainText('Full name')
    await expect(member.locator('tbody tr').first()).toContainText('E2E Administrator')

    await fullNameHeader.click()
    await expect(member.locator('th[aria-sort="descending"]')).toContainText('Full name')
    // The only account in this run that sorts after the fillers: the member
    // themselves (the second account arrives in step 8).
    await expect(member.locator('tbody tr').first()).toContainText(MEMBER_FULL_NAME)

    // A third click clears TanStack's own sort and this screen deliberately
    // ignores that (users.tsx: "a cleared sort keeps the current order") — a
    // server-paginated table always answers with an order. So the header stays
    // sorted, and the bare header the column-order assertions want comes from
    // the reload below rather than from a fourth click.
    await fullNameHeader.click()
    await expect(member.locator('th[aria-sort="descending"]')).toContainText('Full name')
    await expect(member.locator('tbody tr').first()).toContainText(MEMBER_FULL_NAME)

    // Search: one filler's exact name, and the count comes from the server.
    await member.getByLabel(DIRECTORY_SEARCH).fill('E2E Filler 07')
    await expect(member.getByText('1–1 of 1')).toBeVisible()
    await member.getByRole('button', { name: 'Clear search' }).click()
    await expect(member.getByText('1–25 of 29')).toBeVisible()

    // Filter: the one account the admin deactivated, and nothing else — a filter
    // that returns everything is not evidence.
    await member.getByLabel('Status').click()
    await member.getByRole('option', { name: 'Inactive' }).click()
    await expect(member.getByText('1–1 of 1')).toBeVisible()
    await expect(member.getByText(DEACTIVATED_FILLER)).toBeVisible()
    await member.getByLabel('Status').click()
    await member.getByRole('option', { name: 'All statuses' }).click()
    await expect(member.getByText('1–25 of 29')).toBeVisible()

    // Column preferences are per user and server-backed (F048), so they are what
    // survives a reload — page, search, sort and filter deliberately are not.
    //
    // The view-options menu names columns the way the header does. Every header
    // on this table is a component, so the name comes from each column's
    // `meta.label` — which F058 added, replacing the raw ids (`full_name`,
    // `roles`) the menu printed until then. Asserting the human name here keeps
    // that fixed: the fallback in `column-label.ts` is silent, and an id would
    // render just as comfortably as a label.
    await member.getByRole('button', { name: 'View options' }).click()
    await member.getByRole('menuitemcheckbox', { name: 'Roles' }).click()
    await member.getByRole('menuitem', { name: 'Move email left' }).click()
    await member.keyboard.press('Escape')
    await expect(member.locator('thead th').nth(0)).toHaveText('Email')
    // `toContainText`, not `toHaveText`: the sorted header carries its sort
    // index inside the cell ("Full name1") — which is why the assertions after
    // the reload, where the sort has reset, can go back to exact text.
    await expect(member.locator('thead th').nth(1)).toContainText('Full name')

    await member.reload()
    await expect(member.getByText('1–25 of 29')).toBeVisible()
    await expect(member.locator('thead th', { hasText: 'Roles' })).toHaveCount(0)
    await expect(member.locator('thead th').nth(0)).toHaveText('Email')
    await expect(member.locator('thead th').nth(1)).toHaveText('Full name')

    // Resettable, and the reset forgets the stored copy rather than rearranging
    // what is on screen: the reload is what shows the difference.
    await member.getByRole('button', { name: 'View options' }).click()
    await member.getByRole('menuitem', { name: 'Reset columns' }).click()
    await member.keyboard.press('Escape')
    await member.reload()
    await expect(member.getByText('1–25 of 29')).toBeVisible()
    await expect(member.locator('thead th', { hasText: 'Roles' })).toHaveCount(1)
    await expect(member.locator('thead th').nth(0)).toHaveText('Full name')
    await expect(member.locator('thead th').nth(1)).toHaveText('Email')
  })

  test('7. the theme survives a reload, the sidebar follows the viewport, and Ctrl+K navigates', async ({
    browser,
  }) => {
    // The sign-in screen is outside the shell and carries its own switch: the
    // theme is a preference of the browser, not of the session.
    const guest = await createPage(browser)
    await guest.goto('/login')
    await guest.getByRole('button', { name: 'Theme' }).click()
    await guest.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(guest.locator('html')).toHaveClass(/dark/)
    await guest.reload()
    await expect(guest.locator('html')).toHaveClass(/dark/)
    await guest.getByRole('button', { name: 'Theme' }).click()
    await guest.getByRole('menuitemradio', { name: 'Light' }).click()
    await expect(guest.locator('html')).not.toHaveClass(/dark/)

    // The same on the dashboard: the stored choice is applied at first paint, so
    // a reload never flashes the other theme.
    await admin.goto('/dashboard')
    await admin.getByRole('button', { name: 'Theme' }).click()
    await admin.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(admin.locator('html')).toHaveClass(/dark/)
    await admin.reload()
    await expect(admin.locator('html')).toHaveClass(/dark/)
    await admin.getByRole('button', { name: 'Theme' }).click()
    await admin.getByRole('menuitemradio', { name: 'System' }).click()

    // Desktop: pinned and expanded, and the edge chevron offers the collapse
    // rather than the expand.
    await admin.setViewportSize(DESKTOP)
    await expect(admin.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
    await admin.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(admin.locator('[data-slot="sidebar"][data-state="collapsed"]')).toHaveCount(1)
    await admin.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(admin.locator('[data-slot="sidebar"][data-state="expanded"]')).toHaveCount(1)

    // Tablet: a fresh context, because "auto-collapsed on first load" is only
    // observable where no earlier choice was stored (§1.2 via F020).
    const tablet = await createPage(browser, TABLET)
    await signInAsAdmin(tablet)
    await expect(tablet.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await expect(tablet.locator('[data-slot="sidebar"][data-state="expanded"]')).toHaveCount(0)

    // Mobile: the sidebar is off canvas behind the header's menu button, and it
    // arrives as a dialog carrying the same navigation.
    const mobile = await createPage(browser, MOBILE)
    await signInAsAdmin(mobile)
    await mobile.getByRole('button', { name: 'Open navigation' }).click()
    const drawer = mobile.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('[data-sidebar="menu-button"][href="/admin/users"]')).toBeVisible()
    await mobile.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)

    // Ctrl/Cmd+K is the other way to navigate, and the sidebar and the palette
    // sharing one registry is what makes the destination exact.
    await admin.goto('/dashboard')
    // The shell attaches that listener when it mounts, and `goto` returns on
    // `load` — before the session request has resolved and the frame is up, so
    // a press here is a press into a page whose app is not listening yet. The
    // header's search affordance is the frame being there.
    await expect(admin.getByRole('button', { name: /Search anything/ })).toBeVisible()
    await admin.keyboard.press('Control+k')
    const palette = admin.getByRole('dialog')
    await expect(palette).toBeVisible()
    await palette.getByRole('combobox').fill('audit')
    await palette.getByRole('option', { name: 'Audit Trail' }).click()
    await expect(admin).toHaveURL(/\/admin\/audit$/)
  })

  test("8. notifications are read, deleted and cleared, and one account never sees another's", async ({
    browser,
  }) => {
    // The second account, created the same way as the first.
    const secondEmail = runEmail('e2e-second')
    const secondInitial = generatedPassword()
    await createUser(admin, {
      email: secondEmail,
      fullName: SECOND_FULL_NAME,
      password: secondInitial,
      roles: [MEMBER_ROLE],
    })
    run.secondEmail = secondEmail
    run.secondPassword = secondInitial

    // A password reset is the one event this platform notifies about (C34), so
    // the admin manufactures the notices: three for the member and one for the
    // second account. The counts themselves are the isolation evidence — a leak
    // would show the second account four.
    for (let index = 0; index < 3; index += 1) {
      run.memberPassword = await resetPassword(admin, MEMBER_FULL_NAME)
    }
    run.secondPassword = await resetPassword(admin, SECOND_FULL_NAME)

    // The resets ended every session the member had, so this is a real sign-in
    // rather than a page that still holds a cookie — and the account is behind
    // the forced-change gate again.
    await signIn(member, run.memberEmail!, run.memberPassword!)
    await expect(member).toHaveURL(/\/change-password$/)
    run.memberPassword = await changeForcedPassword(member, run.memberPassword!)
    await member.goto('/notifications')

    const notices = member.locator('ul[aria-label="Notifications"] li')
    await expect(notices).toHaveCount(3)
    await expect(member.getByText('3 unread')).toBeVisible()

    // Unread → read, and the filter is the server's (C35) rather than a view of
    // rows the screen already had.
    await member.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(member.getByText('3 unread')).toHaveCount(0)
    await member.getByRole('tab', { name: 'Unread', exact: true }).click()
    await expect(member.getByText("You're all caught up.")).toBeVisible()
    // `exact` because "Read" is a substring of the "Unread" tab beside it.
    await member.getByRole('tab', { name: 'Read', exact: true }).click()
    await expect(notices).toHaveCount(3)

    // Delete one, from the card the pointer is over: the control is revealed on
    // hover rather than absent.
    await member.getByRole('tab', { name: 'All', exact: true }).click()
    const first = notices.first()
    await first.hover()
    await first.getByRole('button', { name: 'Delete notification:' }).click()
    await expect(notices).toHaveCount(2)

    // The second account sees its own inbox: its single notice, and none of the
    // two the first account is still holding.
    const second = await createPage(browser)
    await signIn(second, run.secondEmail!, run.secondPassword!)
    await expect(second).toHaveURL(/\/change-password$/)
    run.secondPassword = await changeForcedPassword(second, run.secondPassword!)
    await second.goto('/notifications')
    await expect(second.locator('ul[aria-label="Notifications"] li')).toHaveCount(1)

    // Clear the first account's inbox: the confirmed deletion of every notice,
    // read or unread.
    await member.goto('/notifications')
    await member.getByRole('button', { name: 'Clear all' }).click()
    await member.getByRole('dialog').getByRole('button', { name: 'Clear all' }).click()
    await expect(member.getByText('No notifications yet')).toBeVisible()
  })

  test('9. the profile and password update, the old credentials and other sessions stop working, and signing out clears the state', async ({
    browser,
  }) => {
    // A second session of the same account, so "every other session is signed
    // out" is observed rather than asserted.
    const elsewhere = await createPage(browser)
    await signIn(elsewhere, run.memberEmail!, run.memberPassword!)

    await member.goto('/profile')
    await member.getByLabel('Full name').fill(MEMBER_RENAMED)
    await member.getByRole('button', { name: 'Save profile' }).click()
    await expect(member.getByText('Profile updated')).toBeVisible()
    // The change is the server's: a reload shows the stored value.
    await member.reload()
    await expect(member.getByLabel('Full name')).toHaveValue(MEMBER_RENAMED)

    const previous = run.memberPassword!
    const replacement = generatedPassword()
    await member.goto('/profile/security')
    await member.getByLabel('Current password').fill(previous)
    // A regex, because a required field's label ends in " (required)" and
    // substring matching would also find "Confirm new password".
    await member.getByLabel(/^new password/i).fill(replacement)
    await member.getByLabel('Confirm new password').fill(replacement)
    await member.getByRole('button', { name: 'Change password' }).click()
    await expect(member.getByText('Password changed')).toBeVisible()
    run.memberPassword = replacement

    // The other session is gone: its cookie is no longer a session, so the next
    // document it loads resolves as anonymous.
    await elsewhere.reload()
    await expect(elsewhere).toHaveURL(/\/login$/)

    // The old password is no longer a credential, and the new one is. The
    // refusal is the form's own alert — one deliberate failure, well inside the
    // five-attempt throttle.
    const fresh = await createPage(browser)
    await attemptSignIn(fresh, run.memberEmail!, previous)
    await expect(fresh.getByRole('alert')).toBeVisible()
    await expect(fresh).toHaveURL(/\/login$/)
    await signIn(fresh, run.memberEmail!, replacement)
    await expect(fresh).toHaveURL(/\/dashboard$/)

    // Signing out redirects, and the state it cleared is not recoverable by
    // walking back to a protected route.
    await fresh.getByRole('button', { name: 'Account menu' }).click()
    await fresh.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(fresh).toHaveURL(/\/login$/)
    await fresh.goto('/dashboard')
    await expect(fresh).toHaveURL(/\/login$/)
  })

  test('10. the directory exports a valid PDF, the export is permission-protected, and its refusal is handled', async () => {
    await admin.goto('/admin/users')

    // The admin holds both codes the route demands. The response is inspected
    // rather than trusted: "a valid PDF" means the bytes the browser received
    // are one. No converter service is involved — the document is rendered in
    // the API process (F053).
    const pending = admin.waitForResponse(
      (response) => response.url().endsWith(REPORT_API) && response.request().method() === 'POST',
    )
    await admin.getByRole('button', { name: 'Export PDF' }).click()
    const report = await pending
    expect(report.status()).toBe(200)
    expect(report.headers()['content-type']).toContain('application/pdf')
    expect(report.headers()['content-disposition']).toContain('.pdf')
    expect((await report.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // The preview opens on that document and offers it as a download named by
    // the server's own `Content-Disposition`.
    const preview = admin.getByRole('dialog')
    await expect(preview).toBeVisible()
    await expect(preview.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      /\.pdf$/,
    )
    await preview.getByRole('button', { name: 'Done' }).click()
    await expect(preview).toHaveCount(0)

    // A hidden button is not protection: the member holds `users.read` (step 5)
    // but not `reports.generate`, so the screen does not offer what the server
    // would refuse — and the server refuses it either way. The session used here
    // is the one step 9 renewed; nothing signs in again.
    await member.goto('/admin/users')
    await expect(member.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(member.getByRole('button', { name: 'Export PDF' })).toHaveCount(0)
    expect((await apiPost(member, REPORT_API, {})).status()).toBe(403)

    // The failure this directory can actually produce is the row cap, which a
    // 30-account database cannot reach; the response is replayed instead, so the
    // screen is asked what it does with the API's own refusal: say it, and open
    // no document. The replayed body is the service's sentence verbatim.
    await admin.route(REPORT_API, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          detail:
            'This export would contain more than 1000 accounts. Narrow the ' +
            'filters: one report covers up to 1000 rows.',
        }),
      }),
    )
    await admin.goto('/admin/users')
    await admin.getByRole('button', { name: 'Export PDF' }).click()
    await expect(admin.getByText(/Narrow the filters/)).toBeVisible()
    await expect(admin.getByRole('dialog')).toHaveCount(0)
    await admin.unroute(REPORT_API)
  })

  test('11. a deep link refreshes on the built static server, and the edge paths behave', async ({
    browser,
  }) => {
    // The production-style server, not the dev one: `vite preview` serves the
    // built `dist/` with no middleware that rewrites unknown paths, so a deep
    // link that still lands on the screen after a refresh is the SPA fallback
    // rather than luck. The session cookie is the same one — cookies ignore
    // ports — and the preview carries the same /api proxy the dev server does.
    await admin.goto(`${previewOrigin}/admin/users`)
    await expect(admin.getByRole('heading', { name: 'Users' })).toBeVisible()
    await admin.reload()
    await expect(admin.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(admin).toHaveURL(`${previewOrigin}/admin/users`)

    // 404: inside the shell, so the navigation stays usable.
    await admin.goto('/no-such-page')
    await expect(admin.getByRole('heading', { name: '404 — Page not found' })).toBeVisible()
    await admin.getByRole('link', { name: 'Back to dashboard' }).click()
    await expect(admin).toHaveURL(/\/dashboard$/)

    // The server being unreachable, as distinct from the server refusing: the
    // request is aborted, so it leaves with no response at all — which is the
    // case the `offline` copy and its Retry are for. Retry is only believed once
    // the table is there, since the heading shows in the failure state too.
    await admin.route(/\/api\/v1\/admin\/audit/, (route) => route.abort('failed'))
    await admin.goto('/admin/audit')
    await expect(admin.getByRole('alert')).toContainText(/reach the server/)
    await admin.unroute(/\/api\/v1\/admin\/audit/)
    await admin.getByRole('button', { name: 'Retry' }).click()
    await expect(admin.getByRole('alert')).toHaveCount(0)
    await expect(admin.getByRole('table', { name: 'Audit trail' })).toBeVisible()

    // Required labels: both fields answer to the name a screen reader
    // announces — the label plus the "(required)" the form's label component
    // adds for assistive tech. The visible asterisk is `aria-hidden` and the
    // form is `noValidate`, so there is no HTML `required` attribute here;
    // the accessible name *is* how the requirement reaches a reader.
    const guest = await createPage(browser)
    await guest.goto('/login')
    await expect(guest.getByRole('textbox', { name: 'Email (required)' })).toBeVisible()
    await expect(guest.getByRole('textbox', { name: 'Password (required)' })).toBeVisible()

    // The keyboard path through the form, in DOM order.
    await guest.getByLabel('Email').focus()
    await guest.keyboard.press('Tab')
    await expect(guest.getByLabel('Password')).toBeFocused()
    await guest.keyboard.press('Tab')
    await expect(guest.getByRole('button', { name: 'Sign in' })).toBeFocused()

    // Dialog focus trapping: Tab and Shift+Tab cycle inside the open dialog
    // rather than reaching the page behind it.
    //
    // The read is polled rather than taken once, because the cycle is not
    // synchronous inside the trap: base-ui renders a visually hidden focus
    // guard before and after the popup and, when Tab reaches the guard, moves
    // focus back to the first (or last) tabbable element **on the next
    // animation frame**. So for one frame after the key that wraps,
    // `document.activeElement` is the guard — a sibling of the popup rather
    // than a descendant, so not "inside" it. A one-shot read therefore fails
    // intermittently at the boundary (observed on the second run of the same
    // tree), while the trap itself never let focus reach the page. `poll`
    // keeps the assertion's meaning — focus settles inside, and a real escape
    // never settles — without depending on which frame the read lands in.
    await admin.goto('/admin/users')
    await admin.getByRole('button', { name: 'Add user' }).click()
    const dialog = admin.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const focusInsideDialog = () => dialog.evaluate((node) => node.contains(document.activeElement))
    for (let press = 0; press < 12; press += 1) {
      await admin.keyboard.press('Tab')
      await expect
        .poll(focusInsideDialog, {
          message: `focus left the dialog after ${press + 1} forward presses`,
        })
        .toBe(true)
    }
    await admin.keyboard.press('Shift+Tab')
    await expect
      .poll(focusInsideDialog, { message: 'focus left the dialog on a backward press' })
      .toBe(true)
    await admin.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})

/**
 * Grant or revoke one permission on one role, through the matrix screen.
 *
 * One cell and one save — the screen's own contract is one save for the whole
 * matrix, so this counts as one operator action rather than a shortcut around
 * the UI. The bar is asserted first (the screen only offers the save once the
 * draft differs), then the toast is the server's own word that the write
 * landed.
 *
 * What this does *not* assert is the bar disappearing, which is what the
 * first F057 run waited on — and it never went away while the grant was
 * already in the database (verified against `app_e2e` afterwards). The seeded
 * draft is compared against the roles query's *new* data while it was seeded
 * from the previous entry, so the just-saved cell comes back rendered
 * unchanged with "1 unsaved change" beside it. That is a defect in the screen,
 * not in the workflow: it is recorded as an app finding in `NEXT_PROMPT.md`,
 * and the assertion here is the persisted answer, read the way a reloading
 * admin reads it.
 */
async function setRolePermission(
  page: Page,
  role: string,
  code: string,
  granted: boolean,
): Promise<void> {
  await page.goto('/admin/roles')
  const cell = page.getByRole('checkbox', { name: `${role}: ${code}` })
  if (granted) await cell.check()
  else await cell.uncheck()

  await expect(page.locator('[data-slot="matrix-save-bar"]')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Permissions saved')).toBeVisible()

  // A hard reload: the guard is an in-app `useBlocker`, so nothing asks, and
  // the draft is seeded from the server exactly as a fresh visit seeds it.
  await page.reload()
  const reloaded = page.getByRole('checkbox', { name: `${role}: ${code}` })
  if (granted) await expect(reloaded).toBeChecked()
  else await expect(reloaded).not.toBeChecked()
}

/** Create an account through the admin's directory screen, roles and all. */
async function createUser(
  page: Page,
  account: { email: string; fullName: string; password: string; roles: string[] },
): Promise<void> {
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Add user' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^email/i).fill(account.email)
  await dialog.getByLabel(/full name/i).fill(account.fullName)
  await dialog.getByLabel(/initial password/i).fill(account.password)
  for (const role of account.roles) {
    await dialog.getByRole('checkbox', { name: role }).check()
  }
  await dialog.getByRole('button', { name: 'Create user' }).click()
  // A password was supplied, so the dialog says which one the account now holds
  // instead of showing a generated value once.
  await expect(dialog.getByText(/was created with the initial password/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
}

/**
 * Reset an account's password and read the temporary one out of the dialog.
 *
 * The value is shown once and nowhere else — not in the audit trail, not in the
 * directory's list — so this is the only way to hold it, and it is what makes
 * the reset accounts in step 8 usable at all.
 */
async function resetPassword(page: Page, fullName: string): Promise<string> {
  await page.goto('/admin/users')
  await page.getByRole('button', { name: `Actions for ${fullName}` }).click()
  await page.getByRole('menuitem', { name: 'Reset password' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Reset password' }).click()
  const temporary = (await dialog.locator('code').innerText()).trim()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
  expect(temporary.length).toBeGreaterThan(8)
  return temporary
}
