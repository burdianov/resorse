import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheckIcon, CircleSlashIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PermissionGate } from '@/components/common/permission-gate'
import { StatusBadge } from '@/components/common/status-badge'
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  DataTableViewOptions,
} from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { InputField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { useAccess } from '@/components/providers/access-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { meetsAccess } from '@/config/access'
import { useTablePreferences } from '@/hooks/use-table-preferences'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'

import { codeField, nameField } from './rules'
import type { DisciplineItem, DisciplineListResponse } from '@/lib/generated/api'

/**
 * `/masters/disciplines` — the first reference table's screen (D006).
 *
 * **Client mode, like the permission dictionary** (C25/C26): the list endpoint
 * is deliberately unpaginated, the vocabulary is bounded, and sorting and
 * searching a few dozen rows in the browser is honest. The DataTable's own
 * toolbar, headers and view options do that work; nothing here re-implements
 * it.
 *
 * **Three writes, and the server owns all three verdicts.** Create posts
 * `{code, name}`; edit patches `{name}` alone, because a code is the row's
 * identity and the server's update schema refuses the field outright
 * (`extra="forbid"`, so a submitted code is a 422 — the dialog shows it
 * disabled rather than pretending to send it); deactivate is an ordinary
 * patch of `is_active`. A duplicate code's 409 and a blank-name 422 land on
 * the fields through `applyServerErrors`.
 *
 * **Delete is offered and expected to be refused.** A discipline a designation
 * still references cannot be deleted — the foreign key is `ON DELETE
 * RESTRICT`, and the server answers 409 with "Deactivate it instead." The row
 * menu therefore carries a one-click deactivate beside the delete, and the
 * confirmation does not predict the outcome: the server's sentence is shown by
 * the query layer's mutation toast when the refusal happens.
 */
export function DisciplinesPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['disciplines.manage'] }, access)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DisciplineItem | null>(null)
  const [deleting, setDeleting] = useState<DisciplineItem | null>(null)

  const disciplinesQuery = useQuery({
    queryKey: queryKeys.masters.disciplines,
    queryFn: () => api.get<DisciplineListResponse>('/api/v1/masters/disciplines'),
    staleTime: 5 * 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (discipline: DisciplineItem) =>
      api.delete<void>(`/api/v1/masters/disciplines/${discipline.id}`),
    onSuccess: () => {
      toast.success('Discipline deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.disciplines })
    },
  })

  // Activate and deactivate are the same write: the flag is the state, and the
  // row already knows which way it is going.
  const toggleMutation = useMutation({
    mutationFn: (discipline: DisciplineItem) =>
      api.patch<DisciplineItem>(`/api/v1/masters/disciplines/${discipline.id}`, {
        is_active: !discipline.is_active,
      }),
    onSuccess: (_updated, discipline) => {
      toast.success(discipline.is_active ? 'Discipline deactivated' : 'Discipline activated')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.disciplines })
    },
  })

  const columns: DataTableColumn<DisciplineItem>[] = [
    {
      id: 'code',
      accessorKey: 'code',
      meta: { label: 'Code' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      id: 'name',
      accessorKey: 'name',
      meta: { label: 'Name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    },
    {
      // The accessor is the word, not the boolean, so the search box and the
      // sort both read what the badge says rather than "true"/"false".
      id: 'status',
      accessorFn: (discipline) => (discipline.is_active ? 'active' : 'inactive'),
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'inactive'} />,
    },
    {
      id: 'actions',
      enableSorting: false,
      meta: { label: 'Actions' },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        canManage ? (
          <div className="flex justify-end">
            <DataTableRowActions label={row.original.code}>
              <DropdownMenuItem
                onClick={() => {
                  setEditing(row.original)
                }}
              >
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  toggleMutation.mutate(row.original)
                }}
              >
                {row.original.is_active ? <CircleSlashIcon /> : <CircleCheckIcon />}
                {row.original.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setDeleting(row.original)
                }}
              >
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DataTableRowActions>
          </div>
        ) : null,
    },
  ]

  const preferences = useTablePreferences('masters-disciplines')

  const header = (
    <PageHeader
      title="Disciplines"
      description="The engineering disciplines a designation belongs to."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <PermissionGate permissions={['disciplines.manage']}>
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            Add discipline
          </Button>
        </PermissionGate>
      }
    />
  )

  if (disciplinesQuery.isError && disciplinesQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(disciplinesQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void disciplinesQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Disciplines"
        columns={columns}
        data={disciplinesQuery.data?.items ?? []}
        search={{ placeholder: 'Search codes or names…', debounceMs: 300 }}
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={disciplinesQuery.isPending}
        emptyState={
          <EmptyState
            title="No disciplines"
            description="Nothing matches the current search — or the table is empty, in which case the seed has not been run."
          />
        }
        getRowId={(discipline) => discipline.id}
        {...preferences}
      />

      <DisciplineFormDialog
        open={creating || editing !== null}
        target={editing}
        onOpenChange={(open) => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this discipline?"
        description={
          deleting === null
            ? undefined
            : `${deleting.name} is removed permanently. A discipline that a designation still uses cannot be deleted — the server will refuse it, and the row can be deactivated instead.`
        }
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting !== null) deleteMutation.mutate(deleting)
        }}
      />
    </div>
  )
}

const disciplineSchema = z.object({
  code: codeField,
  name: nameField,
})

type DisciplineValues = z.infer<typeof disciplineSchema>

const EMPTY: DisciplineValues = { code: '', name: '' }

/**
 * One dialog for both modes. The fields are the same and the only difference is
 * the code's editability — which is exactly the server's own distinction, so
 * the form states it once (`disabled={isEdit}`) instead of two components
 * carrying a copy of the same schema.
 */
function DisciplineFormDialog({
  open,
  target,
  onOpenChange,
}: {
  open: boolean
  target: DisciplineItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = target !== null
  const form = useForm<DisciplineValues>({
    resolver: zodResolver(disciplineSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (target) form.reset({ code: target.code, name: target.name })
  }, [target, form])

  const mutation = useMutation({
    mutationFn: (values: DisciplineValues) =>
      target === null
        ? api.post<DisciplineItem>('/api/v1/masters/disciplines', values)
        : // `name` alone: the code is not editable, and the server forbids the
          // field rather than ignoring it.
          api.patch<DisciplineItem>(`/api/v1/masters/disciplines/${target.id}`, {
            name: values.name,
          }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Discipline updated' : 'Discipline added')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.disciplines })
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
          <DialogTitle>{isEdit ? 'Edit discipline' : 'Add discipline'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'The name is free to change; the code identifies the row and cannot.'
              : 'The code is the identifier designations and future records will reference.'}
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
              placeholder="civil"
              description={isEdit ? 'The code cannot be changed.' : undefined}
              disabled={isEdit}
              required={!isEdit}
            />
            <InputField
              control={form.control}
              name="name"
              label="Name"
              autoComplete="off"
              placeholder="Civil"
              required
            />
            <FormActions
              submitLabel={isEdit ? 'Save changes' : 'Add discipline'}
              className="mt-2"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
