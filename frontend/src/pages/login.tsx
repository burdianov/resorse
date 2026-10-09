import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router'
import { z } from 'zod'

import { BrandMark } from '@/components/common/brand-mark'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { InputField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth, readIntendedPath } from '@/lib/auth'

/**
 * The sign-in screen (F032, BIG-PROMPT §7.1) — a centered themed card,
 * deliberately *outside* the application shell: an anonymous visitor has no
 * navigation to see.
 *
 * What the form does and, just as deliberately, does not:
 *
 * - **Client validation is shape only** ("enter your email"), mirroring the
 *   backend's login contract (F028): the server answers every credential
 *   problem with one uniform 401, and the form shows that sentence at the
 *   form level. There is no "no such account" branch anywhere — there is no
 *   such answer.
 * - **429 is rendered, not hidden.** The server's "Too many login attempts"
 *   detail lands in `FormError` like any other failure; the submit button
 *   stays available, because the server is the one that decides.
 * - **An already-authenticated visitor is routed through** (deep links to
 *   `/login` happen): to `/change-password` while the forced-change flag is
 *   set, otherwise to the page they originally wanted. `readIntendedPath`
 *   accepts only in-app paths — the `from` state can never become an open
 *   redirect.
 * - **Autocomplete attributes are real** (`email`, `current-password`): the
 *   requirement is that a password manager can do its job, and that only works
 *   when the form is honest about what it is.
 */

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Values = z.infer<typeof schema>

export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const intended = readIntendedPath(location.state)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) => auth.login(values.email, values.password),
    // The form states the failure itself (see `mutationMeta` in query-provider).
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
  })

  if (auth.status === 'authenticated') {
    // §6.2e's ordering: the session is *resolved*, then the routing follows —
    // never a redirect into login for someone who is signed in.
    return <Navigate to={auth.user?.must_change_password ? '/change-password' : intended} replace />
  }

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
            {/* A real heading: the card is the whole page, and assistive tech
                (and the tests) should find its title as one. Tailwind's
                preflight keeps it visually identical to CardTitle's div. */}
            <CardTitle>
              <h1>Sign in</h1>
            </CardTitle>
            <CardDescription>Use the account your administrator created for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                noValidate
                onSubmit={(event) => {
                  void form.handleSubmit((values) =>
                    // The mutation's onError maps the failure; swallowing the
                    // rejection here keeps it from escaping handleSubmit.
                    mutation.mutateAsync(values).catch(() => undefined),
                  )(event)
                }}
                className="grid gap-4"
              >
                <FormError />
                <InputField
                  control={form.control}
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                />
                <InputField
                  control={form.control}
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                <FormActions submitLabel="Sign in" className="mt-2" />
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
