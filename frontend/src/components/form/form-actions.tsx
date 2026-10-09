import type { ReactNode } from 'react'
import { useFormState } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FormActionsProps {
  submitLabel?: string
  cancelLabel?: string
  /**
   * Renders the cancel control. The caller owns the behaviour — typically
   * `form.reset()` — because only it knows what "original values" means.
   */
  onCancel?: () => void
  /** Extra controls, pushed to the leading edge (e.g. a secondary action). */
  children?: ReactNode
  /** An additional reason to block submission, e.g. missing permission. */
  disabled?: boolean
  className?: string
}

/**
 * The submit/cancel bar (§5.4: pending submission, duplicate-submit
 * prevention, reset/cancel).
 *
 * Pending state comes from the form context (`useFormState` — RHF's proxy
 * tracks which properties were read, so this re-renders on `isSubmitting`
 * alone). While submitting, the submit button is busy **and disabled** and the
 * cancel control is disabled: `handleSubmit` already ignores a second submit
 * while its promise is in flight, and the disabled button removes the click
 * that would have been silently dropped.
 */
export function FormActions({
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  onCancel,
  children,
  disabled = false,
  className,
}: FormActionsProps) {
  const { isSubmitting } = useFormState()

  return (
    <div
      data-slot="form-actions"
      className={cn('flex flex-wrap items-center justify-end gap-2', className)}
    >
      {children ? <div className="me-auto flex items-center gap-2">{children}</div> : null}
      {onCancel ? (
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" loading={isSubmitting} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  )
}
