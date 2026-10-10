import type { APIResponse, Page } from '@playwright/test'

/**
 * Calls the API from a spec's own browser context (F057).
 *
 * Steps 4, 5 and 10 assert that the *server* refuses something the screen does
 * not offer, which is an assertion a screen cannot make about itself: a hidden
 * button is not a permission check. `page.request` shares the context's cookie
 * jar, so these calls carry the same `__Host-session` cookie the page is using
 * and are answered by the same guards.
 *
 * A mutating call needs `X-CSRF-Token` as well — F029's double-submit check
 * compares it to the readable `__Host-csrf` cookie, and a bare `page.request`
 * sends no such header. Reading that cookie here is exactly what `lib/api.ts`
 * does on the front end, so the request is the one the app would have made.
 */
export async function csrfToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  const cookie = cookies.find((entry) => entry.name === '__Host-csrf')
  if (cookie === undefined) {
    throw new Error('no __Host-csrf cookie in this context: nothing is signed in')
  }
  return cookie.value
}

/** A session-less GET: the shape a direct API call takes when no CSRF is due. */
export function apiGet(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(path)
}

/** A signed-in unsafe call, carrying the CSRF header the middleware demands. */
export async function apiPost(
  page: Page,
  path: string,
  data: unknown = null,
): Promise<APIResponse> {
  return page.request.post(path, {
    headers: { 'X-CSRF-Token': await csrfToken(page) },
    ...(data === null ? {} : { data }),
  })
}
