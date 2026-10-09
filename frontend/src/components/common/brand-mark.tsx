import { APP_MARK, APP_NAME } from '@/config/branding'

/**
 * The neutral brand block shown on the standalone auth screens (`/login`,
 * `/change-password`) — the same mark the mobile header draws, from the same
 * `config/branding.ts` constants (BIG-PROMPT §0.2: no reference branding; the
 * mark is derived from the name at render time, so there is no asset to
 * replace when the operator sets a real name).
 */
export function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-2">
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
      >
        {APP_MARK}
      </span>
      <span className="text-lg font-semibold">{APP_NAME}</span>
    </div>
  )
}
