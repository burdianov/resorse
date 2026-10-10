import { FilesIcon, RefreshCwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { LoadingState } from '@/components/common/loading-state'
import { PermissionGate } from '@/components/common/permission-gate'
import { FileDropzone } from '@/components/files/file-dropzone'
import { FilePreview } from '@/components/files/file-preview'
import { useFiles } from '@/components/files/use-files'
import { toApiError } from '@/lib/errors'
import { LabCase, LabSection } from '@/pages/tools/lab-section'

/**
 * The file store, driven from the lab (F054).
 *
 * **Nothing here is a sample.** Every other section of the lab writes its values
 * in the source; this one talks to the API — an upload stores a real object in
 * the volume F049 owns, and deleting removes it. It is the one place in the lab
 * where a demonstration could destroy something, which is why the delete path
 * is the confirmation dialog in `FilePreview` and not a button that acts on a
 * click.
 *
 * The category is `lab`. It is not decoration: the API requires one on every
 * upload, and naming it after the page that sends it is what keeps a file
 * uploaded from here from being mistaken later for one the application stored.
 */

/** The API's `category` for anything the lab uploads. `[a-z][a-z0-9_.-]*`. */
const LAB_CATEGORY = 'lab'

/** The list of this account's files, as the API returns it. */
function FileList() {
  const files = useFiles()

  if (files.isPending) {
    return <LoadingState label="Loading your files…" />
  }

  if (files.isError) {
    // `variant` is chosen from the failure, not passed through: `ErrorState`
    // renders only strings the caller wrote, so the error object stops here.
    return (
      <ErrorState
        variant={toApiError(files.error).isNetworkError ? 'offline' : 'error'}
        onRetry={() => {
          void files.refetch()
        }}
      />
    )
  }

  const items = files.data.items

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FilesIcon}
        title="No files yet"
        description="Upload one above and it appears here — with the digest the server recorded for it."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} of {files.data.total}
        </p>
        <Button
          variant="ghost"
          size="sm"
          loading={files.isFetching}
          onClick={() => {
            void files.refetch()
          }}
        >
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <FilePreview item={item} className="h-full" />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FileLabSection() {
  return (
    <LabSection
      title="Files"
      description="The store behind the API, not a mock of it: an upload here writes a real object, and the delete button really deletes."
    >
      <PermissionGate
        permissions={['files.create']}
        fallback={
          <p className="text-sm text-muted-foreground">
            Uploading needs <code className="font-mono">files.create</code>, which this account
            does not have. The dropzone is hidden rather than shown disabled — the API would
            refuse the request, and offering a control that cannot work is worse than not
            offering it.
          </p>
        }
      >
        <LabCase
          title="FileDropzone"
          note="Drag a file onto the box, or use the button. The size check here mirrors the server's shipped 10 MiB default; whatever the server decides is still what counts."
        >
          <div className="w-full max-w-md">
            <FileDropzone category={LAB_CATEGORY} />
          </div>
        </LabCase>
      </PermissionGate>

      <PermissionGate
        permissions={['files.read']}
        fallback={
          <p className="text-sm text-muted-foreground">
            Listing needs <code className="font-mono">files.read</code>, which this account does
            not have.
          </p>
        }
      >
        <LabCase
          title="FilePreview"
          note="Newest first, one card per file. Preview fetches the bytes; Download saves them under the name the server sent."
        >
          <div className="w-full">
            <FileList />
          </div>
        </LabCase>
      </PermissionGate>
    </LabSection>
  )
}
