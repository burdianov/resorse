import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { PermissionGate } from '@/components/common/permission-gate'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTableRowActions } from '@/components/data-table'
import { UnsavedChangesGuard } from '@/components/form/unsaved-changes-guard'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAccess } from '@/components/providers/access-provider'
import { meetsAccess } from '@/config/access'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { toast } from 'sonner'
import { RenameRoleDialog, CreateRoleDialog } from './role-dialogs'
import type {
  ListPermissionsApiV1AdminPermissionsGetResponse,
  ListRolesApiV1AdminRolesGetResponse,
  RoleItem,
} from '@/lib/generated/api'

/**
 * `/admin/roles` — the permission matrix (F036, BP-7.4).
 *
 * One screen, one write. The matrix renders every permission code (grouped by
 * its namespace, from the dictionary endpoint) against every role (a column,
 * from the catalogue), and every tick lands in a **local draft** — never in a
 * request. Only "Save changes" crosses the wire, as the single
 * `PUT /admin/roles/matrix` call F035 built: all entries validated, all
 * replacements committed, or nothing. This is the deliberate opposite of the
 * reference's per-cell PATCH loop, whose partial success BP-7.4 names as the
 * bug; the UI makes the atomicity visible by keeping *every* edit — however
 * many cells — in the same unsaved state.
 *
 * Shape decisions worth keeping:
 *
 * - **A draft, not a form.** `draft` is seeded from the server once
 *   (`draft === null` gates it), so a background refetch cannot silently
 *   clobber edits in progress; Reset re-seeds on demand and a successful save
 *   re-seeds through `setDraft(null)` + invalidate — the bar and the count
 *   always compare the draft against the *server's* current answer.
 * - **The `super_admin` column is rendered read-only** (`is_system` from the
 *   catalogue): disabled checkboxes, a lock in the header. The column still
 *   rides the save payload **unchanged** — F035/C24 accepts that on purpose,
 *   so "submit the whole visible matrix" needs no special case anywhere.
 * - **Errors come from the server, verbatim.** A 422 (`roles.<i>…`) or the
 *   rule 403 lands in the save bar with the server's sentence and the draft
 *   is preserved — a failed save must never look like a lost edit. The toast
 *   is suppressed for the save (`suppressErrorToast`) so the bar is the one
 *   place it is said.
 * - **Leaving with unsaved edits asks first** (F019's guard): navigation is
 *   blocked while the draft differs, because a matrix is exactly the screen
 *   where "I'll come back to it" loses an afternoon's ticks.
 * - Role create/rename/delete live in the column menus (F035's endpoints);
 *   grants are the matrix's business only — the dialogs never touch them
 *   (one path to the grant write, per C24).
 */

type Draft = Record<string, string[]>

/**
 * One shared empty list. `data?.items ?? []` inside the render body builds a
 * new array every render, which would make every hook that depends on it
 * recompute each time — `react-hooks/exhaustive-deps` flags it (F055).
 */
const NO_ROLES: readonly RoleItem[] = []

function seedDraft(roles: readonly RoleItem[]): Draft {
  return Object.fromEntries(roles.map((role) => [role.id, [...role.permission_codes].sort()]))
}

function draftDifferences(draft: Draft, server: Draft): { cells: number; roles: number } {
  let cells = 0
  let roles = 0
  for (const [roleId, codes] of Object.entries(draft)) {
    const before = server[roleId] ?? []
    const added = codes.filter((code) => !before.includes(code)).length
    const removed = before.filter((code) => !codes.includes(code)).length
    cells += added + removed
    if (added + removed > 0) roles += 1
  }
  return { cells, roles }
}

interface PermissionGroup {
  namespace: string
  items: { code: string; description: string | null }[]
}

/** What the save bar says about a failed save.
 *
 * The matrix save's 422 is *field-addressable* (`roles.<i>.permission_codes`)
 * and the API normaliser deliberately keeps the array-shaped detail hidden
 * behind its fallback sentence — so the specific entries are preferred when
 * they exist, and the server's message otherwise (403s carry a string). The
 * entry paths name a payload index, not a cell, so they are read, not mapped:
 * the draft stays and the admin fixes the code that named itself. */
function saveErrorText(error: unknown): string {
  const apiError = toApiError(error)
  if (apiError.fieldErrors.length > 0) {
    return apiError.fieldErrors.map((entry) => entry.message).join(' ')
  }
  return apiError.detail
}

function groupByNamespace(
  items: ListPermissionsApiV1AdminPermissionsGetResponse['items'],
): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>()
  for (const item of items) {
    const namespace = item.code.split('.')[0] ?? item.code
    const group = groups.get(namespace) ?? { namespace, items: [] }
    group.items.push({ code: item.code, description: item.description })
    groups.set(namespace, group)
  }
  return [...groups.values()]
}

export function AdminRolesPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['roles.manage'] }, access)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<RoleItem | null>(null)
  const [deleting, setDeleting] = useState<RoleItem | null>(null)

  const rolesQuery = useQuery({
    queryKey: queryKeys.admin.roles,
    queryFn: () => api.get<ListRolesApiV1AdminRolesGetResponse>('/api/v1/admin/roles'),
    staleTime: 5 * 60_000,
  })
  const permissionsQuery = useQuery({
    queryKey: queryKeys.admin.permissions,
    queryFn: () =>
      api.get<ListPermissionsApiV1AdminPermissionsGetResponse>('/api/v1/admin/permissions'),
    staleTime: 5 * 60_000,
  })

  const roles = rolesQuery.data?.items ?? NO_ROLES
  const serverDraft = useMemo(() => seedDraft(roles), [roles])

  // Seed once (and after save/reset): a background refetch while `draft` holds
  // edits must not clobber them — that is exactly the state the bar displays.
  useEffect(() => {
    if (rolesQuery.data !== undefined && draft === null) {
      setDraft(seedDraft(rolesQuery.data.items))
    }
  }, [rolesQuery.data, draft])

  const differences = useMemo(
    () => (draft === null ? { cells: 0, roles: 0 } : draftDifferences(draft, serverDraft)),
    [draft, serverDraft],
  )
  const dirty = differences.cells > 0

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<void>('/api/v1/admin/roles/matrix', {
        // The whole visible matrix, in the catalogue's order — including the
        // protected column, unchanged (F035/C24 accepts exactly this).
        roles: roles.map((role) => ({
          role_id: role.id,
          permission_codes: draft?.[role.id] ?? [],
        })),
      }),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success('Permissions saved')
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (role: RoleItem) => api.delete<void>(`/api/v1/admin/roles/${role.id}`),
    onSuccess: () => {
      toast.success('Role deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles })
    },
  })

  const toggle = (roleId: string, code: string) => {
    setDraft((current) => {
      if (current === null) return current
      const codes = current[roleId] ?? []
      return {
        ...current,
        [roleId]: codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code],
      }
    })
  }

  const header = (
    <PageHeader
      title="Roles"
      description="Each role's permissions, one save for the whole matrix."
      breadcrumbs={<AppBreadcrumbs />}
      actions={
        <PermissionGate permissions={['roles.manage']}>
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            Add role
          </Button>
        </PermissionGate>
      }
    />
  )

  if (rolesQuery.isError && rolesQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(rolesQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void rolesQuery.refetch()
          }}
        />
      </div>
    )
  }
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

  const groups = groupByNamespace(permissionsQuery.data?.items ?? [])
  const loading = rolesQuery.isPending || permissionsQuery.isPending

  return (
    <div className="space-y-6">
      {header}
      <UnsavedChangesGuard when={dirty} />

      {roles.length === 0 && !loading ? (
        <EmptyState
          icon={PlusIcon}
          title="No roles yet"
          description="Create the first role with the Add role button; its permissions are granted here afterwards."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label="Permission matrix">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-56 bg-background align-bottom">
                  Permission
                </TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id} className="min-w-36 text-center align-bottom">
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate text-sm font-medium">{role.name}</span>
                      {role.is_system ? (
                        <LockIcon
                          aria-label="Managed by the seed"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                      {canManage ? (
                        <DataTableRowActions label={`role ${role.name}`}>
                          <DropdownMenuItem
                            disabled={role.is_system}
                            onClick={() => {
                              setRenaming(role)
                            }}
                          >
                            <PencilIcon />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={role.is_system}
                            onClick={() => {
                              setDeleting(role)
                            }}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DataTableRowActions>
                      ) : null}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={roles.length + 1} className="text-muted-foreground">
                    Loading the matrix…
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <GroupRows
                    key={group.namespace}
                    group={group}
                    roles={roles}
                    draft={draft}
                    canManage={canManage}
                    onToggle={toggle}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {dirty ? (
        <div
          data-slot="matrix-save-bar"
          className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 shadow-sm"
        >
          <p className="text-sm font-medium">
            {differences.cells} unsaved change{differences.cells === 1 ? '' : 's'} in{' '}
            {differences.roles} role{differences.roles === 1 ? '' : 's'}
          </p>
          {saveMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {saveErrorText(saveMutation.error)}
            </p>
          ) : null}
          <div className="ms-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(seedDraft(roles))
                saveMutation.reset()
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              loading={saveMutation.isPending}
              onClick={() => {
                saveMutation.mutate()
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      ) : null}

      <CreateRoleDialog open={creating} onOpenChange={setCreating} />
      <RenameRoleDialog
        role={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this role?"
        description={
          deleting === null
            ? undefined
            : `${deleting.name} is removed permanently. A role that is still assigned to users cannot be deleted.`
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

function GroupRows({
  group,
  roles,
  draft,
  canManage,
  onToggle,
}: {
  group: PermissionGroup
  roles: readonly RoleItem[]
  draft: Draft | null
  canManage: boolean
  onToggle: (roleId: string, code: string) => void
}) {
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={roles.length + 1}
          className="sticky left-0 bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {group.namespace}
        </TableCell>
      </TableRow>
      {group.items.map((permission) => (
        <TableRow key={permission.code}>
          <TableCell className="sticky left-0 z-10 bg-background">
            <div className="grid gap-0.5">
              <span className="font-mono text-sm">{permission.code}</span>
              {permission.description ? (
                <span className="text-xs text-muted-foreground">{permission.description}</span>
              ) : null}
            </div>
          </TableCell>
          {roles.map((role) => {
            const checked = draft?.[role.id]?.includes(permission.code) ?? false
            const checkboxId = `matrix-${role.id}-${permission.code}`
            return (
              <TableCell key={role.id} className="text-center">
                <Checkbox
                  id={checkboxId}
                  aria-label={`${role.name}: ${permission.code}`}
                  checked={checked}
                  disabled={!canManage || role.is_system}
                  className="mx-auto"
                  onCheckedChange={() => {
                    onToggle(role.id, permission.code)
                  }}
                />
              </TableCell>
            )
          })}
        </TableRow>
      ))}
    </>
  )
}
