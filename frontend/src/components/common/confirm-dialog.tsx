import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * The confirmation dialog of BIG-PROMPT §5.2b, for the actions that cannot be
 * undone by trying again. Recorded in `REQUIREMENT_TRACEABILITY.md` §14 (G-2)
 * against F013, which delivered the overlay primitives but not this composite;
 * F019 built it because its first real consumer is the unsaved-changes guard
 * (and F034's destructive user actions follow).
 *
 * The dialog is **controlled**: `open` is the caller's state, so a flow that
 * must stay open while an async action runs can hold it open with `pending`
 * (which disables both buttons and ignores Escape/overlay dismissals).
 * `closeOnConfirm` defaults to true for the common synchronous case; pass
 * `false` when the caller closes the dialog itself once the work settles.
 */
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm action as destructive. */
  destructive?: boolean
  /** The confirmed action is in flight: busy confirm, no dismissals. */
  pending?: boolean
  /** Default true — the dialog closes itself right after `onConfirm`. */
  closeOnConfirm?: boolean
  onConfirm: () => void
  /** Called for a dismissal (Escape, overlay click, Cancel). */
  onCancel?: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  closeOnConfirm = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const requestClose = (): void => {
    onCancel?.()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A pending action must not be abandoned by a stray Escape — the
        // caller loses the chance to report the outcome.
        if (pending) return
        if (next) onOpenChange(true)
        else requestClose()
      }}
    >
      <DialogContent data-slot="confirm-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={requestClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            loading={pending}
            onClick={() => {
              onConfirm()
              if (closeOnConfirm) onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
