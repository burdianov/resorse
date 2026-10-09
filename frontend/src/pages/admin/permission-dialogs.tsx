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
import type { PermissionItem } from '@/lib/generated/api'

/**
 * The permission dictionary's create/edit dialogs (F038, BP-7.4's "create/
 * edit/delete behind privileged permissions, clear validation").
 *
 * Validation strategy: the client checks the code's **shape** locally (the
 * documented `resource.action` pattern, lowercase) purely for speed, and the
 * server still owns the verdict — its 422 lands on the `code` field through
 * the standard mapping, and its 409 (duplicate, or "in use, therefore frozen"
 * on a rename) renders as the dialog's root alert. The F037 guardrails are
 * the interface: the page never guesses usage counts, it shows the server's
 * sentence.
 *
 * DELETE does not live here — it belongs to the page's row menu and runs
 * behind the shared confirmation, like every other destructive action.
 */

const CODE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

const permissionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a permission code.')
    .max(100, 'Use at most 100 characters.')
    .regex(CODE_PATTERN, 'Lowercase `resource.action`, e.g. `users.read`.'),
  description: z.string().max(255, 'Use at most 255 characters.'),
})

type PermissionValues = z.infer<typeof permissionSchema>

const EMPTY: PermissionValues = { code: '', description: '' }

export function CreatePermissionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<PermissionValues>({
    resolver: zodResolver(permissionSchema),
    defaultValues: EMPTY,
  })

  const mutation = useMutation({
    mutationFn: (values: PermissionValues) =>
      api.post<PermissionItem>('/api/v1/admin/permissions', {
        code: values.code,
        description: values.description.trim() === '' ? null : values.description,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Permission added')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.permissions })
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
          <DialogTitle>Add permission</DialogTitle>
          <DialogDescription>
            A code confers nothing until a role is granted it in the matrix.
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
            <InputField
              control={form.control}
              name="code"
              label="Code"
              autoComplete="off"
              placeholder="reports.export"
              required
            />
            <TextareaField control={form.control} name="description" label="Description" />
            <FormActions submitLabel="Add permission" className="mt-2" />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function EditPermissionDialog({
  permission,
  onOpenChange,
}: {
  permission: PermissionItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<PermissionValues>({
    resolver: zodResolver(permissionSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (permission) form.reset({ code: permission.code, description: permission.description ?? '' })
  }, [permission, form])

  const mutation = useMutation({
    mutationFn: (values: PermissionValues) =>
      api.patch<PermissionItem>(`/api/v1/admin/permissions/${permission?.id ?? ''}`, {
        code: values.code,
        description: values.description.trim() === '' ? null : values.description,
      }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success('Permission updated')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.permissions })
    },
  })

  return (
    <Dialog open={permission !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit permission</DialogTitle>
          <DialogDescription>
            The code may only be renamed while no role holds it; the description is free to change.
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
            <InputField control={form.control} name="code" label="Code" required />
            <TextareaField control={form.control} name="description" label="Description" />
            <FormActions submitLabel="Save changes" className="mt-2" />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
