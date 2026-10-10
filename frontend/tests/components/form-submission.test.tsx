import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AppProviders } from '@/app/providers'
import { InputField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { api } from '@/lib/api'
import { NETWORK_ERROR_DETAIL, SERVER_ERROR_DETAIL } from '@/lib/errors'
import { server } from '@/testing/msw-server'

/**
 * Server → form error mapping (§5.4) and submission hygiene, end to end:
 * MSW answers, the shared client normalises, `applyServerErrors` maps, the
 * form renders and says it once. The form below is the canonical wiring the
 * kit documents — a real `useForm`, a real `useMutation`, no mocks of our own
 * code.
 */

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  fullName: z.string().min(2, 'Use at least 2 characters.'),
})

type Values = z.infer<typeof schema>

function CreateAccountForm({
  suppressErrorToast = true,
  onSaved = vi.fn(),
}: {
  suppressErrorToast?: boolean
  onSaved?: () => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'ada@example.com', fullName: 'Ada Lovelace' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) => api.post<{ id: string }>('/api/v1/admin/users', values),
    // The form states the failure itself — see `mutationMeta` in query-provider.
    meta: { suppressErrorToast },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Account created')
      onSaved()
    },
  })

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit((values) =>
            // The mutation's own onError has already mapped the failure; the
            // rejection is swallowed here so it does not escape handleSubmit.
            mutation.mutateAsync(values).catch(() => undefined),
          )(event)
        }}
      >
        <FormError />
        <InputField control={form.control} name="email" label="Email" required />
        <InputField control={form.control} name="fullName" label="Full name" required />
        <FormActions submitLabel="Create account" />
      </form>
    </Form>
  )
}

function renderForm(props: Parameters<typeof CreateAccountForm>[0] = {}) {
  return render(
    <AppProviders>
      <CreateAccountForm {...props} />
    </AppProviders>,
  )
}

async function submit() {
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

afterEach(() => {
  toast.dismiss()
})

describe('server error mapping', () => {
  it('lands Pydantic field errors on their fields and states the failure once', async () => {
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          {
            detail: [
              { type: 'value_error', loc: ['body', 'email'], msg: 'Email already registered' },
              { type: 'value_error', loc: ['body'], msg: 'Request rejected' },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    renderForm()

    await submit()

    // The field carries the server's message, chained to it like any other error.
    const email = screen.getByLabelText(/Email/)
    const message = await screen.findByText('Email already registered')
    expect(email.getAttribute('aria-describedby')).toContain(message.id)
    expect(email).toHaveAttribute('aria-invalid', 'true')

    // The body-level entry lands on the form, not on a field…
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some of the submitted values need attention.',
    )
    // …and the whole thing is said once: the toast is suppressed.
    expect(screen.getAllByText('Some of the submitted values need attention.')).toHaveLength(1)
  })

  it('still toasts when the form does not suppress it', async () => {
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json({ detail: 'Not allowed' }, { status: 403 }),
      ),
    )
    renderForm({ suppressErrorToast: false })

    await submit()

    // Two surfaces: the form's alert and the query layer's toast.
    await waitFor(() => {
      expect(screen.getAllByText('Not allowed')).toHaveLength(2)
    })
  })

  it('puts a network failure on the form, in the same words as everywhere else', async () => {
    server.use(http.post('/api/v1/admin/users', () => HttpResponse.error()))
    renderForm()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_DETAIL)
  })

  it("does not leave the previous attempt's errors behind", async () => {
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'email'], msg: 'Email already registered' }] },
          { status: 422 },
        ),
      ),
    )
    renderForm()

    await submit()
    expect(await screen.findByText('Email already registered')).toBeInTheDocument()

    // Next attempt meets a different failure: the field error from the first
    // attempt must not survive it.
    server.use(
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json({ detail: 'down' }, { status: 500 }),
      ),
    )
    await submit()

    await waitFor(() => {
      expect(screen.queryByText('Email already registered')).toBeNull()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_ERROR_DETAIL)
  })
})

describe('submission hygiene', () => {
  it('holds one request in flight and disables the control while it runs', async () => {
    let requests = 0
    server.use(
      http.post('/api/v1/admin/users', async () => {
        requests += 1
        await delay(40)
        return HttpResponse.json({ id: '1f0d…' }, { status: 201 })
      }),
    )
    const onSaved = vi.fn()
    renderForm({ onSaved })

    const button = screen.getByRole('button', { name: 'Create account' })
    await userEvent.click(button)

    // Duplicate-submit prevention is the disabled control (§5.4): a browser
    // cannot activate it, so the second click cannot exist. It is asserted as
    // state rather than by clicking again, because jsdom *does* dispatch a
    // click on a disabled button — a fidelity gap, not a defect here.
    await waitFor(() => {
      expect(button).toBeDisabled()
    })
    expect(button).toHaveAttribute('aria-busy', 'true')

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1)
    })
    expect(requests).toBe(1)
    // Pending ends with the request, so the form is usable again.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create account' })).not.toBeDisabled()
    })
  })

  it('reports success through the shared toast', async () => {
    server.use(
      http.post('/api/v1/admin/users', () => HttpResponse.json({ id: '1f0d…' }, { status: 201 })),
    )
    renderForm()

    await submit()

    expect(await screen.findByText('Account created')).toBeInTheDocument()
  })
})
