import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { Link, createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { InputField } from '@/components/form/fields'
import { Form } from '@/components/form/form'
import { UnsavedChangesGuard } from '@/components/form/unsaved-changes-guard'

/**
 * The unsaved-changes prompt (§5.4) on a real data router: `useBlocker`
 * catches in-app navigation, the confirmation decides the outcome, and the
 * form's own dirty state is what arms it.
 */
function ProfileForm() {
  const form = useForm({ defaultValues: { fullName: '' } })

  return (
    <Form {...form}>
      <form>
        <InputField control={form.control} name="fullName" label="Full name" />
        <Link to="/other">Leave</Link>
        <UnsavedChangesGuard when={form.formState.isDirty} />
      </form>
    </Form>
  )
}

function OtherPage() {
  return <p>other page</p>
}

function renderApp() {
  const router = createMemoryRouter(
    [
      { path: '/profile', element: <ProfileForm /> },
      { path: '/other', element: <OtherPage /> },
    ],
    { initialEntries: ['/profile'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('unsaved changes guard', () => {
  it('does not intercept a navigation when nothing was edited', async () => {
    const router = renderApp()

    await userEvent.click(screen.getByRole('link', { name: 'Leave' }))

    expect(await screen.findByText('other page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/other')
  })

  it('asks before dropping edits, and stays on the page when told to', async () => {
    const router = renderApp()

    const input = screen.getByLabelText(/Full name/) as HTMLInputElement
    await userEvent.type(input, 'Ada Lovelace')
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Discard unsaved changes?')
    // The navigation is held, not performed: the URL has not moved.
    expect(router.state.location.pathname).toBe('/profile')

    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(router.state.location.pathname).toBe('/profile')
    // The edits are still there — that is the point of the prompt.
    expect(input.value).toBe('Ada Lovelace')
  })

  it('proceeds with the navigation once the changes are discarded', async () => {
    const router = renderApp()

    await userEvent.type(screen.getByLabelText(/Full name/), 'Ada Lovelace')
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByText('other page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/other')
  })
})
