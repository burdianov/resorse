import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PermissionGate } from '@/components/common/permission-gate'
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  DataTableViewOptions,
} from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useAccess } from '@/components/providers/access-provider'
import { meetsAccess } from '@/config/access'
import { useTablePreferences } from '@/hooks/use-table-preferences'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { toast } from 'sonner'

import { CreatePermissionDialog, EditPermissionDialog } from './permission-dialogs'
import type {
  ListPermissionsApiV1AdminPermissionsGetResponse,
  PermissionItem,
} from '@/lib/generated/api'

/**
 * `/admin/permissions` — the dictionary table (F038, BP-7.4).
 *
 * **Client-mode on purpose** (C25/C26): the vocabulary is bounded, the list
 * endpoint is deliberately unpaginated, and sorting/searching a few dozen
 * rows in the browser is honest — F034/C23's server-mode rules apply only if
 * this list ever grows past a screen. The DataTable's own toolbar, sorting
 * and view options do the work; nothing here re-implements them.
 *
 * The DESTRUCTIVE refusals stay the server's: delete runs behind the shared
 * confirmation and a 409 ("in use, therefore frozen") surfaces as the
 * server's sentence through the query layer's mutation toast — the page
 * never guesses which codes are in use, because the list deliberately
 * carries no usage counts. Rename-vs-in-use behaves the same way inside the
 * edit dialog's root alert.
 *
 * Permission mirrors (§6.3d): Add/Edit/Delete render only with
 * `permissions.manage` — the server refuses regardless.
 */

export function AdminPermissionsPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['permissions.manage'] }, access)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PermissionItem | null>(null)
  const [deleting, setDeleting] = useState<PermissionItem | null>(null)

  const permissionsQuery = useQuery({
    queryKey: queryKeys.admin.permissions,
    queryFn: () =>
      api.get<ListPermissionsApiV1AdminPermissionsGetResponse>('/api/v1/admin/permissions'),
    staleTime: 5 * 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (permission: PermissionItem) =>
      api.delete<void>(`/api/v1/admin/permissions/${permission.id}`),
    onSuccess: () => {
      toast.success('Permission deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.permissions })
    },
  })

  const columns: DataTableColumn<PermissionItem>[] = [
    {
      id: 'code',
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      id: 'description',
      accessorKey: 'description',
      enableSorting: false,
      header: () => <span className="text-sm font-medium">Description</span>,
      cell: ({ row }) =>
        row.original.description === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-muted-foreground">{row.original.description}</span>
        ),
    },
    {
      id: 'actions',
      enableSorting: false,
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

  const preferences = useTablePreferences('admin-permissions')

  const header = (
    <PageHeader
      title="Permissions"
      description="The dictionary of permission codes every role's grants are drawn from."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <PermissionGate permissions={['permissions.manage']}>
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            Add permission
          </Button>
        </PermissionGate>
      }
    />
  )

  if (permissionsQuery.isError && permissionsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(permissionsQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void permissionsQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Permissions"
        columns={columns}
        data={permissionsQuery.data?.items ?? []}
        search={{ placeholder: 'Search codes or descriptions…', debounceMs: 300 }}
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={permissionsQuery.isPending}
        emptyState={
          <EmptyState
            title="No permission codes"
            description="Nothing matches the current search — or the dictionary is empty, in which case the seed has not been run."
          />
        }
        getRowId={(permission) => permission.id}
        {...preferences}
      />

      <CreatePermissionDialog open={creating} onOpenChange={setCreating} />
      <EditPermissionDialog
        permission={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this permission?"
        description={
          deleting === null
            ? undefined
            : `${deleting.code} is removed permanently. A code that any role holds cannot be deleted — the server will refuse it.`
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
