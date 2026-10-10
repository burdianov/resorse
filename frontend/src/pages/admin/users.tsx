import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PencilIcon,
  KeyRoundIcon,
  UserCheckIcon,
  UserXIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PermissionGate } from '@/components/common/permission-gate'
import { StatusBadge } from '@/components/common/status-badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  DataTableViewOptions,
} from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTablePreferences } from '@/hooks/use-table-preferences'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAccess } from '@/components/providers/access-provider'
import { meetsAccess } from '@/config/access'
import { formatDate } from '@/lib/format-date'
import { queryKeys } from '@/lib/query-keys'
import { toApiError } from '@/lib/errors'
import type {
  AdminUserItem,
  DeleteUserApiV1AdminUsersUserIdDeleteResponse,
  ListRolesApiV1AdminRolesGetResponse,
  ListUsersApiV1AdminUsersGetResponse,
  UpdateUserApiV1AdminUsersUserIdPatchResponse,
  UserDirectoryReportRequest,
} from '@/lib/generated/api'

import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from './user-dialogs'
import { UserDirectoryReportAction } from './user-directory-report'

/**
 * `/admin/users` — the user directory (F034, BIG-PROMPT §7.3).
 *
 * The screen is a **server-mode** DataTable: sorting, search, the status filter
 * and pagination are request parameters, and every response carries the total
 * the footer counts — F020 built the table for exactly this, and this is its
 * first real consumer. The table state (page, sort, search, status) lives here
 * in the page, in one place, because all four feed the same query key: change
 * any of them and the directory refetches with `placeholderData` keeping the
 * previous page visible instead of flashing a skeleton.
 *
 * Deliberate choices worth naming:
 *
 * - **No faceted filter for the status column.** Facets count *loaded* rows;
 *   against a server page those counts would be quietly wrong. The toolbar
 *   carries a plain status select instead, and the table's own filter state
 *   stays out of the server path entirely.
 * - **Sorting is single-column and always on.** The API sorts by one allowed
 *   field with an id tiebreaker; a "cleared" sort state would show rows in an
 *   order the server did not choose, so a clear keeps the current order.
 * - **Permissions gate the controls, the server gates the actions** (§6.3d):
 *   "Add user" renders only for `users.create`, the reset/deactivate/delete
 *   items only for their codes — and every one of them would still 403 server-
 *   side if the UI were fooled.
 * - **The row actions mirror C22's self rules**: on your own row, deactivate
 *   and delete are disabled with the reason attached, because the API refuses
 *   them — an enabled button that always 403s is a lie of the sort §1.2 bans.
 *   Last-super-admin protection is *not* mirrored (it needs a count the list
 *   does not carry): that refusal arrives as the server's 409 sentence.
 * - **The PDF export is this screen's filter state, sent to the server**
 *   (F053): `UserDirectoryReportAction` posts the same search/status/sort the
 *   query above uses, so the file is the directory the reader is looking at.
 *   It is gated on both codes the route demands, and it is the server that
 *   decides which rows those filters select.
 */

type StatusFilter = 'all' | 'active' | 'inactive'

type ReportSortField = NonNullable<UserDirectoryReportRequest['sort']>

/** The report API's sort vocabulary, as the directory's three sortable columns
 *  map onto it (`last_login_at` is accepted by the API and not shown here). */
const REPORT_SORT_FIELDS: readonly string[] = ['full_name', 'email', 'created_at', 'last_login_at']

function isReportSort(id: string): id is ReportSortField {
  return REPORT_SORT_FIELDS.includes(id)
}

function columnsFor(options: {
  isSelf: (user: AdminUserItem) => boolean
  canUpdate: boolean
  canDeactivate: boolean
  canResetPassword: boolean
  canDelete: boolean
  onEdit: (user: AdminUserItem) => void
  onReset: (user: AdminUserItem) => void
  onToggleActive: (user: AdminUserItem) => void
  onDelete: (user: AdminUserItem) => void
}): DataTableColumn<AdminUserItem>[] {
  return [
    {
      id: 'full_name',
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Full name" />,
      cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span>,
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: 'roles',
      enableSorting: false,
      header: () => <span className="text-sm font-medium">Roles</span>,
      cell: ({ row }) =>
        row.original.roles.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role.id} variant="secondary">
                {role.name}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      id: 'status',
      enableSorting: false,
      header: () => <span className="text-sm font-medium">Status</span>,
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.is_deleted ? 'deleted' : row.original.is_active ? 'active' : 'inactive'
          }
        />
      ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const user = row.original
        const self = options.isSelf(user)
        const hasActions =
          options.canUpdate ||
          options.canResetPassword ||
          options.canDeactivate ||
          options.canDelete
        return hasActions ? (
          <div className="flex justify-end">
            <DataTableRowActions label={user.full_name}>
              {options.canUpdate ? (
                <DropdownMenuItem
                  onClick={() => {
                    options.onEdit(user)
                  }}
                >
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {options.canResetPassword ? (
                <DropdownMenuItem
                  onClick={() => {
                    options.onReset(user)
                  }}
                >
                  <KeyRoundIcon />
                  Reset password
                </DropdownMenuItem>
              ) : null}
              {options.canDeactivate ? (
                <DropdownMenuItem
                  disabled={self}
                  title={self ? 'You cannot deactivate your own account.' : undefined}
                  onClick={() => {
                    options.onToggleActive(user)
                  }}
                >
                  {user.is_active ? <UserXIcon /> : <UserCheckIcon />}
                  {user.is_active ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
              ) : null}
              {options.canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={self}
                    title={self ? 'You cannot delete your own account.' : undefined}
                    onClick={() => {
                      options.onDelete(user)
                    }}
                  >
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DataTableRowActions>
          </div>
        ) : null
      },
    },
  ]
}

export function AdminUsersPage() {
  const auth = useAuth()
  const access = useAccess()
  const queryClient = useQueryClient()

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUserItem | null>(null)
  const [resetting, setResetting] = useState<AdminUserItem | null>(null)
  const [confirming, setConfirming] = useState<{
    kind: 'deactivate' | 'delete'
    user: AdminUserItem
  } | null>(null)

  const firstPage = { pageIndex: 0, pageSize: pagination.pageSize }

  const requestParams = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      page_size: pagination.pageSize,
      ...(globalFilter.trim() === '' ? {} : { search: globalFilter.trim() }),
      ...(status === 'all' ? {} : { is_active: status === 'active' }),
      sort: sorting[0]?.id ?? 'created_at',
      order: sorting[0]?.desc === false ? ('asc' as const) : ('desc' as const),
    }),
    [pagination, globalFilter, status, sorting],
  )

  // The same filters the table is showing, in the report API's terms (F053).
  // The screen can only sort by a column it has, and every sortable one is a
  // field the report accepts — the guard narrows the type rather than handling
  // a case that occurs.
  const reportRequest = useMemo<UserDirectoryReportRequest>(
    () => ({
      ...(globalFilter.trim() === '' ? {} : { search: globalFilter.trim() }),
      ...(status === 'all' ? {} : { is_active: status === 'active' }),
      sort: isReportSort(requestParams.sort) ? requestParams.sort : 'created_at',
      order: requestParams.order,
    }),
    [globalFilter, status, requestParams],
  )

  const usersQuery = useQuery({
    queryKey: queryKeys.admin.users({
      page: requestParams.page,
      pageSize: requestParams.page_size,
      ...(requestParams.search !== undefined ? { search: requestParams.search } : {}),
      ...(requestParams.is_active !== undefined ? { isActive: requestParams.is_active } : {}),
      sort: requestParams.sort,
      order: requestParams.order,
    }),
    queryFn: () =>
      api.get<ListUsersApiV1AdminUsersGetResponse>('/api/v1/admin/users', {
        params: requestParams,
      }),
    placeholderData: keepPreviousData,
  })

  const rolesQuery = useQuery({
    queryKey: queryKeys.admin.roles,
    queryFn: () => api.get<ListRolesApiV1AdminRolesGetResponse>('/api/v1/admin/roles'),
    // The catalogue changes rarely; F035's mutations will invalidate this key.
    staleTime: 5 * 60_000,
  })

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot })

  const toggleActiveMutation = useMutation({
    mutationFn: (user: AdminUserItem) =>
      api.patch<UpdateUserApiV1AdminUsersUserIdPatchResponse>(`/api/v1/admin/users/${user.id}`, {
        is_active: !user.is_active,
      }),
    onSuccess: () => {
      void invalidateUsers()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (user: AdminUserItem) =>
      api.delete<DeleteUserApiV1AdminUsersUserIdDeleteResponse>(`/api/v1/admin/users/${user.id}`),
    onSuccess: () => {
      void invalidateUsers()
    },
  })

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (first === undefined) return // a cleared sort keeps the current order (see header note)
    setSorting([{ id: first.id, desc: first.desc }])
    setPagination(firstPage)
  }

  const handleGlobalFilterChange: OnChangeFn<string> = (updater) => {
    const next = typeof updater === 'function' ? updater(globalFilter) : updater
    setGlobalFilter(next ?? '')
    setPagination(firstPage)
  }

  const preferences = useTablePreferences('admin-users')
  const columns = columnsFor({
    isSelf: (user) => auth.user?.id === user.id,
    canUpdate: meetsAccess({ requiredPermissions: ['users.update'] }, access),
    canDeactivate: meetsAccess({ requiredPermissions: ['users.deactivate'] }, access),
    canResetPassword: meetsAccess({ requiredPermissions: ['users.reset_password'] }, access),
    canDelete: meetsAccess({ requiredPermissions: ['users.deactivate'] }, access),
    onEdit: setEditing,
    onReset: setResetting,
    onToggleActive: (user) => {
      if (user.is_active) {
        setConfirming({ kind: 'deactivate', user })
      } else {
        toggleActiveMutation.mutate(user)
      }
    },
    onDelete: (user) => setConfirming({ kind: 'delete', user }),
  })

  const header = (
    <PageHeader
      title="Users"
      description="Every account in the directory, with its roles and status."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <>
          {/* Both codes the export route demands, so the button appears only
              where the request would be answered (users.read is also what put
              the caller on this page at all). */}
          <PermissionGate permissions={['reports.generate', 'users.read']}>
            <UserDirectoryReportAction filters={reportRequest} />
          </PermissionGate>
          <PermissionGate permissions={['users.create']}>
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <UserPlusIcon />
              Add user
            </Button>
          </PermissionGate>
        </>
      }
    />
  )

  if (usersQuery.isError && usersQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(usersQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void usersQuery.refetch()
          }}
        />
      </div>
    )
  }

  const filtered = globalFilter.trim() !== '' || status !== 'all'
  const total = usersQuery.data?.total ?? 0

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Users"
        columns={columns}
        data={usersQuery.data?.items ?? []}
        search={{ placeholder: 'Search name or email…', debounceMs: 300 }}
        filters={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter)
              setPagination(firstPage)
            }}
          >
            <SelectTrigger className="w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={usersQuery.isPending}
        emptyState={
          filtered ? undefined : (
            <EmptyState
              icon={UserPlusIcon}
              title="No users yet"
              description="Create the first account with the Add user button."
            />
          )
        }
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={pagination}
        onPaginationChange={setPagination}
        globalFilter={globalFilter}
        onGlobalFilterChange={handleGlobalFilterChange}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={total}
        getRowId={(user) => user.id}
        {...preferences}
      />

      <CreateUserDialog open={creating} onOpenChange={setCreating} rolesQuery={rolesQuery} />
      <EditUserDialog
        user={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        rolesQuery={rolesQuery}
      />
      <ResetPasswordDialog
        user={resetting}
        onOpenChange={(open) => {
          if (!open) setResetting(null)
        }}
      />

      <ConfirmDialog
        open={confirming?.kind === 'deactivate'}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title="Deactivate this account?"
        description={
          confirming === null
            ? undefined
            : `${confirming.user.full_name} will be signed out everywhere and cannot sign in until the account is activated again.`
        }
        confirmLabel="Deactivate"
        destructive
        pending={toggleActiveMutation.isPending}
        onConfirm={() => {
          if (confirming !== null) toggleActiveMutation.mutate(confirming.user)
        }}
      />
      <ConfirmDialog
        open={confirming?.kind === 'delete'}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title="Delete this account?"
        description={
          confirming === null
            ? undefined
            : `${confirming.user.full_name} is deactivated, signed out everywhere, and removed from this directory for good. The email address cannot be reused. The record stays for audit.`
        }
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (confirming !== null) deleteMutation.mutate(confirming.user)
        }}
      />
    </div>
  )
}
