/**
 * The projects screens' shared vocabulary (D009), typed once.
 *
 * The reference tables' `rules.ts` mirrors values the server owns by hand. This
 * one does not have to: D008 put the lifecycle vocabulary into the Pydantic
 * shape, `scripts/export_openapi` put it in `backend/openapi.json`, and
 * `pnpm run api:types` emitted it into the generated client — so
 * `ProjectItem['status']` **is** the server's own union rather than a copy of
 * it. `PROJECT_STATUSES` is tied to that union and
 * `PROJECT_STATUS_LABELS` is keyed by it, which is what makes a fourth
 * lifecycle state a compile error here instead of a screen that silently
 * cannot show it (the shape the server's own test pins from its side).
 *
 * The labels are display only; the stored tokens are the payload's form and
 * stay in every request (the reference tables' classification rule).
 */

import type { ProjectItem } from '@/lib/generated/api'

/** D007's closed vocabulary, read from the generated contract. */
export type ProjectStatus = ProjectItem['status']

/**
 * The three states in lifecycle order. `satisfies` is the tie to the contract:
 * a member that the server's union does not have fails to compile, and
 * `Record<ProjectStatus, string>` below fails to compile if the server gains a
 * state this list has not added.
 */
export const PROJECT_STATUSES = [
  'tender',
  'awarded',
  'retired',
] as const satisfies readonly ProjectStatus[]

/** The tokens as a person reads them (the picker and the badges both use this). */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  tender: 'Tender',
  awarded: 'Awarded',
  retired: 'Retired',
}

/**
 * The picker's options, `{value, label}` — the shape base-ui's `Select.items`
 * takes.
 *
 * **It is not optional.** `Select.Value` resolves the closed control's label
 * from `items` and falls back to stringifying the raw value when none is
 * supplied, so a picker with lower-case tokens renders `retired` until its popup
 * has been opened once (`components/form/fields.tsx` records the same defect
 * found in the form kit, where the fix lives for `SelectField`). Both project
 * screens pass this, so the closed control and the option list cannot disagree
 * about what a state is called.
 */
export const PROJECT_STATUS_ITEMS = PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}))
