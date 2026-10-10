/**
 * The three origins of the browser stack (F057).
 *
 * One definition, two consumers: `playwright.config.ts` starts each server on
 * its port, and the workflow spec needs the *static preview* for step 11's
 * deep-link refresh. A refresh of a deep link only proves something about the
 * built bundle when the server serving it has no dev middleware: Vite's dev
 * server rewrites unknown paths itself, so a refresh that "works" on 5174 is
 * exactly the case that would have passed without a fallback existing.
 *
 * Ports are overridable so a developer whose 8001 is occupied can move the
 * whole stack without touching either file.
 */
export const apiPort = Number(process.env.E2E_API_PORT ?? 8001)
export const devPort = Number(process.env.E2E_DEV_PORT ?? 5174)
export const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 4174)

export const apiOrigin = `http://localhost:${apiPort}`
/** The Vite dev server: the app's source, with HMR. The suite's `baseURL`. */
export const devOrigin = `http://localhost:${devPort}`
/** `vite preview` over the built `dist/` — the production-style static server. */
export const previewOrigin = `http://localhost:${previewPort}`
