import { useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format-date'
import { useAuth } from '@/lib/auth'
import type { MeResponse } from '@/lib/generated/api'

/**
 * `/profile` — the signed-in user's own card (F042, BP-7.6).
 *
 * Three cards, each answering one question:
 *
 * - **Profile** — editable full name/phone (the fields F041's `PATCH /auth/me`
 *   owns; email renders read-only because it *is* admin-managed, §7.3 — a
 *   disabled input would suggest "temporarily", prose says why), plus the
 *   account facts: member since, and roles.
 * - **Security** — the CTA into `/profile/security`; the password form lives
 *   there, not here, so the page stays scannable.
 * - **Effective permissions** — the union exactly as the server served it on
 *   this request (roles + permissions are gated per request, F029), grouped
 *   by namespace the way the matrix groups them. View-only by nature: a
 *   permission you could toggle here would be a role edit wearing a costume.
 *
 * The "Active" badge is truthful-by-construction rather than a served field:
 * a session belonging to a disabled account never resolves (F029), so this
 * page can only render for an active account — which is why `MeResponse`
 * carries no `is_active` (the decoration F031 refused to serve). §7.6 asks
 * the card to show the status; showing it as an invariant of the page is the
 * honest way to satisfy that.
 *
 * The save goes through `auth.refresh()` rather than a local copy: the header
 * menu, this card, and anything else reading `useAuth` must show the same
 * name the server now holds.
 */

const schema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Enter your full name.')
    .max(200, 'Use at most 200 characters.'),
  phone: z.string().max(32, 'Use at most 32 characters.'),
})

type Values = z.infer<typeof schema>

function groupPermissions(permissions: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const code of [...permissions].sort()) {
    const namespace = code.split('.')[0] ?? code
    const group = groups.get(namespace) ?? []
    group.push(code)
    groups.set(namespace, group)
  }
  return groups
}

export function ProfilePage() {
  const auth = useAuth()
  const user = auth.user

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: user?.full_name ?? '', phone: user?.phone ?? '' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api.patch<MeResponse>('/api/v1/auth/me', {
        full_name: values.full_name,
        phone: values.phone.trim() === '' ? null : values.phone,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: async () => {
      toast.success('Profile updated')
      await auth.refresh()
    },
  })

  const groups = useMemo(
    () => groupPermissions(user?.permissions ?? []),
    [user?.permissions],
  )

  if (user === null) {
    // The shell only renders for an authenticated session; this is defence
    // against a provider-less mount, not a real state.
    return null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Profile"
        description="Your account details and access."
        breadcrumbs={<AppBreadcrumbs />}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Details</h2>
          </CardTitle>
          <CardDescription>Name and contact details you can keep current.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
                name="full_name"
                label="Full name"
                autoComplete="name"
                required
              />
              <InputField
                control={form.control}
                name="phone"
                label="Phone"
                autoComplete="tel"
                description="Leave empty to remove it."
              />
              <FormActions submitLabel="Save profile" className="mt-2" />
            </form>
          </Form>
          <div className="grid gap-2 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Email addresses are managed by an administrator.
            </p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Member since</span>
              <span>{formatDate(user.created_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status="active" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Roles</span>
              <span className="flex flex-wrap justify-end gap-1">
                {user.roles.length === 0 ? (
                  <Badge variant="outline">No roles</Badge>
                ) : (
                  user.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Security</h2>
          </CardTitle>
          <CardDescription>
            Change your password. The new one must be at least 12 characters and not a common
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" render={<Link to="/profile/security" />}>
            Change password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Effective permissions</h2>
          </CardTitle>
          <CardDescription>
            The union across your roles, as the server resolved it for this request.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {groups.size === 0 ? (
            <p className="text-sm text-muted-foreground">This account holds no permissions.</p>
          ) : (
            [...groups.entries()].map(([namespace, codes]) => (
              <div key={namespace} className="grid gap-1.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {namespace}
                </p>
                <ul className="grid gap-1">
                  {codes.map((code) => (
                    <li key={code} className="font-mono text-sm">
                      {code}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
