import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PermissionGate } from '@/components/common/permission-gate'
import { StatusBadge } from '@/components/common/status-badge'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { formatDate } from '@/lib/format-date'
import { queryKeys } from '@/lib/query-keys'
import { PROJECT_STATUS_ITEMS, PROJECT_STATUS_LABELS } from './rules'
import type { ProjectItem } from '@/lib/generated/api'
import type { ProjectStatus } from './rules'

/**
 * `/projects/:projectId` — one project's record, and the status control (D009).
 *
 * **The status control is an ordinary edit of one field, not an award.** D008
 * gave this project a lifecycle *field* and deliberately no transition machine:
 * §3's matrix hands the conversion — the second row, the tender retired and kept
 * as history, the plan copied, one award only — to D033 under its own action.
 * So this screen offers the three states the contract carries and states what
 * the change is: it records the lifecycle state and nothing else. A guard here
 * ("awarded may follow only from tender, and only through the award flow") would
 * be a second implementation of the rule D033 owns, and it would be *wrong* in
 * the one case that matters, since the award flow is the thing that will write
 * this field. `projects.update` is the code the server enforces; the control
 * renders only for a caller holding it (§6.3d — the gate is visibility, the API
 * is the boundary), and the button stays disabled until the selection actually
 * changes, so the screen never posts a no-op — which D008's route answers 400
 * for, by design.
 *
 * **The responsible person is read-only.** D008's request shapes do not carry
 * the field: §3's matrix gives that action its own code (`projects.responsibility`)
 * and its own task (D019), so what this screen can honestly show is the id the
 * contract returns. Rendering a *name* would need the user directory, which a
 * reader of the project register need not be allowed to read (D081 owns the
 * scoped read), so the id is shown as it arrived rather than resolved through an
 * endpoint this caller may not call.
 *
 * **A missing id is the API's answer, not this page's guess.** D008 answers 404
 * for an unknown (or malformed) id, and the state below renders that as "not
 * found" with a way back — distinct from the offline/error state, which offers
 * Retry.
 */
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  // The pending selection, or null while the screen follows the server's value.
  // Keeping it separate from the fetched project is what lets the server be the
  // only thing the select's *value* comes from once a save settles.
  const [selected, setSelected] = useState<ProjectStatus | null>(null)

  const projectQuery = useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ''),
    queryFn: () => api.get<ProjectItem>(`/api/v1/projects/${projectId ?? ''}`),
    enabled: projectId !== undefined,
  })

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) =>
      api.patch<ProjectItem>(`/api/v1/projects/${projectId ?? ''}`, { status }),
    onSuccess: (updated) => {
      setSelected(null)
      toast.success(`Status changed to ${PROJECT_STATUS_LABELS[updated.status]}`)
      // The prefix invalidates the detail entry *and* every page of the list,
      // so the register never keeps showing the row's old state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.root })
    },
  })

  if (projectQuery.isError) {
    const error = toApiError(projectQuery.error)
    if (error.isNotFound) {
      return (
        <div className="mx-auto max-w-2xl space-y-6">
          <ErrorState
            title="Project not found"
            description="This project does not exist, or it has been removed since this link was made."
          >
            <Link to="/projects" className={buttonVariants({ variant: 'outline' })}>
              Back to projects
            </Link>
          </ErrorState>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <ErrorState
          variant={error.isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void projectQuery.refetch()
          }}
        />
      </div>
    )
  }

  if (projectQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const project = projectQuery.data
  const effectiveStatus = selected ?? project.status
  const dirty = selected !== null && selected !== project.status

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{project.code}</span>
            <StatusBadge status={project.status} label={PROJECT_STATUS_LABELS[project.status]} />
          </span>
        }
        description={project.name}
        breadcrumbs={<AppBreadcrumbs />}
        actions={
          <Link to="/projects" className={buttonVariants({ variant: 'ghost' })}>
            <ArrowLeftIcon />
            All projects
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Status</span>
            <PermissionGate
              permissions={['projects.update']}
              fallback={
                <p className="text-sm text-muted-foreground">
                  {PROJECT_STATUS_LABELS[project.status]}
                </p>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={effectiveStatus}
                  // `items` is what makes the closed control read "Tender" and
                  // not the raw `tender` token — see `PROJECT_STATUS_ITEMS`.
                  items={[...PROJECT_STATUS_ITEMS]}
                  onValueChange={(value) => {
                    setSelected(value as ProjectStatus)
                  }}
                >
                  <SelectTrigger className="w-40" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!dirty || statusMutation.isPending}
                  onClick={() => {
                    if (selected !== null) statusMutation.mutate(selected)
                  }}
                >
                  Save status
                </Button>
              </div>
            </PermissionGate>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing the status records the lifecycle state. Awarding — copying a tender into the
            awarded project it becomes — is its own reviewed action.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Start date" value={formatDate(project.start_date)} />
            <Detail
              label="Contractual completion"
              value={formatDate(project.contractual_completion)}
            />
            <Detail label="Forecast completion" value={formatDate(project.forecast_completion)} />
            <Detail
              label="Responsible person"
              value={
                project.responsible_user_id === null ? (
                  <span className="text-muted-foreground">Not assigned</span>
                ) : (
                  // The id the contract carries, not a name: see the docstring.
                  <span className="font-mono text-xs">{project.responsible_user_id}</span>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}
