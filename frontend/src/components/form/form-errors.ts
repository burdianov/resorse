import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'

import { toApiError } from '@/lib/errors'
import type { ApiError } from '@/lib/errors'

/**
 * Server → form error mapping (§5.4), the other half of the `ApiError`
 * contract F018 built: Pydantic's 422 entries arrive as dotted field paths
 * (`email`, `items.0.name`) and land on the matching form fields here.
 *
 * Rules, in order:
 *
 * 1. **Previous server errors are cleared.** A second attempt must not show the
 *    first attempt's messages next to a field the user has since corrected.
 * 2. **Each field error goes to its field** — `setError` with type `server`,
 *    which `FormMessage` renders and `FormControl` announces through the
 *    field's `aria-describedby`.
 * 3. **The request as a whole always gets a root error** with the normalised
 *    `ApiError.detail`. For a 422 that is "Some of the submitted values need
 *    attention."; for an unreachable server, the network message; for a 403,
 *    the permission message. `FormError` renders it once, as `role="alert"` —
 *    so a failed submit is always *stated*, never just implied by red borders.
 *    An entry located at the body itself (empty `field`) contributes no field
 *    error but still lands here via the root message.
 *
 * Returns the normalised `ApiError` so the caller can decide what else to do
 * (bump a counter, close a dialog, …). The caller's mutation should carry
 * `meta: { suppressErrorToast: true }` — the form is already saying it, and the
 * query layer's default toast would say it twice.
 */
export function applyServerErrors<TValues extends FieldValues>(
  error: unknown,
  form: UseFormReturn<TValues>,
): ApiError {
  const apiError = toApiError(error)

  form.clearErrors()
  for (const fieldError of apiError.fieldErrors) {
    if (fieldError.field === '') continue
    form.setError(fieldError.field as FieldPath<TValues>, {
      type: 'server',
      message: fieldError.message,
    })
  }
  form.setError('root', { type: 'server', message: apiError.detail })

  return apiError
}
