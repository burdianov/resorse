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

import { codeField, nameField, referenceOptions } from './rules'
import type {
  DepartmentItem,
  DepartmentListResponse,
  DesignationItem,
  DesignationListResponse,
  DisciplineItem,
  DisciplineListResponse,
} from '@/lib/generated/api'

/**
 * `/masters/designations` — the third reference table, and the one that points
 * at the other two (D006).
 *
 * **It joins client-side, on purpose.** The server sends `department_id` and
 * `discipline_id` and nothing nested (`app/schemas/masters.py` says why: the
 * lists are already loaded, and nesting would carry the same department once
 * per designation). So the page reads all three lists — which is exactly why
 * its route declares three read codes, and why each other list's mutations
 * invalidate its own key and this page re-reads them.
 *
 * **The pickers offer active references plus the one a row already holds.**
 * Retiring a department must not blank the department of a designation that
 * still points at it, so the option list is `active ∨ already-selected`
 * (`referenceOptions` in `./rules`); the server enforces the same thing from
 * its side by refusing an unknown id as a field-addressed 422.
 *
 * A designation is also deletable — nothing references it yet — but the same
 * row actions, the same one-click deactivate and the same server-owned
 * refusals apply as on the other two screens.
 */

export function DesignationsPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['designations.manage'] }, access)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DesignationItem | null>(null)
  const [deleting, setDeleting] = useState<DesignationItem | null>(null)

  const designationsQuery = useQuery({
    queryKey: queryKeys.masters.designations,
    queryFn: () => api.get<DesignationListResponse>('/api/v1/masters/designations'),
    staleTime: 5 * 60_000,
  })

  // The two reference lists this screen joins against. Same keys the other two
  // pages use, so an edit there is served from here without a second fetch.
  const departmentsQuery = useQuery({
    queryKey: queryKeys.masters.departments,
    queryFn: () => api.get<DepartmentListResponse>('/api/v1/masters/departments'),
    staleTime: 5 * 60_000,
  })

  const disciplinesQuery = useQuery({
    queryKey: queryKeys.masters.disciplines,
    queryFn: () => api.get<DisciplineListResponse>('/api/v1/masters/disciplines'),
    staleTime: 5 * 60_000,
  })

  const departments = departmentsQuery.data?.items ?? []
  const disciplines = disciplinesQuery.data?.items ?? []
  const departmentById = new Map(departments.map((department) => [department.id, department]))
  const disciplineById = new Map(disciplines.map((discipline) => [discipline.id, discipline]))

  const deleteMutation = useMutation({
    mutationFn: (designation: DesignationItem) =>
      api.delete<void>(`/api/v1/masters/designations/${designation.id}`),
    onSuccess: () => {
      toast.success('Designation deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.designations })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (designation: DesignationItem) =>
      api.patch<DesignationItem>(`/api/v1/masters/designations/${designation.id}`, {
        is_active: !designation.is_active,
      }),
    onSuccess: (_updated, designation) => {
      toast.success(designation.is_active ? 'Designation deactivated' : 'Designation activated')
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.designations })
    },
  })

  const columns: DataTableColumn<DesignationItem>[] = [
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
      // Sorting and searching on the joined *name*, because the id is not what
      // the reader is looking at.
      id: 'department',
      accessorFn: (designation) => departmentById.get(designation.department_id)?.name ?? '',
      meta: { label: 'Department' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      cell: ({ row }) => <JoinedName name={departmentById.get(row.original.department_id)?.name} />,
    },
    {
      id: 'discipline',
      accessorFn: (designation) => disciplineById.get(designation.discipline_id)?.name ?? '',
      meta: { label: 'Discipline' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Discipline" />,
      cell: ({ row }) => <JoinedName name={disciplineById.get(row.original.discipline_id)?.name} />,
    },
    {
      id: 'status',
      accessorFn: (designation) => (designation.is_active ? 'active' : 'inactive'),
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

  const preferences = useTablePreferences('masters-designations')

  const header = (
    <PageHeader
      title="Designations"
      description="The job titles people will hold, each belonging to one department and one discipline."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <PermissionGate permissions={['designations.manage']}>
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            Add designation
          </Button>
        </PermissionGate>
      }
    />
  )

  if (designationsQuery.isError && designationsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(designationsQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void designationsQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Designations"
        columns={columns}
        data={designationsQuery.data?.items ?? []}
        search={{ placeholder: 'Search codes, names or departments…', debounceMs: 300 }}
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={designationsQuery.isPending}
        emptyState={
          <EmptyState
            title="No designations"
            description="Nothing matches the current search — or the table is empty, in which case the seed has not been run."
          />
        }
        getRowId={(designation) => designation.id}
        {...preferences}
      />

      <DesignationFormDialog
        open={creating || editing !== null}
        target={editing}
        departments={departments}
        disciplines={disciplines}
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
        title="Delete this designation?"
        description={
          deleting === null
            ? undefined
            : `${deleting.name} is removed permanently. A designation that people still hold cannot be deleted — the server will refuse it, and the row can be deactivated instead.`
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

/**
 * A joined reference, or an honest gap while the list is still loading (or if
 * the row points at something this caller cannot see).
 */
function JoinedName({ name }: { name: string | undefined }) {
  if (name === undefined) return <span className="text-muted-foreground">—</span>
  return <span>{name}</span>
}

const designationSchema = z.object({
  code: codeField,
  name: nameField,
  department_id: z.string().min(1, 'Choose a department.'),
  discipline_id: z.string().min(1, 'Choose a discipline.'),
})

type DesignationValues = z.infer<typeof designationSchema>

const EMPTY: DesignationValues = {
  code: '',
  name: '',
  department_id: '',
  discipline_id: '',
}

function DesignationFormDialog({
  open,
  target,
  departments,
  disciplines,
  onOpenChange,
}: {
  open: boolean
  target: DesignationItem | null
  departments: readonly DepartmentItem[]
  disciplines: readonly DisciplineItem[]
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = target !== null
  const form = useForm<DesignationValues>({
    resolver: zodResolver(designationSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (target) {
      form.reset({
        code: target.code,
        name: target.name,
        department_id: target.department_id,
        discipline_id: target.discipline_id,
      })
    }
  }, [target, form])

  const departmentOptions = referenceOptions(
    departments,
    target?.department_id ?? null,
    (department) => `${department.name} (${department.code})`,
  )
  const disciplineOptions = referenceOptions(
    disciplines,
    target?.discipline_id ?? null,
    (discipline) => `${discipline.name} (${discipline.code})`,
  )

  const mutation = useMutation({
    mutationFn: (values: DesignationValues) =>
      target === null
        ? api.post<DesignationItem>('/api/v1/masters/designations', values)
        : api.patch<DesignationItem>(`/api/v1/masters/designations/${target.id}`, {
            name: values.name,
            department_id: values.department_id,
            discipline_id: values.discipline_id,
          }),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Designation updated' : 'Designation added')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.masters.designations })
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
          <DialogTitle>{isEdit ? 'Edit designation' : 'Add designation'}</DialogTitle>
          <DialogDescription>
            A designation belongs to exactly one department and one discipline; the references are
            free to change.
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
              placeholder="civil_engineer"
              description={isEdit ? 'The code cannot be changed.' : undefined}
              disabled={isEdit}
              required={!isEdit}
            />
            <InputField
              control={form.control}
              name="name"
              label="Name"
              autoComplete="off"
              placeholder="Civil Engineer"
              required
            />
            <SelectField
              control={form.control}
              name="department_id"
              label="Department"
              options={departmentOptions}
              placeholder="Choose a department"
              required
            />
            <SelectField
              control={form.control}
              name="discipline_id"
              label="Discipline"
              options={disciplineOptions}
              placeholder="Choose a discipline"
              required
            />
            <FormActions
              submitLabel={isEdit ? 'Save changes' : 'Add designation'}
              className="mt-2"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
