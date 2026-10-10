import { sanitizeFilename } from '@/lib/csv'

/**
 * Hand bytes to the browser as a file (F054's file preview and download).
 *
 * The mirror of `downloadTextFile` for content this application did not
 * *compose*: `csv.ts` builds a string in the page, whereas a stored file's bytes
 * arrive as a `Blob` from the API and must be passed through untouched —
 * decoding and re-encoding a document on its way out would be a way to corrupt
 * it, and it is also why the type comes from the server's own header rather
 * than from a guess.
 *
 * The object URL is revoked in the same turn, for the same reason
 * `downloadTextFile` does it: "error cleanup" in §7.9d is exactly this — a
 * leaked blob URL holds the whole file in memory for the life of the page. The
 * `finally` matters because the click path can throw: the download already has
 * its own copy of the bytes by then.
 */
export function downloadBlob({ blob, filename }: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = sanitizeFilename(filename)
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
