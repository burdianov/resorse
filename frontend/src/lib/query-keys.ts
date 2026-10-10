/**
 * Every TanStack Query key in the application is built from this module
 * (BIG-PROMPT §9.2). Centralising them is what makes targeted invalidation
 * possible later (`invalidateQueries({ queryKey: queryKeys.admin.usersRoot })`)
 * and keeps two features from inventing two spellings of the same key.
 *
 * **Identity rule.** A key for data that belongs to the signed-in user must
 * contain that user's id — e.g. `['users', userId, 'preferences']` (F041) —
 * never just the resource name. F032 clears the query cache when the identity
 * changes; carrying the id in the key means that even a missed clear cannot
 * serve one account's data from another's cache entry.
 *
 * Keys are `as const` tuples so TypeScript narrows them structurally. F034
 * introduced the first *parameterised* keys (the admin list's request params
 * are part of its identity), so the `users(params)` factory carries its root
 * as a separate constant — `invalidateQueries` matches by prefix, and the
 * prefix must be spelled once.
 */

import type { ProjectItem } from '@/lib/generated/api'

/** Request parameters that make one page of the user directory distinct. */
export interface AdminUsersParams {
  page: number
  pageSize: number
  search?: string
  isActive?: boolean
  sort: string
  order: 'asc' | 'desc'
}

const adminUsersRoot = ['admin', 'users'] as const

/** The active filter of the inbox list (F046) — part of a list key. */
export type NotificationFilter = 'all' | 'unread' | 'read'

const notificationsRoot = (userId: string) => ['notifications', userId] as const

/**
 * Files are owned by a user (F050's authorization is the owner in the SQL
 * predicate), so their keys carry the user id by the identity rule above: a
 * file list is *this account's* files and nothing else's.
 */
const filesRoot = (userId: string) => ['files', userId] as const

/** Request parameters that make one page of a file list distinct. */
export interface FileListParams {
  page: number
  pageSize: number
}

const projectsRoot = ['projects'] as const

/**
 * Request parameters that make one page of the project register distinct
 * (D009). `status` is the generated contract's own union rather than a copy of
 * it — the same reason `pages/projects/rules.ts` derives its vocabulary there.
 */
export interface ProjectListParams {
  page: number
  pageSize: number
  search?: string
  status?: ProjectItem['status']
  sort: string
  order: 'asc' | 'desc'
}

export const queryKeys = {
  /** Liveness of the API — GET /api/v1/health. */
  health: ['health'] as const,
  /**
   * The signed-in user's preferences (F048) — `GET /auth/me/preferences`,
   * read once per identity to seed the table store and the theme. The user id
   * is in the key by the identity rule above; `null` is the anonymous slot,
   * where the query is disabled and no entry is ever written.
   */
  preferences: (userId: string | null) => ['preferences', userId] as const,
  /**
   * The signed-in user's inbox (F046). The user id is in the key by the
   * identity rule above — notifications are per-user data by definition.
   */
  notifications: {
    /** Invalidation root for every inbox mutation. */
    root: (userId: string) => notificationsRoot(userId),
    /**
     * The unread count — the bell's badge and the page's pill read **this one
     * entry**, so the two can never disagree about the same number.
     */
    unreadCount: (userId: string) => [...notificationsRoot(userId), 'unread-count'] as const,
    /** Prefix of every filtered list, for prefix invalidation. */
    listRoot: (userId: string) => [...notificationsRoot(userId), 'list'] as const,
    list: (userId: string, filter: NotificationFilter) =>
      [...notificationsRoot(userId), 'list', filter] as const,
  },
  admin: {
    /** Invalidate this to refetch every page/filter of the user directory. */
    usersRoot: adminUsersRoot,
    users: (params: AdminUsersParams) => [...adminUsersRoot, params] as const,
    /** The role catalogue (F034's picker; F035 extends the surface). */
    roles: ['admin', 'roles'] as const,
    /** The permission dictionary (F036's matrix rows; F037's CRUD later). */
    permissions: ['admin', 'permissions'] as const,
    /** The effective application settings (F039's snapshot; F040 edits). */
    settings: ['admin', 'settings'] as const,
    /** The audit trail (F044's viewer; params carry the filters). */
    audit: (params: Record<string, unknown>) => ['admin', 'audit', params] as const,
  },
  /**
   * The three reference tables (D006). No user id: these are bounded, globally
   * shared vocabularies, not per-user data — every screen that shows a picker
   * reads the same entry, and an edit on one screen serves the next screen's
   * read. Lists are unpaginated server-side (D005), so the key carries no
   * parameters.
   */
  masters: {
    disciplines: ['masters', 'disciplines'] as const,
    departments: ['masters', 'departments'] as const,
    designations: ['masters', 'designations'] as const,
  },
  /** The signed-in user's own files (F050's API; F054 is its first consumer). */
  files: {
    /** Invalidation root for uploads and deletions. */
    root: (userId: string) => filesRoot(userId),
    list: (userId: string, params: FileListParams) =>
      [...filesRoot(userId), 'list', params] as const,
  },
  /**
   * The project register (D009). No user id: projects are shared business
   * records, not per-user data — every reader of the same page sees the same
   * rows, and the server's own project scope (D081) is what decides *which*
   * project a caller may read, not this key. **Paginated**, unlike the reference
   * tables above, so the list key carries its request parameters — the
   * `admin.users` shape, and the reason `root` is exposed separately: the status
   * mutation invalidates that prefix so the detail entry and every page of the
   * list refetch together.
   */
  projects: {
    /** Invalidation root: matches the list pages and every detail entry. */
    root: projectsRoot,
    list: (params: ProjectListParams) => [...projectsRoot, 'list', params] as const,
    detail: (projectId: string) => [...projectsRoot, 'detail', projectId] as const,
  },
}
