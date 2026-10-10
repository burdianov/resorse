import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { UploadCloudIcon } from 'lucide-react'

import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { useUploadFile } from '@/components/files/use-files'
import type { FileItem } from '@/lib/generated/api'
import { formatBytes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'

/**
 * Store a file in the private volume (F054; C38 deferred this component to the
 * lab, which is its first consumer).
 *
 * Everything the user can do here goes through F050's API and nothing is
 * simulated: a dropped file is a real upload, the row it creates is a real row,
 * and the bytes land in the volume F049 owns. The lab says so on the page,
 * because a demonstration that wrote nothing would be exactly the kind of
 * showcase that lies.
 *
 * **Three decisions are deliberate.**
 *
 * - **The size pre-flight is a courtesy, and the server is still the
 *   authority.** `MAX_UPLOAD_BYTES` mirrors the backend's shipped default
 *   (`STORAGE_MAX_UPLOAD_BYTES`, 10 MiB) so that a 50 MiB file is refused
 *   before it is pushed over the wire — the same reasoning the API applies when
 *   it reads an upload one byte past its cap. A deployment that raises the cap
 *   stores what this component would have stopped, so the mirror is documented
 *   as a *default* and never as the rule; the server's own refusal (a 422 whose
 *   message the query layer toasts) is what a user actually sees when the two
 *   disagree.
 * - **A refusal we make ourselves is shown here, inline, and a server refusal
 *   is not.** A local pre-flight never becomes a request, so it has no other
 *   home; a failed request has one already — `QueryProvider` toasts the
 *   server's own sentence for every failed mutation, and repeating it under the
 *   dropzone would say the same thing twice.
 * - **The type is not filtered locally.** The browser's `accept` list is a
 *   *hint* to the file picker and nothing more; what the bytes are is decided by
 *   the server from their magic bytes (F049), and a client that pre-empted that
 *   check would be enforcing a rule it cannot actually evaluate.
 */

/**
 * The backend's shipped default cap. See the module note: this is a mirror of a
 * *default*, kept so an obviously-too-big file is not uploaded to be refused.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Extensions for the picker's hint, mirroring the API's default allowlist. */
const ACCEPTED = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.csv,.txt'

export interface FileDropzoneProps {
  /** The API's `category` form field: a slug like `templates`. */
  category: string
  /** Set while the caller's own permission or mutation state forbids uploading. */
  disabled?: boolean
  /** Called once the server has stored the file. */
  onUploaded?: (item: FileItem) => void
  className?: string
}

export function FileDropzone({
  category,
  disabled = false,
  onUploaded,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const upload = useUploadFile()

  function refuse(message: string): void {
    setRejection(message)
  }

  function send(file: File): void {
    setRejection(null)
    setPercent(0)
    upload.mutate(
      { file, category, onProgress: setPercent },
      {
        onSuccess: (item) => {
          onUploaded?.(item)
        },
        // Cleared either way: a stuck bar on a failed upload reads as progress
        // that is still happening.
        onSettled: () => {
          setPercent(null)
          if (inputRef.current) inputRef.current.value = ''
        },
      },
    )
  }

  /** The one check this component makes on its own (see the module note). */
  function accept(file: File): void {
    if (file.size === 0) {
      refuse('That file is empty, so there are no bytes to store.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      refuse(
        `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      )
      return
    }
    send(file)
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragging(false)
    if (disabled || upload.isPending) return
    const dropped = event.dataTransfer.files
    if (dropped.length === 0) {
      refuse('Nothing arrived in that drop. Try dragging a file from your file browser.')
      return
    }
    // One file per request is what the API takes; a multi-file drop is a user
    // expecting something this endpoint does not do, so it says so rather than
    // uploading one and silently dropping the rest.
    if (dropped.length > 1) {
      refuse('Drop one file at a time — each upload is one request.')
      return
    }
    const file = dropped[0]
    if (file) accept(file)
  }

  const busy = upload.isPending

  return (
    <div className={cn('space-y-3', className)}>
      <div
        data-slot="file-dropzone"
        data-dragging={dragging ? '' : undefined}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !busy) setDragging(true)
        }}
        onDragLeave={() => {
          setDragging(false)
        }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          disabled && 'opacity-60',
        )}
      >
        <UploadCloudIcon aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {busy ? 'Uploading…' : 'Drop a file here'}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          One file per upload, up to {formatBytes(MAX_UPLOAD_BYTES)}. The server decides what
          the bytes are; a type it will not store comes back as its own refusal.
        </p>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            inputRef.current?.click()
          }}
          className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            if (chosen) accept(chosen)
          }}
        />
      </div>

      {rejection === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {rejection}
        </p>
      )}

      {/* The shipped composition: `Progress` renders the track and indicator
          itself, so the children here are only the parts that carry meaning — a
          name for the bar and the number it is at. */}
      {percent === null ? null : (
        <Progress value={percent}>
          <ProgressLabel>Uploading</ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
    </div>
  )
}
