import { setupServer } from 'msw/node'

/**
 * The MSW server every test file talks to (BIG-PROMPT §10.3).
 *
 * No handlers are registered here on purpose: each test declares the endpoints
 * it exercises with `server.use(...)`, so a test can never silently depend on
 * another test's mocks. `src/testing/setup.ts` owns the lifecycle — it starts
 * the server before the suite, resets handlers between tests and closes it at
 * the end — and answers unhandled requests with an error, so a request nobody
 * mocked fails loudly instead of hanging or hitting jsdom's network stub.
 */
export const server = setupServer()
