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
import { InputField, SelectField } from '@/components/form/fields'
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

import { CLASSIFICATION_LABELS, DEPARTMENT_CLASSIFICATIONS, codeField, nameField } from './rules'
import type { DepartmentItem, DepartmentListResponse } from '@/lib/generated/api'

/**
 * `/masters/departments` — the second reference table (D006).
 *
 * The same screen as its two siblings, plus one field: a department carries a
 * **classification**, and the closed vocabulary lives in the generated client
 * as a union because the server declared it as a literal
 * (`DepartmentClassification`). The select is therefore built from the same
 * two tokens the server validates against, with the friendly labels kept
 * beside them in `./rules` — a third classification is a server-side decision
 * that shows up here as a type error rather than as a silent gap.
 *
 * The classification is editable, unlike the code: it is an attribute of the
 * row, and a head office reclassified as a site is a correction, not a new
 * identity. That is the schema's judgement, mirrored rather than re-made.
 */

const CLASSIFICATION_OPTIONS = DEPARTMENT_CLASSIFICATIONS.map((token) => ({
  value: token,
  label: CLASSIFICATION_LABELS[token],
}))

export function DepartmentsPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['departments.manage'] }, access)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DepartmentItem | null>(null)
  const [deleting, setDeleting] = useState<DepartmentItem | null>(null)

  const departmentsQuery = useQuery({
    queryKey: queryKeys.masters.departments,
    queryFn: () => api.get<DepartmentListResponse>('/api/v1/masters/departments'),
    staleTime: 5 * 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (department: DepartmentItem) =>
      api.delete<void>(`/api/v1/masters/departments/${department.id}`),
    onSuccess: () => {
      toast.success('Department deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.departments })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (department: DepartmentItem) =>
      api.patch<DepartmentItem>(`/api/v1/masters/departments/${department.id}`, {
        is_active: !department.is_active,
      }),
    onSuccess: (_updated, department) => {
      toast.success(department.is_active ? 'Department deactivated' : 'Department activated')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.departments })
    },
  })

  const columns: DataTableColumn<DepartmentItem>[] = [
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
      // The label, not the token: a search for "office" has to match the cell
      // the reader can see.
      id: 'classification',
      accessorFn: (department) => CLASSIFICATION_LABELS[department.classification],
      meta: { label: 'Classification' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Classification" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {CLASSIFICATION_LABELS[row.original.classification]}
        </span>
      ),
    },
    {
      id: 'status',
      accessorFn: (department) => (department.is_active ? 'active' : 'inactive'),
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

  const preferences = useTablePreferences('masters-departments')

  const header = (
    <PageHeader
      title="Departments"
      description="The departments a designation belongs to, and where they sit in the organisation."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <PermissionGate permissions={['departments.manage']}>
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            Add department
          </Button>
        </PermissionGate>
      }
    />
  )

  if (departmentsQuery.isError && departmentsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(departmentsQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void departmentsQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Departments"
        columns={columns}
        data={departmentsQuery.data?.items ?? []}
        search={{ placeholder: 'Search codes or names…', debounceMs: 300 }}
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={departmentsQuery.isPending}
        emptyState={
          <EmptyState
            title="No departments"
            description="Nothing matches the current search — or the table is empty, in which case the seed has not been run."
          />
        }
        getRowId={(department) => department.id}
        {...preferences}
      />

      <DepartmentFormDialog
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
        title="Delete this department?"
        description={
          deleting === null
            ? undefined
            : `${deleting.name} is removed permanently. A department that a designation still uses cannot be deleted — the server will refuse it, and the row can be deactivated instead.`
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

const departmentSchema = z.object({
  code: codeField,
  name: nameField,
  // The generated union, offered as a select — the token the server validates.
  classification: z.enum(DEPARTMENT_CLASSIFICATIONS, { message: 'Choose a classification.' }),
})

type DepartmentValues = z.infer<typeof departmentSchema>

const EMPTY: DepartmentValues = { code: '', name: '', classification: 'HEAD_OFFICE' }

function DepartmentFormDialog({
  open,
  target,
  onOpenChange,
}: {
  open: boolean
  target: DepartmentItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = target !== null
  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (target) {
      form.reset({ code: target.code, name: target.name, classification: target.classification })
    }
  }, [target, form])

  const mutation = useMutation({
    mutationFn: (values: DepartmentValues) =>
      target === null
        ? api.post<DepartmentItem>('/api/v1/masters/departments', values)
        : api.patch<DepartmentItem>(`/api/v1/masters/departments/${target.id}`, {
            name: values.name,
            classification: values.classification,
          }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Department updated' : 'Department added')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.departments })
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
          <DialogTitle>{isEdit ? 'Edit department' : 'Add department'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'The name and the classification are free to change; the code identifies the row and cannot.'
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
              placeholder="head_office"
              description={isEdit ? 'The code cannot be changed.' : undefined}
              disabled={isEdit}
              required={!isEdit}
            />
            <InputField
              control={form.control}
              name="name"
              label="Name"
              autoComplete="off"
              placeholder="Head Office"
              required
            />
            <SelectField
              control={form.control}
              name="classification"
              label="Classification"
              options={CLASSIFICATION_OPTIONS}
              required
            />
            <FormActions
              submitLabel={isEdit ? 'Save changes' : 'Add department'}
              className="mt-2"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
