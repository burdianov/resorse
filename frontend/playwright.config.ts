import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '@playwright/test'

import {
  apiOrigin,
  apiPort,
  devOrigin,
  devPort,
  previewOrigin,
  previewPort,
} from './tests/e2e/support/origins'
import { STATE_FILE } from './tests/e2e/support/state'

/**
 * The browser suite (F057; BIG-PROMPT §10.4).
 *
 * BP-10.4 asks for Playwright "against real API + freshly migrated real
 * Postgres, seeded with generated test credentials only in isolated test
 * configuration". Every part of that sentence is a decision here:
 *
 * - **Real API, real Postgres.** Nothing is mocked and there is no MSW in this
 *   project: the browser talks to a real uvicorn against a real database, which
 *   is what makes the session, CSRF, RBAC and cookie behaviour under test the
 *   behaviour a deployment has.
 * - **Freshly migrated.** The API server's own start command prepares the
 *   database first (`backend/scripts/e2e_database.py`): drop, create, migrate to
 *   head, bootstrap the super-admin, add directory fillers. A run therefore
 *   begins at the workflow's own beginning — bootstrap — rather than on top of
 *   whatever the last run left behind.
 * - **Isolated.** Its own database (`app_e2e`, never `app_dev`), its own ports
 *   (API 8001, dev server 5174, static preview 4174), so a developer's stack on
 *   8000/5173 keeps running untouched. `ALLOWED_ORIGINS` is widened to the two
 *   E2E origins *for this process only*, which is also the proof that CSRF
 *   checks origins rather than trusting a proxy.
 * - **Generated credentials.** The admin password is generated per run by that
 *   script and reaches the specs through an ignored state file. No `.env`
 *   value, no `LOCAL_CREDENTIALS.md`, and no account that is not created inside
 *   the run.
 *
 * **One worker, no retries, and the workflow is one file.** BP-10.4's eleven
 * steps are a *sequence*: step 3 needs the account step 2 created, step 8 needs
 * the notification step 9's password reset raises. Parallelising them, or
 * retrying one of them in the middle, would be testing a state the workflow
 * never produces. Ordering inside the file is `describe.serial`; `workers: 1`
 * keeps the two independent checks in it from interleaving.
 *
 * **No traces.** A Playwright trace embeds DOM snapshots, and a snapshot taken
 * on the login screen carries the password typed into it — a credential the run
 * generated, written to disk in a file nothing prunes. Failures keep a
 * screenshot, where a `type=password` field shows dots; the trace can be turned
 * on by hand when debugging.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(here, '../backend')

/**
 * The isolated database's URL, asked of the backend rather than derived here:
 * the DSN rules (driver, port, the database-name swap) live in one place, and
 * reading them a second time in TypeScript is how two sources of truth start.
 * Side-effect free — the reset happens inside the API server's start command,
 * so nothing about this file touches a database.
 */
function e2eDatabaseUrl(): string {
  return execFileSync('uv', ['run', 'python', '-m', 'scripts.e2e_database', '--print-url'], {
    cwd: backendRoot,
    encoding: 'utf8',
  }).trim()
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // §10.4: "visual differences beyond intentionally approved tolerances" fail.
    // Nothing is approved, so the tolerance is none: a screenshot that differs
    // by a pixel fails, and the reviewer sees the diff. Loosening this later is
    // a decision somebody has to make and record, which is the point.
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: devOrigin,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  /**
   * Two projects, and the order between them is a contract rather than a
   * filename accident.
   *
   * The workflow has to run first. It is the run's beginning — step 2 is the
   * bootstrapped account's **first** sign-in, the one the forced-change gate
   * exists for (BP-6.1b) — and the gate is a one-time event per database. Any
   * spec that signed the admin in before it would consume that gate, and step
   * 2's assertion would then be checking a state the app no longer produces.
   * `dependencies` is what states that: `quality` waits for `workflow`, so
   * `pnpm run test:a11y` and `pnpm run test:visual` — which select this project
   * — run the workflow too and cannot be run in a way that violates it.
   *
   * The cost of the coupling is that a broken workflow skips the scans, and it
   * is worth paying: a workflow failure is a failure of the app the screens are
   * pictures of, and "green scans of an app that cannot complete a sign-in"
   * would be the more misleading result.
   */
  projects: [
    { name: 'workflow', testMatch: /workflow\.spec\.ts$/ },
    {
      name: 'quality',
      testMatch: /(accessibility|visual)\.spec\.ts$/,
      dependencies: ['workflow'],
    },
  ],
  webServer: [
    {
      // The database first, then the API — chained, so uvicorn cannot start
      // against a database that does not exist yet whatever order Playwright
      // starts its servers in.
      command:
        `uv run python -m scripts.e2e_database --state-file "${STATE_FILE}" && ` +
        `uv run uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: backendRoot,
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        // The browser's origin, not the API's: the SPA proxies /api, so the
        // Origin header on a mutation is the frontend's (ARCHITECTURE §2).
        ALLOWED_ORIGINS: `${devOrigin},${previewOrigin}`,
        // The workflow signs in a dozen times — BP-10.4 is a sequence of
        // accounts, not one session — and the login throttle is five attempts
        // per fifteen minutes per *source address*, which a successful login
        // deliberately does not clear (`services/auth.py`). Everything in this
        // run arrives from 127.0.0.1, so the sixth sign-in is refused long
        // before the workflow is over. The throttle's own behaviour is F026 and
        // F028's tested subject; here the budget is raised for this process
        // only, which is the "isolated test configuration" half of BP-10.4.
        // Step 9 still takes one deliberate failed sign-in through the form.
        LOGIN_MAX_ATTEMPTS: '200',
      },
    },
    {
      command: `pnpm exec vite --port ${devPort} --strictPort`,
      cwd: here,
      url: `${devOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { RESORS_API_TARGET: apiOrigin },
    },
    {
      // The production-style static server BP-10.4 step 11 asks for: the real
      // `dist/`, served by `vite preview`, with the same proxy the dev server
      // has. A deep link has to load from `index.html` here even though no dev
      // middleware exists to rewrite it.
      command: `pnpm run build && pnpm exec vite preview --port ${previewPort} --strictPort`,
      cwd: here,
      url: `${previewOrigin}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { RESORS_API_TARGET: apiOrigin },
    },
  ],
})
