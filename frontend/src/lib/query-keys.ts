/**
 * Every TanStack Query key in the application is built from this module
 * (BIG-PROMPT §9.2). Centralising them is what makes targeted invalidation
 * possible later (`invalidateQueries({ queryKey: queryKeys.users.all })`) and
 * keeps two features from inventing two spellings of the same key.
 *
 * **Identity rule.** A key for data that belongs to the signed-in user must
 * contain that user's id — e.g. `['users', userId, 'preferences']` (F041) —
 * never just the resource name. F032 clears the query cache when the identity
 * changes; carrying the id in the key means that even a missed clear cannot
 * serve one account's data from another's cache entry.
 *
 * Keys are `as const` tuples so TypeScript narrows them structurally.
 */
export const queryKeys = {
  /** Liveness of the API — GET /api/v1/health. */
  health: ['health'] as const,
} satisfies Record<string, readonly unknown[]>
