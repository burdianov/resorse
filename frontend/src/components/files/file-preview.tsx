import { Suspense, lazy, useEffect, useState } from 'react'
import { DownloadIcon, EyeIcon, FileQuestionIcon, Trash2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useDeleteFile, useDownloadFile } from '@/components/files/use-files'
import type { FileItem } from '@/lib/generated/api'
import { downloadBlob } from '@/lib/download'
import { formatBytes } from '@/lib/format-bytes'
import { formatDate } from '@/lib/format-date'

/**
 * One stored file, shown (F054; C38 deferred this component to the lab).
 *
 * The row's metadata is whatever the API returned for it — name, size, the
 * **sniffed** content type, category, upload time and the digest the server
 * recorded. Nothing here re-derives any of it, and nothing here invents a file:
 * mounting this component does not fetch bytes, and a file that has never been
 * previewed has no preview.
 *
 * **Three decisions are deliberate.**
 *
 * - **Bytes are fetched when the reader asks, and only then.** A preview is not
 *   a state of the page but an action on one row, so it is a mutation rather
 *   than a query (see `use-files.ts`). A list of ten PDFs costs one request, not
 *   ten documents.
 * - **What can be previewed is decided by what the browser can actually draw.**
 *   A PDF goes to the same lazily-imported dialog the report export uses, so the
 *   worker setting and the stylesheets stay in one module; an image is drawn
 *   from an object URL; text is shown as text. A docx or an xlsx gets the
 *   metadata and the download button and a sentence saying so — a "preview"
 *   panel that rendered nothing would be worse than none.
 * - **Deleting is behind the confirmation dialog and the dialog owns the
 *   outcome.** The row disappears when the server stops returning it, not
 *   before: the mutation invalidates the list, and the list is the server's
 *   answer.
 */

/** The types this component can draw, and nothing else. */
type PreviewKind = 'pdf' | 'image' | 'text'

function previewKind(contentType: string): PreviewKind | null {
  const type = contentType.toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  if (type === 'text/plain' || type === 'text/csv') return 'text'
  return null
}

/**
 * How much of a text file the panel shows. The whole thing is still in the
 * download; this is a look at the beginning, and it says so, because a panel
 * that silently stopped at 4 000 characters would make a longer file look
 * shorter than it is.
 */
const TEXT_PREVIEW_CHARS = 4000

/**
 * The same lazily-imported dialog the export uses. It is imported when a preview
 * is first opened rather than when this module loads: react-pdf and pdf.js are
 * the largest thing this project ships, and a file list that has no PDF in it
 * should never pay for them.
 */
const PdfPreviewDialog = lazy(async () => {
  const { PdfPreviewDialog: Dialog } = await import('@/components/common/pdf-preview-dialog')
  return { default: Dialog }
})

/** How a type is named in the badge. Short, because it sits beside a file name. */
function typeLabel(contentType: string): string {
  const type = contentType.toLowerCase()
  const known: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'text/plain': 'Text',
    'text/csv': 'CSV',
  }
  if (known[type]) return known[type]
  if (type.includes('wordprocessingml')) return 'DOCX'
  if (type.includes('spreadsheetml')) return 'XLSX'
  return contentType
}

export interface FilePreviewProps {
  item: FileItem
  /** Stops the actions while the surrounding list is, say, refetching. */
  disabled?: boolean
  className?: string
}

export function FilePreview({ item, disabled = false, className }: FilePreviewProps) {
  const kind = previewKind(item.content_type)

  const [open, setOpen] = useState(false)
  const [pdf, setPdf] = useState<{ blob: Blob; filename: string } | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const fetchBytes = useDownloadFile()
  const remove = useDeleteFile()

  // An object URL is a reference the browser will not collect, so the image's
  // is revoked when it is replaced, cleared or unmounted — the "error cleanup"
  // of §7.9d, and the rule `downloadBlob` and the preview dialog follow.
  useEffect(() => {
    if (imageUrl === null) return
    return () => {
      URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  function preview(): void {
    fetchBytes.mutate(item, {
      onSuccess: (result) => {
        if (kind === 'pdf') {
          setPdf(result)
          setOpen(true)
        } else if (kind === 'image') {
          setImageUrl(URL.createObjectURL(result.blob))
        } else if (kind === 'text') {
          // `text()` decodes UTF-8 and replaces anything else; the server only
          // reports this family for bytes that are valid UTF-8 with no NUL, so
          // there is nothing here that would decode to mojibake.
          void result.blob.text().then(setText)
        }
      },
    })
  }

  const busy = disabled || fetchBytes.isPending

  return (
    <Card data-slot="file-preview" className={className}>
      <CardHeader>
        <CardTitle className="min-w-0 break-all">{item.original_filename}</CardTitle>
        <CardAction>
          <Badge variant="secondary">{typeLabel(item.content_type)}</Badge>
        </CardAction>
        <CardDescription>
          {formatBytes(item.size)} · {item.category} ·{' '}
          {formatDate(item.created_at, 'dd.MM.yyyy HH:mm')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {kind === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileQuestionIcon aria-hidden className="size-4 shrink-0" />
            This browser cannot draw {typeLabel(item.content_type)}. Download it to open it.
          </p>
        ) : null}

        {imageUrl === null ? null : (
          <img
            src={imageUrl}
            alt={`Preview of ${item.original_filename}`}
            className="max-h-64 w-auto rounded-md border bg-muted/20"
          />
        )}

        {text === null ? null : (
          <div className="space-y-1">
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/20 p-3 text-xs whitespace-pre-wrap">
              {text.slice(0, TEXT_PREVIEW_CHARS)}
            </pre>
            {text.length > TEXT_PREVIEW_CHARS ? (
              <p className="text-xs text-muted-foreground">
                Showing the first {TEXT_PREVIEW_CHARS.toLocaleString()} characters.
              </p>
            ) : null}
          </div>
        )}

        <p className="font-mono text-xs break-all text-muted-foreground">
          sha256 {item.sha256} — recorded when it was stored; the server re-checks the bytes against
          it on the way out.
        </p>

        <div className="flex flex-wrap gap-2">
          {kind === null ? null : (
            <Button
              variant="outline"
              size="sm"
              loading={fetchBytes.isPending}
              disabled={busy}
              onClick={preview}
            >
              <EyeIcon />
              Preview
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            loading={fetchBytes.isPending && kind === null}
            disabled={busy}
            onClick={() => {
              fetchBytes.mutate(item, {
                onSuccess: (result) => {
                  downloadBlob(result)
                },
              })
            }}
          >
            <DownloadIcon />
            Download
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setConfirmOpen(true)
            }}
          >
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </CardContent>

      {kind === 'pdf' && pdf !== null ? (
        <Suspense fallback={null}>
          <PdfPreviewDialog
            open={open}
            onOpenChange={setOpen}
            blob={pdf.blob}
            filename={pdf.filename}
            title={item.original_filename}
            description="The file as it was stored. Downloading it is what saves a copy."
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this file?"
        description={`${item.original_filename} will be removed from your files. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        closeOnConfirm={false}
        onConfirm={() => {
          remove.mutate(item, {
            onSettled: () => {
              setConfirmOpen(false)
            },
          })
        }}
      />
    </Card>
  )
}
