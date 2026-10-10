import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, FileWarningIcon } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { sanitizeFilename } from '@/lib/csv'

// react-pdf draws on canvas and runs pdf.js in a worker, so the worker's URL
// has to be named before the first document is opened. It must be set *in this
// module*: the library assigns its own default while its module is evaluated, so
// a setting made in a file that happened to run earlier is silently
// overwritten — the README says as much, and this is the module that renders
// the components.
//
// `pdfjs-dist` is a direct dependency (pinned in package.json, matching the
// version react-pdf depends on) rather than a transitive one: pnpm's strict
// node_modules would otherwise hide the worker file from a bare-specifier
// resolution like this one.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// The text and annotation layers are positioned over the canvas react-pdf
// draws. Without their stylesheets a page's selectable text sits at the
// browser's defaults and drifts off the glyphs it is supposed to cover.
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

/**
 * The page width, in CSS pixels. The document area scrolls rather than the
 * dialog growing past the viewport, so a landscape page is legible on a desktop
 * and a phone never scrolls sideways to dismiss the dialog.
 */
const PAGE_WIDTH = 640

export interface PdfPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The document to show. Null until something has been generated. */
  blob: Blob | null
  /**
   * What the download is offered as — the name the server sent for it
   * (`filenameFromContentDisposition`). Sanitised here before it reaches the
   * browser.
   */
  filename: string
  title?: ReactNode
  description?: ReactNode
}

/**
 * Show a generated PDF before it is downloaded (F053, BIG-PROMPT §7.9c).
 *
 * The dialog is the second half of the export: the server renders the document
 * and this lets the reader check it is the one they meant before it lands in
 * their downloads folder. Three properties are deliberate.
 *
 * - **The preview is never a gate.** The download is a plain anchor on the same
 *   object URL, outside the rendering path entirely, so a browser where pdf.js
 *   cannot start (no worker, no canvas) still gets the file — with the note in
 *   the page area saying which of the two happened.
 * - **The object URL is created while the dialog is open and revoked on the way
 *   out.** An object URL is a reference the browser will not collect on its
 *   own: a leaked one pins the whole document in memory for the life of the
 *   tab, which is the "error cleanup" §7.9d asks for and the rule
 *   `downloadTextFile` already follows.
 * - **The pages are counted by the document, not assumed.** The navigation
 *   appears only once the loaded document has said how many pages it has, so
 *   the control cannot offer a page that is not there.
 */
export function PdfPreviewDialog({
  open,
  onOpenChange,
  blob,
  filename,
  title = 'Preview',
  description,
}: PdfPreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState<number | null>(null)

  // One object URL per open dialog, revoked when it closes, when the document
  // is replaced or when the component goes away: an object URL is a reference
  // the browser will not collect, so a leaked one holds this whole document in
  // memory for the life of the tab — the "error cleanup" §7.9d asks for, and
  // the rule `downloadTextFile` already follows. Revoking it cannot interrupt a
  // download the reader started: the browser takes its own copy at the click.
  useEffect(() => {
    if (!open || blob === null) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [open, blob])

  // A document opens on its own first page, with the previous document's page
  // count gone rather than briefly wrong.
  useEffect(() => {
    setPageNumber(1)
    setPageCount(null)
  }, [url])

  const downloadName = sanitizeFilename(filename, 'report.pdf')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-slot="pdf-preview-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/20 p-2">
          {url === null ? null : (
            <Document
              file={url}
              className="flex justify-center"
              loading={<PreviewLoading />}
              error={<PreviewUnavailable />}
              onLoadSuccess={({ numPages }) => {
                setPageCount(numPages)
              }}
            >
              <Page pageNumber={pageNumber} width={PAGE_WIDTH} className="shadow-sm" />
            </Document>
          )}
        </div>

        {pageCount !== null && pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={pageNumber <= 1}
              onClick={() => {
                setPageNumber((current) => Math.max(1, current - 1))
              }}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageNumber} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={pageNumber >= pageCount}
              onClick={() => {
                setPageNumber((current) => Math.min(pageCount, current + 1))
              }}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          {/* "Done", not "Close": the overlay's own dismiss button is already
              named "Close" for screen readers, and two controls with one name
              is how a voice-control user ends up unable to say which. */}
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Done
          </Button>
          <a
            className={buttonVariants({ variant: 'outline' })}
            href={url ?? undefined}
            download={downloadName}
          >
            <DownloadIcon />
            Download
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewLoading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  )
}

/**
 * The document could not be drawn. The bytes are still in hand and the download
 * is still there, so the note points at it instead of leaving an empty box that
 * looks like a report with nothing in it.
 */
function PreviewUnavailable() {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <FileWarningIcon className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        This preview cannot be shown in this browser. The PDF was produced — download it to
        open it.
      </p>
    </div>
  )
}
