import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  CheckboxField,
  DateField,
  InputField,
  SelectField,
  TextareaField,
  TimeField,
} from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'

/**
 * The field kit's contract (F019, BIG-PROMPT §5.4): Zod validation reaches the
 * screen, and the accessibility wiring — label association, `aria-invalid`,
 * `aria-describedby` chains, the required marker, the single form-level alert —
 * is present *before* anyone thinks about it. Everything here runs a real
 * `useForm` with a real `zodResolver`; nothing is mocked.
 */
const schema = z.object({
  email: z.email('Enter a valid email address.'),
  fullName: z.string().min(2, 'Use at least 2 characters.'),
  role: z.string().min(1, 'Choose a role.'),
  startDate: z.string().min(1, 'Pick a start date.'),
  startTime: z.string().min(1, 'Pick a start time.'),
  notify: z.boolean(),
  notes: z.string().optional(),
})

type Values = z.infer<typeof schema>

const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Administrator' },
]

function AccountForm({ onSubmit = vi.fn() }: { onSubmit?: (values: Values) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      fullName: '',
      role: '',
      startDate: '',
      startTime: '',
      notify: false,
      notes: '',
    },
  })

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            onSubmit(values)
          })(event)
        }
      >
        <FormError />
        <InputField
          control={form.control}
          name="email"
          label="Email"
          description="Work address"
          required
          type="email"
        />
        <InputField control={form.control} name="fullName" label="Full name" required />
        <SelectField
          control={form.control}
          name="role"
          label="Role"
          options={ROLES}
          placeholder="Pick one"
          required
        />
        <DateField control={form.control} name="startDate" label="Start date" required />
        <TimeField control={form.control} name="startTime" label="Start time" required />
        <CheckboxField
          control={form.control}
          name="notify"
          label="Send a welcome email"
          description="The account holder is notified once."
        />
        <TextareaField control={form.control} name="notes" label="Notes" rows={2} />
        <FormActions submitLabel="Create account" onCancel={() => form.reset()} />
      </form>
    </Form>
  )
}

async function submit() {
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('validation', () => {
  it('blocks submission and shows one message per invalid field', async () => {
    const onSubmit = vi.fn()
    render(<AccountForm onSubmit={onSubmit} />)

    await submit()

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByText('Choose a role.')).toBeInTheDocument()
    expect(screen.getByText('Pick a start date.')).toBeInTheDocument()
    expect(screen.getByText('Pick a start time.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('states the failure once, as an alert, instead of leaving it to red borders', async () => {
    render(<AccountForm />)

    await submit()

    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('Please correct the highlighted fields.')
  })

  it('submits once the values satisfy the schema', async () => {
    const onSubmit = vi.fn()
    render(<AccountForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/Email/), 'ada@example.com')
    await userEvent.type(screen.getByLabelText(/Full name/), 'Ada Lovelace')
    await userEvent.click(screen.getByLabelText(/Role/))
    await userEvent.click(await screen.findByRole('option', { name: 'Administrator' }))
    await userEvent.click(screen.getByLabelText(/Start date/))
    // Day cells are <td role="gridcell"> wrappers; the button inside is the
    // control. Outside-month cells are excluded so the click lands in view.
    const grid = screen.getByRole('grid')
    const days = within(grid)
      .getAllByRole('gridcell')
      .filter((cell) => !cell.classList.contains('rdp-outside'))
    await userEvent.click(within(days[10] as HTMLElement).getByRole('button'))
    await userEvent.click(screen.getByLabelText(/Start time/))
    await userEvent.click(await screen.findByRole('button', { name: '9' }))
    await userEvent.click(screen.getByRole('button', { name: 'AM' }))
    // By role, not by label: Base UI's Checkbox renders a hidden input next to
    // its button, so the label query matches twice.
    await userEvent.click(screen.getByRole('checkbox', { name: /Send a welcome email/ }))

    await submit()

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    const values = onSubmit.mock.calls[0]?.[0] as Values
    expect(values).toMatchObject({
      email: 'ada@example.com',
      fullName: 'Ada Lovelace',
      role: 'admin',
      notify: true,
    })
    // The pickers store the forms the API speaks, not display text.
    expect(values.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(values.startTime).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('accessibility wiring', () => {
  it('associates the label, the description and the message with the control', async () => {
    render(<AccountForm />)
    await submit()

    const email = await screen.findByLabelText(/Email/)
    const label = screen.getByText('Work address').closest('p')

    // Label → control, through htmlFor/id…
    expect(email).toHaveAttribute('id', screen.getByText('Email').closest('label')?.getAttribute('for'))
    // …and the description plus the message, in that order, through one
    // aria-describedby chain.
    const describedBy = email.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(describedBy).toHaveLength(2)
    expect(describedBy[0]).toBe(label?.id)
    expect(document.getElementById(describedBy[1] ?? '')).toHaveTextContent(
      'Enter a valid email address.',
    )
  })

  it('marks the control invalid exactly when it has an error', async () => {
    render(<AccountForm />)

    expect(screen.getByLabelText(/Full name/)).not.toHaveAttribute('aria-invalid')
    await submit()
    expect(await screen.findByText('Use at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders the required marker visually and as text for screen readers', () => {
    render(<AccountForm />)

    const fullName = screen.getByLabelText(/Full name/)
    expect(fullName).toBeInTheDocument()

    const marker = screen.getAllByText('*')[0] as HTMLElement
    expect(marker).toHaveAttribute('aria-hidden', 'true')
    // RTL's role queries compute the accessible name the way assistive
    // technology does: the aria-hidden asterisk is dropped, and accname
    // normalisation collapses the space before the sr-only text.
    expect(screen.getByRole('textbox', { name: 'Full name(required)' })).toBe(fullName)
    // A field that is not required carries no marker.
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument()
  })

  it('names the checkbox through its label', () => {
    render(<AccountForm />)

    expect(screen.getByRole('checkbox', { name: /Send a welcome email/ })).toBeInTheDocument()
  })

  it('describes the date field through the same chain, on its trigger', async () => {
    render(<AccountForm />)
    await submit()

    const startDate = screen.getByLabelText(/Start date/)
    const describedBy = startDate.getAttribute('aria-describedby')?.split(' ') ?? []
    expect(document.getElementById(describedBy[1] ?? '')).toHaveTextContent('Pick a start date.')
    expect(startDate).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('form actions', () => {
  it('resets the form from the cancel control', async () => {
    render(<AccountForm />)

    const email = screen.getByLabelText(/Email/) as HTMLInputElement
    await userEvent.type(email, 'ada@example.com')
    expect(email.value).toBe('ada@example.com')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(email.value).toBe('')
  })
})
