import { defineConfig } from '@hey-api/openapi-ts'

/**
 * Typed DTO generation (F018, BIG-PROMPT §9.4).
 *
 * Input is the backend's committed OpenAPI export — regenerate it first when
 * the API changes: `cd backend && uv run python -m scripts.export_openapi`.
 * Only the TypeScript-types plugin runs: requests go through our own Axios
 * client (`src/lib/api.ts`), which owns error normalization and the 401 retry
 * policy, so a generated SDK would be a second, competing transport.
 *
 * The output is committed; CI (F061) regenerates and fails on any diff. See
 * `docs/OPENAPI_CLIENT.md`.
 */
export default defineConfig({
  input: '../backend/openapi.json',
  output: 'src/lib/generated/api',
  plugins: ['@hey-api/typescript'],
})
