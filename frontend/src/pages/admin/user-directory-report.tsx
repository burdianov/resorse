import { Suspense, lazy, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileDownIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'
import { filenameFromContentDisposition } from '@/lib/content-disposition'
import type { UserDirectoryReportRequest } from '@/lib/generated/api'

/**
 * Export the directory as a PDF, and show it before it is downloaded (F053).
 *
 * One button on `/admin/users`, next to the screen's other actions. It carries
 * the filters the table is showing — search, status, sort, order — so the file
 * is the directory **as the reader is looking at it**, which is what BP-7.9c
 * means by drawing only authorized rows: the server resolves the same predicate
 * the list endpoint uses, and this component never decides what goes in.
 *
 * The exported rows cannot be counted here — the server rendered them — so the
 * dialog describes the file rather than quoting a total that a second query
 * could contradict.
 *
 * **Why `apiClient` and not `api.post`.** The facade returns `response.data`,
 * and a download's name arrives beside it, in `Content-Disposition`. Naming the
 * file here from the browser's clock would put a different day on it than the
 * one printed inside the document whenever this machine is west of UTC — two
 * claims about one report. Reading the server's own name is the only version
 * that cannot disagree; the call below still goes through `lib/api.ts`, so the
 * CSRF header, the single-flight 401 handling and the error normalisation are
 * exactly the ones every other request gets.
 *
 * **Why the preview is loaded lazily.** react-pdf and pdf.js are the largest
 * thing this project ships (the worker alone is over a megabyte), and every
 * reader of the directory would pay for them to display a button most of them
 * never press. The component is imported when the first export succeeds — not
 * when the page mounts, because rendering a `lazy` element is what starts the
 * import.
 */
const REPORT_URL = '/api/v1/reports/user-directory'

/**
 * Rendering a document takes longer than a request that just reads rows, and
 * the renderer runs to completion before the first byte is written — the same
 * reason the file conversion path overrides the client's 30 s default (F052).
 */
const REPORT_TIMEOUT_MS = 60_000

/** Used only if a response arrives without a usable name of its own. */
const FALLBACK_FILENAME = 'user-directory.pdf'

/**
 * The preview, split out of this page's bundle. A `lazy` element starts its
 * import as soon as it is *rendered*, so the dialog below is mounted only after
 * a document exists — see the note above.
 */
const PdfPreviewDialog = lazy(async () => {
  const { PdfPreviewDialog: Dialog } = await import('@/components/common/pdf-preview-dialog')
  return { default: Dialog }
})

interface DirectoryExport {
  blob: Blob
  filename: string
}

export interface UserDirectoryReportActionProps {
  /** The filter state the directory is showing, in the report API's terms. */
  filters: UserDirectoryReportRequest
}

export function UserDirectoryReportAction({ filters }: UserDirectoryReportActionProps) {
  const [open, setOpen] = useState(false)
  const [exported, setExported] = useState<DirectoryExport | null>(null)

  // A failed export needs no handler: the query layer toasts the server's own
  // sentence for every mutation that does not surface errors inline (§9.2's
  // policy), and the 409 that names the row limit arrives as that sentence
  // rather than as a status code — see `unpackBlobErrorBody` in `lib/api.ts`.
  const exportMutation = useMutation({
    mutationFn: async (request: UserDirectoryReportRequest): Promise<DirectoryExport> => {
      const response = await apiClient.request<Blob>({
        method: 'POST',
        url: REPORT_URL,
        data: request,
        responseType: 'blob',
        timeout: REPORT_TIMEOUT_MS,
      })
      return {
        blob: response.data,
        filename:
          filenameFromContentDisposition(response.headers['content-disposition']) ??
          FALLBACK_FILENAME,
      }
    },
    onSuccess: (result) => {
      setExported(result)
      setOpen(true)
    },
  })

  return (
    <>
      <Button
        variant="outline"
        loading={exportMutation.isPending}
        onClick={() => {
          exportMutation.mutate(filters)
        }}
      >
        <FileDownIcon />
        Export PDF
      </Button>
      {exported === null ? null : (
        <Suspense fallback={null}>
          <PdfPreviewDialog
            open={open}
            onOpenChange={setOpen}
            blob={exported.blob}
            filename={exported.filename}
            title="User directory"
            description="The accounts this export selected, as the directory was filtered when you asked for it."
          />
        </Suspense>
      )}
    </>
  )
}
