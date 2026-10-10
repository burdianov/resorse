import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/lib/auth'
import { QueryProvider } from '@/components/providers/query-provider'
import { FilePreview } from '@/components/files/file-preview'
import type { FileItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `FilePreview` (F054; C38 deferred this component to the lab, which is its
 * first consumer).
 *
 * The claims this component makes are all about when bytes move:
 *
 * - mounting it moves none — the row shows what the API said about the file and
 *   nothing more, so a list of ten documents costs one request;
 * - a preview moves them once, when the reader asks;
 * - what cannot be drawn is said rather than pretended;
 * - deleting asks first and then goes through the API, and the name a download
 *   saves under is the server's, because the header is the only version that
 *   cannot contradict the bytes.
 */

const ME: MeResponse = {
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  phone: null,
  is_superuser: false,
  must_change_password: false,
  roles: ['admin'],
  permissions: ['files.read', 'files.create'],
}

const DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

const TEXT = 'The first two lines.\nAnd a second one.'

function fileItem(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: '00000000-0000-7000-8000-0000000000ff',
    original_filename: 'notes.txt',
    content_type: 'text/plain',
    size: 2048,
    sha256: DIGEST,
    category: 'lab',
    created_at: '2026-10-10T09:00:00Z',
    ...overrides,
  }
}

const SPREADSHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface Captured {
  contents: number
  deletes: string[]
}

/**
 * What the object-URL stub and the anchor spy recorded, reset per test.
 *
 * The two functions are defined **on** the real `URL` rather than by replacing
 * the global with a copy of it, which is how the export tests do it: this file
 * performs real requests, and array-spreading a class hands back a plain object
 * — `new URL(...)`, which axios and the request handling both reach for, would
 * stop being a constructor.
 */
const urls: {
  created: Blob[]
  revoked: string[]
  clicks: { download: string; href: string }[]
} = { created: [], revoked: [], clicks: [] }

function renderPreview(item: FileItem = fileItem()) {
  const captured: Captured = { contents: 0, deletes: [] }

  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(ME)),
    http.get('/api/v1/files/:id/content', () => {
      captured.contents += 1
      return new HttpResponse(TEXT, {
        headers: {
          'Content-Type': 'text/plain',
          // Deliberately not the row's name: the header is the name that wins,
          // and the test would pass just as well if it were ignored by accident.
          'Content-Disposition': 'attachment; filename="server-name.txt"',
        },
      })
    }),
    http.delete('/api/v1/files/:id', ({ params }) => {
      captured.deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const view = render(
    <QueryProvider client={client}>
      <AuthProvider>
        <FilePreview item={item} />
      </AuthProvider>
    </QueryProvider>,
  )

  return { ...view, captured }
}

beforeEach(() => {
  urls.created.length = 0
  urls.revoked.length = 0
  urls.clicks.length = 0

  // jsdom implements neither of these. The URLs handed out are recorded, so both
  // the download and the release are observable.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      urls.created.push(blob)
      return `blob:file-${urls.created.length}`
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url: string) => {
      urls.revoked.push(url)
    },
  })

  // The download hands the bytes to a detached anchor and clicks it, so the
  // anchor is what there is to observe.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    urls.clicks.push({ download: this.download, href: this.href })
  })
})

afterEach(() => {
  delete (URL as Partial<typeof URL>).createObjectURL
  delete (URL as Partial<typeof URL>).revokeObjectURL
})

describe('FilePreview', () => {
  it('shows what the API recorded about the file, and fetches none of it', () => {
    const { captured } = renderPreview()

    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    // Size, category and the stored time, in the row's own line.
    expect(
      screen.getByText(/^2\.0 KiB · lab · \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
    ).toBeInTheDocument()
    expect(screen.getByText('Text')).toBeInTheDocument()
    // The digest is shown with what it means: it is the server's check on the way
    // out, not a decoration.
    expect(screen.getByText(new RegExp(DIGEST))).toBeInTheDocument()
    expect(screen.getByText(/re-checks the bytes against it/)).toBeInTheDocument()

    // Mounting a row is not reading a file.
    expect(captured.contents).toBe(0)
  })

  it('previews a text file only when the reader asks for it', async () => {
    const { captured } = renderPreview()
    expect(captured.contents).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: /Preview/ }))

    expect(await screen.findByText(/And a second one\./)).toBeInTheDocument()
    expect(captured.contents).toBe(1)
  })

  it('says what it cannot draw instead of drawing nothing', () => {
    const { captured } = renderPreview(
      fileItem({
        original_filename: 'ledger.xlsx',
        content_type: SPREADSHEET,
        size: 40000,
      }),
    )

    expect(screen.getByText(/cannot draw XLSX/)).toBeInTheDocument()
    expect(screen.getByText('XLSX')).toBeInTheDocument()
    // Download still works — the file is not less real for being unrenderable.
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Download/ })).toBeInTheDocument()
    expect(captured.contents).toBe(0)
  })

  it('asks before deleting, then deletes the file it was given', async () => {
    const { captured } = renderPreview()

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Delete this file?')
    // Nothing has happened yet — that is the entire point of the dialog.
    expect(captured.deletes).toEqual([])

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(captured.deletes).toEqual(['00000000-0000-7000-8000-0000000000ff'])
    })
    // The dialog closes when the work settles, not when it is confirmed.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('downloads under the server’s name and gives the object URL back', async () => {
    renderPreview()

    await userEvent.click(screen.getByRole('button', { name: /Download/ }))

    await waitFor(() => {
      expect(urls.clicks).toHaveLength(1)
    })
    // The header's name, not the row's `notes.txt`.
    expect(urls.clicks[0]?.download).toBe('server-name.txt')
    expect(urls.created).toHaveLength(1)
    // A blob URL holds the whole file in memory until it is released.
    expect(urls.revoked).toEqual(['blob:file-1'])
  })
})
