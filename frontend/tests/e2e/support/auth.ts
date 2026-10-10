import { expect, type Page } from '@playwright/test'

import { generatedPassword, readState } from './state'

/**
 * Signing in, the way a person does (F057).
 *
 * Every step of BP-10.4's workflow begins with somebody signing in, and every
 * sign-in here goes through the real form: the browser is what proves the
 * session cookie, the CSRF token and the forced-change gate work, and a helper
 * that skipped the form (or injected a cookie) would prove none of them.
 */

/** Fill the login form and submit, without waiting for the outcome. */
export async function attemptSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

/**
 * Sign in and return once the app has left the sign-in screen.
 *
 * A *failed* sign-in needs `attemptSignIn` instead: this one waits for the URL
 * to change, and a refused credential leaves it exactly where it was.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await attemptSignIn(page, email, password)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/**
 * Replace the password an account is required to change (BP-6.1b).
 *
 * Returns once the app has **left the gate**, not merely once the button was
 * clicked: the change rotates the session, and a navigation that beats the
 * rotation's response sends the superseded token, which the server — correctly
 * — reads as reuse and answers by revoking the whole family. The first F057 run
 * did exactly that (step 8's `goto` went out while the change was in flight;
 * `sessions.revoked_reason` came back `theft_detected` and the browser was
 * signed out). Waiting here is the contract, so no caller has to remember it.
 *
 * Writes nothing: which credential a caller must remember afterwards is the
 * caller's business — step 2 persists the admin's (later steps sign in as the
 * admin again), while the ordinary and second accounts are remembered in the
 * run's own record. A helper that wrote every replacement into the admin's slot
 * is how the state file would end up claiming the wrong password for the
 * account every later admin sign-in uses.
 */
export async function changeForcedPassword(page: Page, currentPassword: string): Promise<string> {
  await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible()
  const replacement = generatedPassword()
  await page.getByLabel(/current password/i).fill(currentPassword)
  await page.getByLabel(/^new password/i).fill(replacement)
  await page.getByLabel(/confirm new password/i).fill(replacement)
  await page.getByRole('button', { name: /change password/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/change-password'))
  return replacement
}

/** Sign in as the bootstrapped super-admin, clearing the forced-change gate. */
export async function signInAsAdmin(page: Page): Promise<void> {
  const state = readState()
  await signIn(page, state.adminEmail, state.adminPassword)
  if (new URL(page.url()).pathname === '/change-password') {
    await changeForcedPassword(page, state.adminPassword)
    await page.waitForURL(/\/dashboard/)
  }
}
