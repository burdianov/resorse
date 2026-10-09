/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * API origin override, e.g. `https://api.example.com` (ARCHITECTURE §2).
   * Unset — the normal case — means same origin: requests use the relative
   * `/api/v1` paths from the OpenAPI schema and run through the Vite proxy in
   * development. Never carries a secret (§9.3).
   */
  readonly VITE_API_URL?: string
}
