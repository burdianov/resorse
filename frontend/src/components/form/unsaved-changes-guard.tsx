import { useBlocker } from 'react-router'

import { ConfirmDialog } from '@/components/common/confirm-dialog'

interface UnsavedChangesGuardProps {
  /** Typically `form.formState.isDirty`. */
  when: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}

/**
 * The unsaved-changes prompt of §5.4, for as long as the form is still
 * mounted. `useBlocker` (data-router mode) intercepts in-app navigation —
 * a sidebar link, the palette, a `Link`, the browser's back button — and this
 * renders the standard confirmation instead of silently dropping the edits.
 *
 * What it deliberately does **not** cover: closing the tab or a hard reload.
 * That is the browser's own `beforeunload` prompt, a different mechanism with
 * different wording (`useBeforeUnload`, wired when a screen actually needs it)
 * — pretending one covers the other is how data gets lost.
 *
 * The dialog's `open` is derived from the blocker's state, so it cannot get out
 * of sync with the navigation it is guarding; `closeOnConfirm={false}` because
 * `proceed()` changes that state itself — closing from here would first report
 * the decision back as a *cancellation*.
 */
export function UnsavedChangesGuard({
  when,
  title = 'Discard unsaved changes?',
  description = 'Leaving this page will lose the changes you have made.',
  confirmLabel = 'Discard changes',
  cancelLabel = 'Stay on this page',
}: UnsavedChangesGuardProps) {
  const blocker = useBlocker(when)

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset()
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      destructive
      closeOnConfirm={false}
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed()
      }}
      onCancel={() => {
        if (blocker.state === 'blocked') blocker.reset()
      }}
    />
  )
}
