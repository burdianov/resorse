import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { BrandMark } from '@/components/common/brand-mark'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { useAuth } from '@/lib/auth'

/**
 * Changing a password (F032, BIG-PROMPT §7.1) — the forced first-login/reset
 * change and the voluntary one, served as **one form in two homes**:
 *
 * - `ChangePasswordPage` — the standalone, shell-less screen the forced flow
 *   lands on (the user has no usable navigation until the change completes,
 *   F031, so rendering a sidebar of links that would all 403 would be a lie).
 * - `ChangePasswordForm` — the same form inside Profile > Security (F042),
 *   where the user *does* have a shell around them.
 *
 * The split was made in F042 by extracting the form; the behaviour stayed
 * identical on purpose, including the details each side keeps:
 *
 * - **Policy lives on the server and is shown from there** (F030's
 *   field-addressable 422s on `new_password`); the guidance text is static
 *   prose that restates the documented policy, never pretends to enforce it.
 * - **`current_password`/`new_password` are the API's own field names**, so
 *   the `loc` paths map onto the inputs with no translation table.
 * - **Success is handed to the caller** (`onSuccess`): the forced screen
 *   navigates to the dashboard (the change cleared the flag), while the
 *   in-profile form stays put with a toast — the user is already where they
 *   wanted to be.
 * - **The forced flow's way out** ("Sign out instead") exists only where it
 *   is needed: the standalone screen. A signed-in shell user already has the
 *   account menu.
 */

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: z.string().min(1, 'Choose a new password.'),
    confirm_password: z.string(),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ['confirm_password'],
    message: 'The confirmation does not match the new password.',
  })

type Values = z.infer<typeof schema>

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      auth.changePassword(values.current_password, values.new_password),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Password changed')
      form.reset()
      onSuccess?.()
    },
  })

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined))(
            event,
          )
        }}
        className="grid gap-4"
      >
        <FormError />
        <InputField
          control={form.control}
          name="current_password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
        />
        <InputField
          control={form.control}
          name="new_password"
          label="New password"
          type="password"
          autoComplete="new-password"
          description="At least 12 characters. Not a common password, and not your email address."
          required
        />
        <InputField
          control={form.control}
          name="confirm_password"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FormActions submitLabel="Change password" className="mt-2" />
      </form>
    </Form>
  )
}

export function ChangePasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const forced = auth.user?.must_change_password === true

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <BrandMark />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{forced ? 'Choose a new password' : 'Change password'}</h1>
            </CardTitle>
            <CardDescription>
              {forced
                ? 'This account must set its own password before continuing.'
                : 'Enter your current password, then choose a new one.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm
              onSuccess={() => {
                // The change rotated this session and cleared the flag in one
                // server commit (F030); the dashboard is the honest
                // destination for both flows here.
                void navigate('/dashboard', { replace: true })
              }}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void auth.logout()
                }}
              >
                Sign out instead
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
