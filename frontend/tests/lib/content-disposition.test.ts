import { describe, expect, it } from 'vitest'

import { filenameFromContentDisposition } from '@/lib/content-disposition'

/**
 * The header both download endpoints send (F050's `content_disposition`, F053's
 * report) names the file twice: an ASCII `filename="…"` fallback and a
 * percent-encoded `filename*=UTF-8''…`. The reader has to pick the right one,
 * because the file the user gets is named from whatever this returns.
 */
describe('filenameFromContentDisposition', () => {
  it('reads the quoted ASCII form', () => {
    expect(
      filenameFromContentDisposition('attachment; filename="user-directory-2026-10-10.pdf"'),
    ).toBe('user-directory-2026-10-10.pdf')
  })

  it('reads the bare form some servers send', () => {
    expect(filenameFromContentDisposition('attachment; filename=report.pdf')).toBe('report.pdf')
  })

  it('prefers the extended form when both are present', () => {
    // The fallback is the ASCII-approximated one; the extended form is the real
    // name, so a browser that can read it must get that one.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"rapport_2026.pdf\"; filename*=UTF-8''rapport%20%C3%A9quipe.pdf",
      ),
    ).toBe('rapport équipe.pdf')
  })

  it('reads the extended form on its own, quoted or not', () => {
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''a%20b.pdf")).toBe('a b.pdf')
    expect(filenameFromContentDisposition("attachment; filename*=\"UTF-8''a.pdf\"")).toBe('a.pdf')
  })

  it('returns null when the header names nothing', () => {
    expect(filenameFromContentDisposition('attachment')).toBeNull()
    expect(filenameFromContentDisposition('')).toBeNull()
    expect(filenameFromContentDisposition(null)).toBeNull()
    expect(filenameFromContentDisposition(undefined)).toBeNull()
    expect(filenameFromContentDisposition('attachment; filename=""')).toBeNull()
  })

  it('keeps a malformed escape sequence rather than throwing', () => {
    // A stray `%` makes `decodeURIComponent` throw; the raw text is still a
    // better answer than no name, and the caller sanitises it.
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''100%.pdf")).toBe('100%.pdf')
  })
})
