import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Same-origin development: the SPA calls relative `/api/v1` and Vite proxies it
// to the FastAPI dev server, so no CORS and first-party cookies (ARCHITECTURE §2).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    // Component tests live under tests/ so they stay out of the app bundle's
    // source tree, alongside the unit/e2e/visual split from BIG-PROMPT §9.
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // Vitest's 5 s default is a budget for an idle machine; this suite never
    // runs on one. 67 files each build a fresh jsdom (the setup alone is ~1.2 s
    // per file, measured across the suite) and vitest runs them up to the 28
    // cores at once, so any machine-wide load spike stretches a test's wall
    // clock while the test's own work is unchanged. Observed: three tests at
    // 5089 / 5098 / 5146 ms in one run — a git stash rewriting 16 files with
    // the antivirus re-scanning them — where the same tests pass in ~1.5 s
    // standalone, and two runs immediately before and after were green at
    // 563/563. 15 s is a ceiling for a loaded machine, not a target: it is
    // deliberately no larger, and it is what lets the lab route's own 10 s
    // finder timeout below actually be reached — under a 5 s test budget that
    // assertion could never fire, which is how it was found.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Measure the application source, not the test harness. The exclusions
      // are by category, and each is code this project does not hand-write:
      //   - `src/lib/generated/` — emitted by `pnpm run api:types` (F018);
      //   - `src/main.tsx` — the mount call, exercised by the build, not tests;
      //   - `src/testing/` — MSW handlers and stubs used *by* the tests;
      //   - `src/components/ui/` — the shadcn registry's components, normalised
      //     by `scripts/fix-generated-ui.sh` (F014).
      // Everything else under `src/` counts, whether or not a test reaches it,
      // so the number cannot be raised by quietly narrowing the set.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/lib/generated/**',
        'src/main.tsx',
        'src/testing/**',
        'src/components/ui/**',
        'src/**/*.d.ts',
      ],
      // Two thresholds, measuring two different things:
      //
      // - `src/lib/**` is BP-10.5's "core": the shared library every feature
      //   rides on (the API client, the query keys, the CSV and filename
      //   helpers, the access predicate). 85 is the requirement's own number,
      //   not one chosen to fit — the F055 measurement clears it (94.04 st /
      //   85.71 br / 90.32 fn / 95.65 ln).
      // - The global numbers are a **ratchet** at the F055 measurement
      //   (92.65 / 80.49 / 91.14 / 93.71), rounded down. They exist to make a
      //   regression visible, and are meant to be raised as tests are added —
      //   never lowered to turn a red run green.
      thresholds: {
        'src/lib/**': { statements: 85, branches: 85, functions: 85, lines: 85 },
        statements: 92,
        branches: 80,
        functions: 91,
        lines: 93,
      },
    },
  },
})
