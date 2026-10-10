import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, apiClient } from '@/lib/api'
import { filenameFromContentDisposition } from '@/lib/content-disposition'
import type { FileItem, FileListResponse } from '@/lib/generated/api'
import { useAuth } from '@/lib/auth'
import { queryKeys } from '@/lib/query-keys'

/**
 * The file store's client half (F054) over F050's API.
 *
 * Three operations and nothing else, because that is what the API offers:
 * list this account's files, store one, delete one — and, separately, fetch one
 * back. No cache of its own: TanStack Query holds the list, and every write
 * invalidates the account's file root so the list the user is looking at is the
 * server's answer rather than a locally patched guess.
 *
 * **Every key and every request is the signed-in account's.** The server's
 * authorization is ownership (the id *and* the session's user id in one SQL
 * predicate, C38), and the keys carry the user id for the reason
 * `lib/query-keys.ts` states: one account's list must never be servable from
 * another account's cache entry, even for the instant before the identity
 * change clears the cache.
 */

/** One page of files. The API caps `page_size` at 100; the lab shows the newest. */
export const FILE_PAGE_SIZE = 25

/** One upload in flight. */
export interface UploadFileRequest {
  file: File
  /** A slug like `templates` — the API's `category` form field. */
  category: string
  /** 0–100, for the progress bar. Called on the main thread, as axios does. */
  onProgress?: (percent: number) => void
}

/** This account's files, newest first (the API's own order). */
export function useFiles() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const params = { page: 1, pageSize: FILE_PAGE_SIZE }

  return useQuery({
    queryKey: queryKeys.files.list(userId ?? 'anonymous', params),
    queryFn: () =>
      api.get<FileListResponse>('/api/v1/files', {
        params: { page: params.page, page_size: params.pageSize },
      }),
    // No session, no request: the endpoint would answer 401 and the shell is on
    // its way to `/login` anyway.
    enabled: userId !== null,
  })
}

/**
 * Store one file.
 *
 * The body is `FormData` and the multipart boundary is left to the browser:
 * setting a `Content-Type` by hand here is the classic way to lose the
 * boundary and have the server refuse a body it cannot parse. The CSRF header
 * still arrives, because it is added by the request interceptor rather than
 * here.
 */
export function useUploadFile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? null

  return useMutation({
    mutationFn: async ({ file, category, onProgress }: UploadFileRequest): Promise<FileItem> => {
      const body = new FormData()
      body.append('file', file)
      body.append('category', category)
      return api.post<FileItem>('/api/v1/files', body, {
        onUploadProgress: (event) => {
          // `progress` is axios's own 0–1 readiness, and it is absent when the
          // response is served from a cache or the transport cannot report it.
          if (onProgress) onProgress(Math.round((event.progress ?? 0) * 100))
        },
      })
    },
    onSuccess: () => {
      if (userId !== null) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files.root(userId) })
      }
    },
  })
}

export interface DownloadedFile {
  blob: Blob
  filename: string
}

/**
 * Fetch a file's bytes. Used both to download and to preview, since both want
 * the same response: the reason it is a mutation rather than a query is that
 * neither action is a *state* — nothing on screen depends on the bytes until
 * the reader asks for them.
 *
 * The name comes from the server's `Content-Disposition` (F053's rule): the
 * browser's clock and the server's record of when a file was stored can
 * disagree, and the header is the only version that cannot contradict itself.
 * The call is `apiClient.request` rather than `api.get` because the façade
 * returns `response.data` alone and the name arrives beside it, in the headers.
 */
export function useDownloadFile() {
  return useMutation({
    mutationFn: async (item: FileItem): Promise<DownloadedFile> => {
      const response = await apiClient.request<Blob>({
        method: 'GET',
        url: `/api/v1/files/${item.id}/content`,
        responseType: 'blob',
      })
      return {
        blob: response.data,
        filename:
          filenameFromContentDisposition(response.headers['content-disposition']) ??
          item.original_filename,
      }
    },
  })
}

/** Delete one of this account's files (the API answers 204). */
export function useDeleteFile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? null

  return useMutation({
    mutationFn: (item: FileItem) => api.delete<void>(`/api/v1/files/${item.id}`),
    onSuccess: () => {
      if (userId !== null) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files.root(userId) })
      }
    },
  })
}
