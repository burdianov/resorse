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
 * The password-change step (F032, BIG-PROMPT §7.1) — one screen for the
 * forced first-login/reset change and for a voluntary change; F042's
 * Profile > Security links here.
 *
 * Like `/login` it lives outside the shell, because the forced-flow user has
 * no usable navigation yet — the server gates every regular endpoint until
 * the change completes (F031), and rendering a sidebar full of links that
 * would 403 would be a lie of exactly the sort this project forbids.
 *
 * Three behaviours worth naming:
 *
 * - **Policy lives on the server and is shown from there.** The client
 *   validates shape and the confirmation match; the *rules* (length,
 *   denylist, not-your-email) arrive as F030's field-addressable 422s and
 *   land on `new_password` through `applyServerErrors`. The guidance text is
 *   static prose — it restates the documented policy (ARCHITECTURE §3) but
 *   never pretends to be the enforcement.
 * - **`current_password`/`new_password` are the API's own field names**, so
 *   the 422 `loc` paths map onto the inputs without a translation table.
 * - **There is always a way out.** The forced flow adds a "Sign out instead"
 *   action: a temporary credential the user cannot use must end at a choice,
 *   not at a dead end (§6.1's recovery-UX rule).
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

export function ChangePasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const forced = auth.user?.must_change_password === true

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) => auth.changePassword(values.current_password, values.new_password),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Password changed')
      // The change rotated this session and cleared the flag in one server
      // commit (F030); the dashboard is the honest destination for both flows.
      void navigate('/dashboard', { replace: true })
    },
  })

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
            <Form {...form}>
              <form
                noValidate
                onSubmit={(event) => {
                  void form.handleSubmit((values) =>
                    mutation.mutateAsync(values).catch(() => undefined),
                  )(event)
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
                  autoFocus
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
                <FormActions submitLabel="Change password" className="mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      void auth.logout()
                    }}
                  >
                    Sign out instead
                  </Button>
                </FormActions>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
