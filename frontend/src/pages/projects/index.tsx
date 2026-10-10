import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FolderKanban } from 'lucide-react'
import { Link } from 'react-router'
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table'

import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, DataTableColumnHeader, DataTableViewOptions } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTablePreferences } from '@/hooks/use-table-preferences'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { formatDate } from '@/lib/format-date'
import { queryKeys } from '@/lib/query-keys'
import { PROJECT_STATUS_ITEMS, PROJECT_STATUS_LABELS } from './rules'
import type { ProjectItem, ProjectListResponse } from '@/lib/generated/api'
import type { ProjectStatus } from './rules'

/**
 * `/projects` — the project register (D009).
 *
 * **Server mode, unlike the reference tables.** D005's vocabularies are
 * deliberately unpaginated and the browser sorts a few dozen rows; projects
 * accumulate, so D008's list is paginated with C22's bounds and this screen
 * sends page, sort, search and status as *request parameters* — the
 * `admin/users` shape, and the reason the footer's total is the server's
 * count rather than the length of a loaded page. The page size choices the
 * table offers are 10/25/50/100 and the API's cap is 100, so the control can
 * never ask for a page the server refuses.
 *
 * **Only the fields the API sorts by are sortable here.** D008's allowlist is
 * `code`, `name`, `status`, `start_date`, `contractual_completion`,
 * `forecast_completion` (and `created_at`, which no column shows), so the
 * Responsible column declares `enableSorting: false` — a header that offered an
 * order the server ignores would be the sort of dead control §1.2 forbids.
 *
 * **The row's code is the link.** The code is the project's identity (D007), so
 * it is what opens the record; the detail screen is where the status control
 * lives, and this screen stays a register that reads. Nothing here mutates: the
 * list is `projects.read` and D008 gates every write on its own code, so a page
 * with no write controls cannot pretend to have any.
 *
 * **No "Add project" button.** D009's scope is the list, the details and the
 * status control; the create shape is D008's and a form for it is a later
 * task's. An "Add project" that opened nothing, or one that posted to an
 * endpoint nothing tested, is exactly the inert control the requirements ban —
 * so the empty state says where rows come from instead.
 *
 * The responsible-person column reports the fact rather than a name: resolving
 * a user id to a full name needs `users.read`, which a reader of the project
 * register need not hold (D081 owns the scoped read), so the cell says whether
 * someone is answerable and the detail screen shows the id.
 */

type StatusFilter = 'all' | ProjectStatus

export function ProjectsPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const firstPage = { pageIndex: 0, pageSize: pagination.pageSize }

  const requestParams = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      page_size: pagination.pageSize,
      ...(globalFilter.trim() === '' ? {} : { search: globalFilter.trim() }),
      ...(status === 'all' ? {} : { status }),
      sort: sorting[0]?.id ?? 'created_at',
      order: sorting[0]?.desc === false ? ('asc' as const) : ('desc' as const),
    }),
    [pagination, globalFilter, status, sorting],
  )

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list({
      page: requestParams.page,
      pageSize: requestParams.page_size,
      ...(requestParams.search !== undefined ? { search: requestParams.search } : {}),
      ...(requestParams.status !== undefined ? { status: requestParams.status } : {}),
      sort: requestParams.sort,
      order: requestParams.order,
    }),
    queryFn: () => api.get<ProjectListResponse>('/api/v1/projects', { params: requestParams }),
    placeholderData: keepPreviousData,
  })

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    // A cleared sort keeps the current order: the API always orders by
    // something, and dropping the state would show rows in an order the server
    // did not choose (the user directory's rule).
    if (first === undefined) return
    setSorting([{ id: first.id, desc: first.desc }])
    setPagination(firstPage)
  }

  const handleGlobalFilterChange: OnChangeFn<string> = (updater) => {
    const next = typeof updater === 'function' ? updater(globalFilter) : updater
    setGlobalFilter(next ?? '')
    setPagination(firstPage)
  }

  const columns: DataTableColumn<ProjectItem>[] = [
    {
      id: 'code',
      accessorKey: 'code',
      meta: { label: 'Code' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <Link
          to={`/projects/${row.original.id}`}
          className="font-mono text-sm underline-offset-4 hover:underline"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      id: 'name',
      accessorKey: 'name',
      meta: { label: 'Name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          label={PROJECT_STATUS_LABELS[row.original.status]}
        />
      ),
    },
    {
      id: 'start_date',
      accessorKey: 'start_date',
      meta: { label: 'Start' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.start_date)}</span>
      ),
    },
    {
      id: 'contractual_completion',
      accessorKey: 'contractual_completion',
      meta: { label: 'Contractual completion' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Contractual completion" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.contractual_completion)}
        </span>
      ),
    },
    {
      id: 'forecast_completion',
      accessorKey: 'forecast_completion',
      meta: { label: 'Forecast completion' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Forecast completion" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.forecast_completion)}
        </span>
      ),
    },
    {
      // Not sortable: D008's allowlist does not carry the responsible person.
      id: 'responsible_user_id',
      enableSorting: false,
      meta: { label: 'Responsible person' },
      header: () => <span className="text-sm font-medium">Responsible person</span>,
      cell: ({ row }) =>
        row.original.responsible_user_id === null ? (
          <span className="text-muted-foreground">Not assigned</span>
        ) : (
          <span className="text-muted-foreground">Assigned</span>
        ),
    },
  ]

  const preferences = useTablePreferences('projects')

  const header = (
    <PageHeader
      title="Projects"
      description="Every tender and awarded project, with its lifecycle status and dates."
      breadcrumbs={<AppBreadcrumbs />}
    />
  )

  if (projectsQuery.isError && projectsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(projectsQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void projectsQuery.refetch()
          }}
        />
      </div>
    )
  }

  const filtered = globalFilter.trim() !== '' || status !== 'all'

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Projects"
        columns={columns}
        data={projectsQuery.data?.items ?? []}
        search={{ placeholder: 'Search codes or names…', debounceMs: 300 }}
        filters={
          <Select
            value={status}
            // `items` is what makes the closed control read "All statuses"
            // rather than the raw token — see `PROJECT_STATUS_ITEMS`.
            items={[{ value: 'all', label: 'All statuses' }, ...PROJECT_STATUS_ITEMS]}
            onValueChange={(value) => {
              setStatus(value as StatusFilter)
              setPagination(firstPage)
            }}
          >
            <SelectTrigger className="w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROJECT_STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={projectsQuery.isPending}
        emptyState={
          filtered ? undefined : (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Projects are created through the projects API; this register lists them once they exist."
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
        rowCount={projectsQuery.data?.total ?? 0}
        getRowId={(project) => project.id}
        {...preferences}
      />
    </div>
  )
}
