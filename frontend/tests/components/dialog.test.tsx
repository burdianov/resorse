import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

function Harness() {
  return (
    <Dialog>
      <DialogTrigger render={<Button>Open</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Choose a new name.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Name" />
        <DialogFooter>
          <Button>Save</Button>
          <Button variant="outline">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('is closed until the trigger is activated', () => {
    render(<Harness />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on trigger click and exposes an accessible name and description', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Rename project')
    expect(dialog).toHaveAccessibleDescription('Choose a new name.')
  })

  it('moves focus into the dialog when it opens', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    // Focus arrives asynchronously once the popup has mounted.
    await waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('returns focus to the trigger after closing', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    // Focus must not be dropped on <body>, or keyboard users lose their place.
    expect(trigger).toHaveFocus()
  })

  it('does not let Tab reach the page behind the dialog', async () => {
    // The meaningful property is that background content is unreachable — not
    // that focus is always a DOM descendant of the popup. Base UI's focus trap
    // parks focus on a sentinel span outside the dialog for one keystroke before
    // wrapping back in; asserting on containment would flag that as a failure.
    render(
      <>
        <button type="button">Background action</button>
        <Harness />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    // `hidden: true` because Base UI removes background content from the
    // accessibility tree while the modal is open — which is itself the first
    // half of the guarantee, asserted below.
    const background = screen.getByRole('button', { name: 'Background action', hidden: true })
    // Base UI hides the background at a container level, not on the control
    // itself, so the guarantee is that an ancestor is hidden or inert.
    expect(background.closest('[aria-hidden="true"], [inert]')).not.toBeNull()

    for (let step = 0; step < 8; step += 1) {
      await userEvent.tab()
      expect(background).not.toHaveFocus()
    }
  })
})
