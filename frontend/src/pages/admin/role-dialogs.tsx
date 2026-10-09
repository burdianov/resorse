import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputField, TextareaField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { RoleItem } from '@/lib/generated/api'

/**
 * The role page's create/rename dialogs (F036, BP-7.4's "create/edit role
 * interface, clear validation").
 *
 * Grants are deliberately **not** in these forms: a role's permission set is
 * the matrix's business (one atomic save, F035/C24), and a name form that
 * also carried checkboxes would be a second, sequential path to the same
 * write — exactly the partial-success shape BP-7.4 names as the reference's
 * bug. Create a role here, tick its column in the matrix, save once.
 *
 * The `name` field error from the server's 409/422 lands on the input through
 * the standard `applyServerErrors` mapping because the API's field name is
 * the form's field name, as everywhere since F030.
 */

const roleSchema = z.object({
  name: z.string().trim().min(1, 'Enter a role name.').max(64, 'Use at most 64 characters.'),
  description: z.string().max(255, 'Use at most 255 characters.'),
})

type RoleValues = z.infer<typeof roleSchema>

const EMPTY: RoleValues = { name: '', description: '' }

export function CreateRoleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: EMPTY })

  const mutation = useMutation({
    mutationFn: (values: RoleValues) =>
      api.post<RoleItem>('/api/v1/admin/roles', {
        name: values.name,
        description: values.description.trim() === '' ? null : values.description,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Role created')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles })
    },
  })

  const close = (next: boolean) => {
    if (!next) form.reset(EMPTY)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add role</DialogTitle>
          <DialogDescription>
            Create the role, then grant its permissions in the matrix and save once.
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
            <InputField control={form.control} name="name" label="Name" autoComplete="off" required />
            <TextareaField control={form.control} name="description" label="Description" />
            <FormActions submitLabel="Create role" className="mt-2" />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function RenameRoleDialog({
  role,
  onOpenChange,
}: {
  role: RoleItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: EMPTY })

  useEffect(() => {
    if (role) form.reset({ name: role.name, description: role.description ?? '' })
  }, [role, form])

  const mutation = useMutation({
    mutationFn: (values: RoleValues) =>
      api.patch<RoleItem>(`/api/v1/admin/roles/${role?.id ?? ''}`, {
        name: values.name,
        description: values.description.trim() === '' ? null : values.description,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Role updated')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles })
    },
  })

  return (
    <Dialog open={role !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>Rename or re-describe the role.</DialogDescription>
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
            <InputField control={form.control} name="name" label="Name" required />
            <TextareaField control={form.control} name="description" label="Description" />
            <FormActions submitLabel="Save changes" className="mt-2" />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
