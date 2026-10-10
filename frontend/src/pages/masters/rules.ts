/**
 * The three reference tables' shared rules (D006), typed once.
 *
 * Every value here mirrors one the server owns: `app/models/masters.py` holds
 * `CODE_PATTERN`, the two field widths and the classification vocabulary,
 * `app/schemas/masters.py` enforces them. A screen that retyped them per page
 * would drift from the server one page at a time, so they are written down
 * once and imported by all three. They are checks for *speed* only — the
 * server still owns the verdict, and its 422 lands on the field through
 * `applyServerErrors`.
 *
 * **What is deliberately not mirrored: the code's immutability.** The server's
 * update schemas carry no `code` and set `extra="forbid"`, so a PATCH that
 * submitted one would be a 422 at the unknown field rather than a change. The
 * edit forms therefore *show* the code and never send it.
 */

import { z } from 'zod'

/** `^[a-z][a-z0-9_]*$` — `CODE_PATTERN` in `app/models/masters.py`. */
export const CODE_PATTERN = /^[a-z][a-z0-9_]*$/
/** `MAX_CODE_LENGTH` — the same constant, mirroring `String(32)` on the column. */
export const MAX_CODE_LENGTH = 32
/** `MAX_NAME_LENGTH` — the same constant, mirroring `String(200)` on the column. */
export const MAX_NAME_LENGTH = 200

/** The closed vocabulary of `DepartmentClassification` (`app/schemas/masters.py`). */
export const DEPARTMENT_CLASSIFICATIONS = ['HEAD_OFFICE', 'SITE'] as const
export type DepartmentClassification = (typeof DEPARTMENT_CLASSIFICATIONS)[number]

/**
 * The two tokens as a person reads them. The tokens themselves are the stored
 * form and stay in the payload; only the display is friendly. A test pins the
 * keys to the vocabulary above so a third classification cannot be added
 * without a label.
 */
export const CLASSIFICATION_LABELS: Record<DepartmentClassification, string> = {
  HEAD_OFFICE: 'Head Office',
  SITE: 'Site',
}

/** A machine-stable slug: lowercase, never blank, never quietly normalised. */
export const codeField = z
  .string()
  .trim()
  .min(1, 'Enter a code.')
  .max(MAX_CODE_LENGTH, `Use at most ${MAX_CODE_LENGTH} characters.`)
  .regex(CODE_PATTERN, 'Lowercase letters, digits and underscores, starting with a letter.')

/** A name that is present once trimmed — the client half of the model's CHECK. */
export const nameField = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters.`)

/**
 * A picker's options: the active rows, plus the row a form already holds even
 * if it has since been deactivated. Without the second half, editing a
 * designation whose department was retired would silently blank the field.
 */
export function referenceOptions<T extends { id: string; is_active: boolean }>(
  items: readonly T[],
  selectedId: string | null,
  label: (item: T) => string,
): { value: string; label: string }[] {
  return items
    .filter((item) => item.is_active || item.id === selectedId)
    .map((item) => ({ value: item.id, label: label(item) }))
}
