import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from '@/lib/auth'
import { QueryProvider } from '@/components/providers/query-provider'
import { FileDropzone, MAX_UPLOAD_BYTES } from '@/components/files/file-dropzone'
import type { FileItem, MeResponse } from '@/lib/generated/api'
import { server } from '@/testing/msw-server'

/**
 * `FileDropzone` (F054; C38 deferred it to the lab, which is its first consumer).
 *
 * The tests are all about what reaches the wire and what does not. A refusal this
 * component makes on its own must never become a request — that is the whole
 * point of pre-flighting it — and an upload must carry the two fields the API
 * requires and nothing else, because the multipart body is the one request in
 * this application whose shape the browser assembles.
 */

const ME: MeResponse = {
  created_at: '2026-01-02T03:04:05Z',
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  phone: null,
  is_superuser: false,
  must_change_password: false,
  roles: ['admin'],
  permissions: ['files.read', 'files.create'],
}

function fileItem(name: string): FileItem {
  return {
    id: '00000000-0000-7000-8000-0000000000ff',
    original_filename: name,
    content_type: 'text/plain',
    size: 12,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    category: 'lab',
    created_at: '2026-10-10T09:00:00Z',
  }
}

interface Captured {
  uploads: number
  /** The raw multipart body, as it went over the wire. See `renderDropzone`. */
  body: string | null
}

/**
 * Renders the dropzone with the session and query layer it really runs inside.
 *
 * The upload handler reads the request body as **text** rather than parsing it
 * with `request.formData()`. In this environment the `File` in that body is
 * jsdom's, and undici's multipart parser asserts that every part is either a
 * string or a `File` of its own — asking it to parse one throws inside the
 * handler. The raw body is also the more honest thing to assert on: the whole
 * claim under test is that the multipart the browser assembled carries the two
 * fields the API reads.
 */
function renderDropzone() {
  const captured: Captured = { uploads: 0, body: null }

  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json(ME)),
    http.post('/api/v1/files', async ({ request }) => {
      captured.uploads += 1
      captured.body = await request.text()
      return HttpResponse.json(fileItem('stored.txt'), { status: 201 })
    }),
    // A successful upload invalidates the account's file root, which is a real
    // refetch; leaving it unhandled would fail the test for the wrong reason.
    http.get('/api/v1/files', () =>
      HttpResponse.json({ items: [], total: 0, page: 1, page_size: 25 }),
    ),
  )

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const view = render(
    <QueryProvider client={client}>
      <AuthProvider>
        <FileDropzone category="lab" />
      </AuthProvider>
    </QueryProvider>,
  )

  const input = view.container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('The dropzone has no file input')

  return { ...view, captured, input }
}

/** jsdom builds a File from its parts; only its size is under test here. */
function sizedFile(name: string, size: number, type = 'text/plain'): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('FileDropzone', () => {
  it('uploads the chosen file with the category the caller named', async () => {
    const { captured, input } = renderDropzone()

    await userEvent.upload(input, sizedFile('notes.txt', 1024))

    await waitFor(() => {
      expect(captured.uploads).toBe(1)
    })
    // The name travels in the file part; the category is its own field. Both are
    // what the API reads, and neither is optional.
    expect(captured.body).toMatch(/filename="notes\.txt"/)
    expect(captured.body).toMatch(/name="category"[\s\S]{0,20}lab/)
  })

  it('refuses a file past the server’s cap without sending a byte', async () => {
    const { captured, input } = renderDropzone()

    await userEvent.upload(input, sizedFile('huge.pdf', MAX_UPLOAD_BYTES + 1, 'application/pdf'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('10.0 MiB')
    // The point of the pre-flight: nothing reached the wire.
    expect(captured.uploads).toBe(0)
  })

  it('refuses a file with no bytes in it', async () => {
    const { captured, input } = renderDropzone()

    await userEvent.upload(input, sizedFile('empty.txt', 0))

    expect(await screen.findByRole('alert')).toHaveTextContent('empty')
    expect(captured.uploads).toBe(0)
  })

  it('refuses a drop of several files rather than storing one and dropping the rest', async () => {
    const { captured, container } = renderDropzone()

    const zone = container.querySelector('[data-slot="file-dropzone"]')
    if (!(zone instanceof HTMLElement)) throw new Error('The dropzone has no drop target')

    fireEvent.drop(zone, {
      dataTransfer: { files: [sizedFile('a.txt', 10), sizedFile('b.txt', 10)] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('one file at a time')
    expect(captured.uploads).toBe(0)
  })

  it('uploads a file that was dropped on it, not just one that was picked', async () => {
    const { captured, container } = renderDropzone()

    const zone = container.querySelector('[data-slot="file-dropzone"]')
    if (!(zone instanceof HTMLElement)) throw new Error('The dropzone has no drop target')

    fireEvent.drop(zone, { dataTransfer: { files: [sizedFile('dropped.txt', 512)] } })

    await waitFor(() => {
      expect(captured.uploads).toBe(1)
    })
    expect(captured.body).toMatch(/filename="dropped\.txt"/)
    expect(captured.body).toMatch(/name="category"[\s\S]{0,20}lab/)
  })
})
