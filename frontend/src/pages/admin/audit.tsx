import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollTextIcon } from 'lucide-react'
import type { OnChangeFn, PaginationState } from '@tanstack/react-table'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { DataTable, DataTableRowActions, DataTableViewOptions } from '@/components/data-table'
import type { DataTableColumn } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
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
import type { AuditItem, ListAuditApiV1AdminAuditGetResponse } from '@/lib/generated/api'

/**
 * `/admin/audit` — the trail viewer (F044, §7.8).
 *
 * Read-only, and structurally so: F043 built the table append-only with no
 * mutation routes, so this screen has nothing to disable — there simply is
 * no write path for it to hide. The acceptance's "authorization" half lives
 * in the route guard (`audit.read`) and the API's own guard behind it.
 *
 * Server-mode DataTable, F034/C23's shape: page, search, the three filters
 * and the period all feed request parameters; the order is **fixed** newest
 * first (an audit trail is chronological — there is nothing to sort it by
 * other than time, so offering sort buttons would be offering a lie). The
 * filter options come from the response's own vocabulary (`actions`,
 * `entity_types`) — the server's constants, never a hand-kept client copy
 * (C33); the period select turns into a `since` bound, computed at request
 * time, which is why it lives in page state rather than a persisted value.
 *
 * The detail modal renders what the row already carries — no second request:
 * before/after pairs as a two-column diff, the matrix/settings `changes`
 * shape per key, and anything else as formatted JSON. The correlation id is
 * shown in mono: it is the string that joins this row to the log line and
 * (via `ApiError.requestId`) to the response the operator saw.
 */

type Period = 'all' | '24h' | '7d' | '30d'

function sinceFor(period: Period): string | undefined {
  if (period === 'all') return undefined
  const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : 24 * 30
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  if (details === null) {
    return <p className="text-sm text-muted-foreground">No details recorded for this event.</p>
  }

  // The F033/F037 per-event diff shape.
  if ('before' in details && 'after' in details) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Before
          </p>
          <JsonBlock value={details['before']} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            After
          </p>
          <JsonBlock value={details['after']} />
        </div>
      </div>
    )
  }

  // The matrix/settings shape: one before/after per changed entry.
  const changes = details['changes']
  if (typeof changes === 'object' && changes !== null && !Array.isArray(changes)) {
    return (
      <div className="grid gap-3">
        {Object.entries(changes as Record<string, { before: unknown; after: unknown }>).map(
          ([subject, diff]) => (
            <div key={subject}>
              <p className="mb-1 font-mono text-xs text-muted-foreground">{subject}</p>
              <div className="grid grid-cols-2 gap-3">
                <JsonBlock value={diff.before} />
                <JsonBlock value={diff.after} />
              </div>
            </div>
          ),
        )}
      </div>
    )
  }

  return <JsonBlock value={details} />
}

export function AdminAuditPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const [globalFilter, setGlobalFilter] = useState('')
  const [action, setAction] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [period, setPeriod] = useState<Period>('all')
  const [selected, setSelected] = useState<AuditItem | null>(null)

  const firstPage = { pageIndex: 0, pageSize: pagination.pageSize }

  const requestParams = useMemo(() => {
    const since = sinceFor(period)
    return {
      page: pagination.pageIndex + 1,
      page_size: pagination.pageSize,
      ...(globalFilter.trim() === '' ? {} : { search: globalFilter.trim() }),
      ...(action === 'all' ? {} : { action }),
      ...(entityType === 'all' ? {} : { entity_type: entityType }),
      ...(since === undefined ? {} : { since }),
    }
  }, [pagination, globalFilter, action, entityType, period])

  const auditQuery = useQuery({
    queryKey: queryKeys.admin.audit(requestParams),
    queryFn: () =>
      api.get<ListAuditApiV1AdminAuditGetResponse>('/api/v1/admin/audit', {
        params: requestParams,
      }),
    placeholderData: (previous) => previous,
  })

  const resetPage = () => setPagination(firstPage)

  const handleGlobalFilterChange: OnChangeFn<string> = (updater) => {
    const next = typeof updater === 'function' ? updater(globalFilter) : updater
    setGlobalFilter(next ?? '')
    resetPage()
  }

  const columns: DataTableColumn<AuditItem>[] = [
    {
      id: 'created_at',
      accessorKey: 'created_at',
      enableSorting: false,
      // The header is a component, so the column's human name has to live in
      // `meta.label` for the view options and the CSV export to print it.
      meta: { label: 'Time' },
      header: () => <span className="text-sm font-medium">Time</span>,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDate(row.original.created_at, 'dd.MM.yyyy HH:mm')}
        </span>
      ),
    },
    {
      id: 'action',
      accessorKey: 'action',
      enableSorting: false,
      meta: { label: 'Action' },
      header: () => <span className="text-sm font-medium">Action</span>,
      cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
    },
    {
      id: 'actor',
      accessorKey: 'actor_email',
      enableSorting: false,
      meta: { label: 'Actor' },
      header: () => <span className="text-sm font-medium">Actor</span>,
      cell: ({ row }) =>
        row.original.actor_email === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-muted-foreground">{row.original.actor_email}</span>
        ),
    },
    {
      id: 'summary',
      accessorKey: 'summary',
      enableSorting: false,
      meta: { label: 'Summary' },
      header: () => <span className="text-sm font-medium">Summary</span>,
      cell: ({ row }) => <span>{row.original.summary}</span>,
    },
    {
      id: 'entity_type',
      accessorKey: 'entity_type',
      enableSorting: false,
      meta: { label: 'Entity' },
      header: () => <span className="text-sm font-medium">Entity</span>,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.entity_type}</span>,
    },
    {
      id: 'actions',
      enableSorting: false,
      meta: { label: 'Actions' },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions label={row.original.summary}>
            <DropdownMenuItem
              onClick={() => {
                setSelected(row.original)
              }}
            >
              <ScrollTextIcon />
              View details
            </DropdownMenuItem>
          </DataTableRowActions>
        </div>
      ),
    },
  ]

  const preferences = useTablePreferences('admin-audit')
  const vocabulary = auditQuery.data

  const header = (
    <PageHeader
      title="Audit Trail"
      description="Every administrative change, newest first — append-only, and never editable."
      breadcrumbs={<AppBreadcrumbs />}
    />
  )

  if (auditQuery.isError && auditQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(auditQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void auditQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DataTable
        label="Audit trail"
        columns={columns}
        data={auditQuery.data?.items ?? []}
        search={{ placeholder: 'Search summaries or actors…', debounceMs: 300 }}
        filters={
          <>
            <Select
              value={action}
              onValueChange={(value) => {
                setAction(value ?? 'all')
                resetPage()
              }}
            >
              <SelectTrigger className="w-44" aria-label="Action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {(vocabulary?.actions ?? []).map((known) => (
                  <SelectItem key={known} value={known}>
                    {known}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(value) => {
                setEntityType(value ?? 'all')
                resetPage()
              }}
            >
              <SelectTrigger className="w-36" aria-label="Entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {(vocabulary?.entity_types ?? []).map((known) => (
                  <SelectItem key={known} value={known}>
                    {known}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={period}
              onValueChange={(value) => {
                setPeriod(value as Period)
                resetPage()
              }}
            >
              <SelectTrigger className="w-36" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={<DataTableViewOptions onReset={preferences.reset} />}
        isLoading={auditQuery.isPending}
        pagination={pagination}
        onPaginationChange={setPagination}
        globalFilter={globalFilter}
        onGlobalFilterChange={handleGlobalFilterChange}
        manualPagination
        manualFiltering
        rowCount={auditQuery.data?.total ?? 0}
        getRowId={(item) => item.id}
        {...preferences}
      />

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.summary}</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{selected?.action}</span> · {selected?.entity_type}
              {selected?.actor_email === null || selected?.actor_email === undefined
                ? ' · system'
                : ` · ${selected.actor_email}`}
            </DialogDescription>
          </DialogHeader>
          {selected !== null ? (
            <div className="grid gap-4">
              <div className="grid gap-1 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Time</span>
                  <span>{formatDate(selected.created_at, 'dd.MM.yyyy HH:mm:ss')}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Correlation id</span>
                  <span className="font-mono text-xs">
                    {selected.correlation_id ?? '— (no request)'}
                  </span>
                </div>
              </div>
              <AuditDetails details={selected.details} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
