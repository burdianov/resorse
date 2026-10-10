import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { UseQueryResult } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputField } from '@/components/form/fields'
import {
  Form,
  FormError,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toApiError } from '@/lib/errors'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { queryKeys } from '@/lib/query-keys'
import type {
  AdminUserItem,
  CreateUserApiV1AdminUsersPostResponse,
  ResetPasswordEndpointApiV1AdminUsersUserIdResetPasswordPostResponse,
  RoleListResponse,
  UpdateUserApiV1AdminUsersUserIdPatchResponse,
} from '@/lib/generated/api'

/**
 * The user directory's three dialogs (F034, BIG-PROMPT §7.3) — create, edit,
 * and the password reset, each with the server-authoritative error handling of
 * §5.4: 422s land on the fields that produced them, and everything else (the
 * 409 email conflict, a rule 403, the reset's own refusals) surfaces as the
 * server's sentence in the dialog, never as a generic "something failed".
 *
 * Two rules from F033/C22 are mirrored here so the UI does not invite refusals
 * it knows are coming: editing yourself disables the roles and active controls
 * (the API refuses those fields for self, C22), and **no dialog ever creates a
 * superuser** — the bootstrap owns the first one and F033's rule owns the rest;
 * the API supports it, the UI deliberately offers no switch.
 *
 * The one-time password notice is shared by create and reset because the
 * contract is identical (F033/C22): the value is shown **once**, never again,
 * and the account must change it at first sign-in.
 */

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard === undefined) {
    toast.error('Copying is not available in this browser.')
    return
  }
  await navigator.clipboard.writeText(value)
  toast.success('Password copied')
}

function TemporaryPasswordNotice({ password, email }: { password: string; email: string }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">This password is shown once.</p>
        <p className="mt-1 text-muted-foreground">
          Record it now and hand it to {email} securely — it will not be shown again, and the
          account must change it at first sign-in.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm break-all">
            {password}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void copyToClipboard(password)
            }}
          >
            Copy
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The role picker: a checkbox group over the real catalogue (F034's read
 * slice of F035's surface). Loading, failure and emptiness are all shown as
 * themselves — an empty list is never rendered when the truth is "the
 * catalogue could not be loaded". */
function RolePicker<TValues extends FieldValues>({
  control,
  name,
  rolesQuery,
  disabled = false,
  description,
}: {
  control: Control<TValues>
  name: FieldPath<TValues>
  rolesQuery: UseQueryResult<RoleListResponse>
  disabled?: boolean
  description?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected: string[] = Array.isArray(field.value) ? (field.value as string[]) : []
        return (
          <FormItem>
            <FormLabel>Roles</FormLabel>
            {rolesQuery.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : rolesQuery.isError ? (
              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                <p>The role catalogue could not be loaded. {toApiError(rolesQuery.error).detail}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    void rolesQuery.refetch()
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : rolesQuery.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles exist yet.</p>
            ) : (
              <div className={disabled ? 'grid gap-2 opacity-60' : 'grid gap-2'}>
                {rolesQuery.data.items.map((role) => {
                  const checkboxId = `${String(field.name)}-${role.id}`
                  const checked = selected.includes(role.id)
                  return (
                    <div key={role.id} className="flex items-start gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        disabled={disabled}
                        className="mt-0.5"
                        onCheckedChange={(next) => {
                          field.onChange(
                            next === true
                              ? [...selected, role.id]
                              : selected.filter((id) => id !== role.id),
                          )
                        }}
                      />
                      <div className="grid gap-0.5">
                        <Label htmlFor={checkboxId} className="font-normal">
                          {role.name}
                        </Label>
                        {role.description ? (
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

// --- create -------------------------------------------------------------------

const createSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email address.'),
  full_name: z.string().trim().min(1, 'Enter the full name.'),
  phone: z.string(),
  password: z.string(),
  role_ids: z.array(z.string()),
})

type CreateValues = z.infer<typeof createSchema>

export function CreateUserDialog({
  open,
  onOpenChange,
  rolesQuery,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rolesQuery: UseQueryResult<RoleListResponse>
}) {
  const queryClient = useQueryClient()
  const [issued, setIssued] = useState<{ password: string | null; email: string } | null>(null)
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', full_name: '', phone: '', password: '', role_ids: [] },
  })

  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      api.post<CreateUserApiV1AdminUsersPostResponse>('/api/v1/admin/users', {
        email: values.email,
        full_name: values.full_name,
        phone: values.phone.trim() === '' ? null : values.phone.trim(),
        // Empty means "generate one and show it once" — F033/C22's contract.
        password: values.password === '' ? null : values.password,
        role_ids: values.role_ids,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: (data) => {
      setIssued({ password: data.temporary_password, email: data.user.email })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot })
    },
  })

  const close = (next: boolean) => {
    if (!next) {
      form.reset()
      setIssued(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            The account starts with a temporary password and must change it at first sign-in.
          </DialogDescription>
        </DialogHeader>

        {issued !== null ? (
          <div className="grid gap-4">
            {issued.password !== null ? (
              <TemporaryPasswordNotice password={issued.password} email={issued.email} />
            ) : (
              <p className="text-sm">
                The account for {issued.email} was created with the initial password you entered. It
                must be changed at first sign-in.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  close(false)
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
                name="email"
                label="Email"
                type="email"
                autoComplete="off"
                required
              />
              <InputField
                control={form.control}
                name="full_name"
                label="Full name"
                autoComplete="off"
                required
              />
              <InputField control={form.control} name="phone" label="Phone" autoComplete="off" />
              <InputField
                control={form.control}
                name="password"
                label="Initial password"
                type="password"
                autoComplete="new-password"
                description="Leave empty to generate a secure one — it is shown once after creation."
              />
              <RolePicker control={form.control} name="role_ids" rolesQuery={rolesQuery} />
              <FormActions submitLabel="Create user" className="mt-2" />
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- edit ---------------------------------------------------------------------

const editSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email address.'),
  full_name: z.string().trim().min(1, 'Enter the full name.'),
  phone: z.string(),
  is_active: z.boolean(),
  role_ids: z.array(z.string()),
})

type EditValues = z.infer<typeof editSchema>

function editValuesFrom(user: AdminUserItem): EditValues {
  return {
    email: user.email,
    full_name: user.full_name,
    phone: user.phone ?? '',
    is_active: user.is_active,
    role_ids: user.roles.map((role) => role.id),
  }
}

export function EditUserDialog({
  user,
  onOpenChange,
  rolesQuery,
}: {
  user: AdminUserItem | null
  onOpenChange: (open: boolean) => void
  rolesQuery: UseQueryResult<RoleListResponse>
}) {
  const queryClient = useQueryClient()
  const auth = useAuth()
  const isSelf = user !== null && auth.user?.id === user.id
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { email: '', full_name: '', phone: '', is_active: true, role_ids: [] },
  })

  // Re-seed the form every time the dialog opens for a (possibly different) row.
  useEffect(() => {
    if (user) form.reset(editValuesFrom(user))
  }, [user, form])

  const mutation = useMutation({
    mutationFn: (values: EditValues) =>
      api.patch<UpdateUserApiV1AdminUsersUserIdPatchResponse>(
        `/api/v1/admin/users/${user?.id ?? ''}`,
        {
          email: values.email,
          full_name: values.full_name,
          phone: values.phone.trim() === '' ? null : values.phone.trim(),
          is_active: values.is_active,
          // The complete set — F033/C22: role_ids replaces, never merges.
          role_ids: values.role_ids,
        },
      ),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('User updated')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot })
    },
  })

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {isSelf
              ? 'You cannot change your own roles or account status.'
              : 'Changes apply immediately; deactivating ends the account’s sessions.'}
          </DialogDescription>
        </DialogHeader>
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
            <InputField control={form.control} name="full_name" label="Full name" required />
            <InputField control={form.control} name="email" label="Email" type="email" required />
            <InputField control={form.control} name="phone" label="Phone" />
            <RolePicker
              control={form.control}
              name="role_ids"
              rolesQuery={rolesQuery}
              disabled={isSelf}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-user-active"
                      checked={field.value}
                      disabled={isSelf}
                      onCheckedChange={(next) => {
                        field.onChange(next === true)
                      }}
                    />
                    <Label htmlFor="edit-user-active" className="font-normal">
                      Account is active
                    </Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormActions submitLabel="Save changes" className="mt-2" />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// --- reset --------------------------------------------------------------------

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [temporary, setTemporary] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () =>
      api.post<ResetPasswordEndpointApiV1AdminUsersUserIdResetPasswordPostResponse>(
        `/api/v1/admin/users/${user?.id ?? ''}/reset-password`,
      ),
    meta: { suppressErrorToast: true },
    onSuccess: (data) => {
      setTemporary(data.temporary_password)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot })
    },
  })

  const close = (next: boolean) => {
    if (!next) {
      setTemporary(null)
      mutation.reset()
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={user !== null} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {temporary === null
              ? 'A new temporary password is generated and shown once. Every session of this account ends immediately.'
              : null}
          </DialogDescription>
        </DialogHeader>

        {temporary !== null && user !== null ? (
          <div className="grid gap-4">
            <TemporaryPasswordNotice password={temporary} email={user.email} />
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  close(false)
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="flex items-start gap-2 text-sm">
              <KeyRoundIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                Reset the password for <span className="font-medium">{user?.full_name}</span>? They
                will be signed out everywhere and must set a new password at next sign-in.
              </span>
            </p>
            {mutation.isError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive-text"
              >
                {toApiError(mutation.error).detail}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close(false)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={mutation.isPending}
                onClick={() => {
                  mutation.mutate()
                }}
              >
                Reset password
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
