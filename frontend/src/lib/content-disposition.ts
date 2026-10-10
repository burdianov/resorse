/**
 * The file name a response asked to be saved under (RFC 6266 / RFC 5987).
 *
 * A download's name is the server's decision, and the API states it in
 * `Content-Disposition`: `files.py`'s `content_disposition` writes an ASCII
 * `filename="…"` fallback beside a percent-encoded `filename*="UTF-8''…"` (F050),
 * and the report endpoint sends the same header for the document it just built
 * (F053). Reading it back is what keeps that name in **one** place. A client
 * that rebuilt it from its own clock would name the file with a different day
 * than the one printed inside the document whenever the browser sits west of
 * UTC — two claims about the same report, agreeing only by luck of the hour.
 *
 * `filename*` is preferred when both forms are present: it is the one carrying
 * the real characters, and the quoted fallback exists only for clients that
 * cannot read the extended form. Both are searched across the whole header, so
 * the order the server wrote them in does not matter.
 *
 * Returns `null` when the header is absent or names nothing — the caller picks
 * the fallback, because only the caller knows what the download was. The value
 * is deliberately **not** sanitised here: it is still a header value from the
 * network, and it goes through `sanitizeFilename` before it reaches a file
 * system.
 */

const EXTENDED = /filename\*\s*=\s*([^;]+)/i
/** Either the quoted form or the bare one; `filename*=` cannot match the bare
 *  alternative because the `=` has to follow the name directly. */
const SIMPLE = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]*)/i

export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null

  const extended = EXTENDED.exec(header)
  if (extended) {
    const value = decodeExtended(extended[1] ?? '').trim()
    if (value !== '') return value
  }

  const simple = SIMPLE.exec(header)
  const value = (simple?.[1] ?? simple?.[2] ?? '').trim()
  return value === '' ? null : value
}

/** `UTF-8''user%2Ddirectory.pdf` → `user-directory.pdf`.
 *
 *  The extended form is unquoted in the RFC, but servers quote it too; a
 *  surrounding pair of quotes is stripped so either shape names the same file. */
function decodeExtended(raw: string): string {
  const value = raw.trim().replace(/^"|"$/g, '')
  const separator = value.indexOf("''")
  const encoded = separator === -1 ? value : value.slice(separator + 2)
  try {
    return decodeURIComponent(encoded)
  } catch {
    // A malformed escape sequence is not worth a throw: the raw text is still a
    // closer answer than no name at all, and the caller sanitises it anyway.
    return encoded
  }
}
