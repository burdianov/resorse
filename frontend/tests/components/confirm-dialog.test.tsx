import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from '@/components/common/confirm-dialog'

/**
 * The confirmation composite (F019, G-2). It is controlled, so the harness
 * below owns `open` exactly like a feature screen would — including the async
 * case, where the caller keeps the dialog open until its work settles.
 */
function Harness({
  onConfirm = vi.fn(),
  onCancel,
  pending = false,
  destructive = false,
  closeOnConfirm = true,
}: {
  onConfirm?: () => void
  onCancel?: () => void
  pending?: boolean
  destructive?: boolean
  closeOnConfirm?: boolean
}) {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this user?"
        description="Their sessions are revoked and the account is deactivated."
        confirmLabel="Delete user"
        cancelLabel="Keep user"
        destructive={destructive}
        pending={pending}
        closeOnConfirm={closeOnConfirm}
        onConfirm={onConfirm}
        {...(onCancel ? { onCancel } : {})}
      />
    </>
  )
}

describe('confirm dialog', () => {
  it('announces what it is asking about', () => {
    render(<Harness />)

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete this user?')
    expect(screen.getByText(/sessions are revoked/)).toBeInTheDocument()
  })

  it('confirms once and closes itself', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete user' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('cancels without confirming — Escape included', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />)

    await userEvent.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('keeps itself open in the caller’s hands when closeOnConfirm is false', async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} closeOnConfirm={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete user' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cannot be dismissed while its action is pending', async () => {
    const onCancel = vi.fn()
    render(<Harness pending onCancel={onCancel} />)

    expect(screen.getByRole('button', { name: 'Delete user' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep user' })).toBeDisabled()

    await userEvent.keyboard('{Escape}')

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
