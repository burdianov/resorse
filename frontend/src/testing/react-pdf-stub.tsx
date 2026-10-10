import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * A stand-in for `react-pdf` in component tests (F053).
 *
 * The real library needs a canvas, a worker and a font parser — none of which
 * jsdom has, so a test that mounted it would fail on the environment rather than
 * on the component. This replacement keeps the parts our code actually talks to:
 * `Document` reports a page count once it has "loaded", renders `error` instead
 * of its children when it cannot, and `Page` states which page it was asked for
 * so navigation is observable.
 *
 * `pdfStub` is the control: a test sets `numPages` or `fail` before rendering.
 * It is module state, so `setup.ts`-style resets are not automatic — any test
 * that changes it must put it back (see `afterEach` in the dialog's tests).
 */
export const pdfStub = {
  /** Pages the document will report. */
  numPages: 3,
  /** Load the document, or fail the way a browser without canvas would. */
  fail: false,
  reset(): void {
    pdfStub.numPages = 3
    pdfStub.fail = false
  },
}

export function Document({
  children,
  error,
  onLoadSuccess,
}: {
  children?: ReactNode
  loading?: ReactNode
  error?: ReactNode
  onLoadSuccess?: (document: { numPages: number }) => void
}) {
  // Once per mount, like the real library's one load per file.
  useEffect(() => {
    if (!pdfStub.fail) onLoadSuccess?.({ numPages: pdfStub.numPages })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stub loads once
  }, [])

  if (pdfStub.fail) return <>{error ?? null}</>
  return <>{children ?? null}</>
}

export function Page({ pageNumber }: { pageNumber: number }) {
  return <div data-testid="pdf-page">Page {pageNumber}</div>
}

export const reactPdf = {
  Document,
  Page,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}
