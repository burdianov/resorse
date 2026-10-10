import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PdfPreviewDialog } from '@/components/common/pdf-preview-dialog'
import { pdfStub } from '@/testing/react-pdf-stub'

// jsdom has no canvas and no worker, so the real renderer cannot run; what this
// file is about is the dialog around it — the object URL's lifetime, the page
// navigation, and the download.
vi.mock('react-pdf', async () => (await import('@/testing/react-pdf-stub')).reactPdf)

const PDF_BLOB = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
const SECOND_BLOB = new Blob(['%PDF-1.7 second'], { type: 'application/pdf' })

let created: Blob[]
let revoked: string[]

beforeEach(() => {
  created = []
  revoked = []
  // Same shape as the CSV download test's stub: `createObjectURL` is absent in
  // jsdom, and the URLs it hands out are recorded so the revocation is
  // observable.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      created.push(blob)
      return `blob:preview-${created.length}`
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url)
    },
  })
})

afterEach(() => {
  pdfStub.reset()
  vi.unstubAllGlobals()
})

/** The dialog as pages use it: controlled, and closable. */
function Preview({
  blob = PDF_BLOB,
  filename = 'user-directory-2026-10-10.pdf',
}: {
  blob?: Blob | null
  filename?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <PdfPreviewDialog
      open={open}
      onOpenChange={setOpen}
      blob={blob}
      filename={filename}
      title="User directory"
      description="The accounts this export selected."
    />
  )
}

describe('PdfPreviewDialog', () => {
  it('draws the first page and counts the pages the document reports', async () => {
    pdfStub.numPages = 3
    render(<Preview />)

    expect(await screen.findByTestId('pdf-page')).toHaveTextContent('Page 1')
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('User directory')
  })

  it('walks the pages and stops at both ends', async () => {
    pdfStub.numPages = 3
    render(<Preview />)

    const next = await screen.findByRole('button', { name: 'Next page' })
    const previous = screen.getByRole('button', { name: 'Previous page' })
    // The ends are the document's, not a fixed count.
    expect(previous).toBeDisabled()

    await userEvent.click(next)
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('Page 2')

    await userEvent.click(next)
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('Page 3')
    expect(next).toBeDisabled()

    await userEvent.click(previous)
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('Page 2')
  })

  it('hides the navigation for a single-page document', async () => {
    pdfStub.numPages = 1
    render(<Preview />)

    expect(await screen.findByTestId('pdf-page')).toHaveTextContent('Page 1')
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
  })

  it('offers the download under the name the server sent, sanitised', async () => {
    render(<Preview filename={'../exports/../user-directory-2026-10-10.pdf'} />)
    await screen.findByTestId('pdf-page')

    const download = screen.getByRole('link', { name: /Download/ })

    // The name is a path-free file name by the time the browser sees it.
    expect(download).toHaveAttribute('download', 'user-directory-2026-10-10.pdf')
    // …and it is the same object URL the preview is drawing from.
    expect(download).toHaveAttribute('href', 'blob:preview-1')
  })

  it('creates one object URL per document and revokes it on the way out', async () => {
    const { rerender, unmount } = render(<Preview />)
    await screen.findByTestId('pdf-page')
    expect(created).toEqual([PDF_BLOB])

    rerender(<Preview blob={SECOND_BLOB} />)

    // The replaced document's URL is gone the moment it is replaced, and a new
    // document starts at its own first page.
    expect(revoked).toEqual(['blob:preview-1'])
    expect(created).toEqual([PDF_BLOB, SECOND_BLOB])
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('Page 1')

    unmount()
    expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
  })
  it('says so when the preview cannot be drawn, and keeps the download', async () => {
    // A browser where pdf.js cannot start must still be able to take the file.
    pdfStub.fail = true
    render(<Preview />)

    expect(await screen.findByRole('alert')).toHaveTextContent('download it to open it')
    expect(screen.getByRole('link', { name: /Download/ })).toHaveAttribute(
      'download',
      'user-directory-2026-10-10.pdf',
    )
    // No page furniture for a page that was never drawn.
    expect(screen.queryByTestId('pdf-page')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
  })

  it('closes on Done, releasing the document it was drawing', async () => {
    render(<Preview />)
    await screen.findByTestId('pdf-page')
    expect(revoked).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    // Nothing is holding the document once the reader is done with it.
    expect(revoked).toEqual(['blob:preview-1'])
  })
})
