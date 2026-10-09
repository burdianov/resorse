import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { ErrorState } from '@/components/common/error-state'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputField, SelectField } from '@/components/form/fields'
import { Form, FormError } from '@/components/form/form'
import { FormActions } from '@/components/form/form-actions'
import { applyServerErrors } from '@/components/form/form-errors'
import { useAccess } from '@/components/providers/access-provider'
import { meetsAccess } from '@/config/access'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import type { GetSettingsEndpointApiV1AdminSettingsGetResponse } from '@/lib/generated/api'

/**
 * `/admin/settings` — the application settings editor (F040, BP-7.5).
 *
 * **Card sections, one form, one atomic save.** The page renders the
 * registry's keys as two cards — Branding (name, description) and Display
 * (date format, timezone) — but a single `<form>` spans them, because the
 * API's write is a single bare-map `PUT` (F039/C28): per-card save buttons
 * would be per-section requests against a whole-map contract, and a
 * half-saved page is exactly what the atomic write exists to prevent.
 *
 * **Field names ARE the registry keys** (`branding.app_name`,
 * `display.date_format`, …). That is not cosmetic: the server's refusals
 * address as `loc ["body", "<key>"]`, the F018 normaliser turns those into
 * dotted field paths, and `applyServerErrors` maps them onto the inputs
 * because the input names match — no translation table anywhere.
 *
 * Deliberately built on the F039 read/write pair with three honest shapes:
 *
 * - **The form seeds from the server's snapshot** (defaults included), so a
 *   fresh deployment shows the real effective values rather than blanks; a
 *   successful save re-seeds from the response snapshot (the API returns it
 *   precisely so no follow-up GET is needed).
 * - **The timezone input suggests real zones** through `Intl.supportedValuesOf`
 *   — the browser's own list, not a hand-kept one — while the server remains
 *   the validator (an IANA name it accepts is the only one that sticks).
 * - **Consumption is deferred on purpose** (C29): the shell still reads
 *   `config/branding.ts`, and no screen consumes `display.date_format` yet —
 *   F047/F048 will design that read surface together with its first real
 *   consumer, instead of this page inventing one early.
 */

const DATE_FORMATS = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'] as const

/**
 * The form's shape is the registry's keys **resolved as nested paths**, and
 * that is not a stylistic choice: React Hook Form reads a dotted field name
 * as a path (`branding.app_name` → `branding.app_name` on a nested object),
 * while `form.reset` stores its argument verbatim. A flat schema would
 * therefore validate the seeded values and ignore every typed one — the
 * exact trap this shape avoids. The wire stays flat: `toRegistryPayload`
 * rebuilds the registry keys at submit, and the server's field-addressed
 * 422s (`loc ["body","branding.app_name"]` → field path `branding.app_name`)
 * land on these same nested paths through `applyServerErrors`, untouched.
 */
const settingsSchema = z.object({
  branding: z.object({
    app_name: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters.')
      .max(64, 'Use at most 64 characters.'),
    app_description: z.string().max(200, 'Use at most 200 characters.'),
  }),
  display: z.object({
    date_format: z.enum(DATE_FORMATS, { message: 'Choose one of the supported formats.' }),
    timezone: z.string().trim().min(1, 'Enter a timezone.'),
  }),
})

type SettingsValues = z.infer<typeof settingsSchema>

/** Form values (nested) → the API's bare map, keyed by the registry strings. */
function toRegistryPayload(values: SettingsValues): Record<string, unknown> {
  return {
    'branding.app_name': values.branding.app_name,
    'branding.app_description': values.branding.app_description,
    'display.date_format': values.display.date_format,
    'display.timezone': values.display.timezone,
  }
}

/** The snapshot (flat registry keys) → the nested form values. */
function fromSnapshot(snapshot: Record<string, unknown>): SettingsValues {
  return {
    branding: {
      app_name: String(snapshot['branding.app_name'] ?? ''),
      app_description: String(snapshot['branding.app_description'] ?? ''),
    },
    display: {
      date_format: (snapshot['display.date_format'] ?? 'DD.MM.YYYY') as SettingsValues['display']['date_format'],
      timezone: String(snapshot['display.timezone'] ?? ''),
    },
  }
}

function timezoneOptions(): string[] {
  // The browser's own IANA list; absent in older engines, where the field
  // simply has no suggestions (the server still validates).
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
  return intl.supportedValuesOf?.('timeZone') ?? []
}

export function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const access = useAccess()
  const canManage = meetsAccess({ requiredPermissions: ['settings.manage'] }, access)

  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: () => api.get<GetSettingsEndpointApiV1AdminSettingsGetResponse>('/api/v1/admin/settings'),
    staleTime: 60_000,
  })

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      branding: { app_name: '', app_description: '' },
      display: { date_format: 'DD.MM.YYYY', timezone: '' },
    },
  })

  // Seed from the snapshot whenever it (re)arrives — including the response
  // of a successful save, which is the whole point of returning it.
  useEffect(() => {
    if (settingsQuery.data) {
      form.reset(fromSnapshot(settingsQuery.data.values))
    }
  }, [settingsQuery.data, form])

  const mutation = useMutation({
    mutationFn: (values: SettingsValues) =>
      api.put<GetSettingsEndpointApiV1AdminSettingsGetResponse>(
        '/api/v1/admin/settings',
        toRegistryPayload(values),
      ),
    meta: { suppressErrorToast: true },
    onError: (error) => {
      applyServerErrors(error, form)
    },
    onSuccess: (data) => {
      toast.success('Settings saved')
      // Re-seed from the response snapshot and refresh the shared cache so
      // any other reader of this key sees the same truth.
      queryClient.setQueryData(queryKeys.admin.settings, data)
    },
  })

  const zones = useMemo(timezoneOptions, [])
  const dateFormatOptions = DATE_FORMATS.map((format) => ({ value: format, label: format }))

  const header = (
    <PageHeader
      title="Settings"
      description="Application-wide display settings. Changes persist across restarts."
      breadcrumbs={<AppBreadcrumbs />}
    />
  )

  if (settingsQuery.isError && settingsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <ErrorState
          variant={toApiError(settingsQuery.error).isNetworkError ? 'offline' : 'error'}
          onRetry={() => {
            void settingsQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {header}
      <Form {...form}>
        <form
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) =>
              mutation.mutateAsync(values).catch(() => undefined),
            )(event)
          }}
          className="space-y-6"
        >
          <FormError />
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Branding</h2>
              </CardTitle>
              <CardDescription>How the application introduces itself.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <InputField
                control={form.control}
                name="branding.app_name"
                label="Application name"
                autoComplete="off"
                required
                disabled={!canManage}
              />
              <InputField
                control={form.control}
                name="branding.app_description"
                label="Description"
                autoComplete="off"
                disabled={!canManage}
                description="Shown where the application introduces itself; may be empty."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Display</h2>
              </CardTitle>
              <CardDescription>
                How dates and times are presented. Stored instants stay UTC; the timezone only
                affects display.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SelectField
                control={form.control}
                name="display.date_format"
                label="Date format"
                options={dateFormatOptions}
                required
                disabled={!canManage}
              />
              <InputField
                control={form.control}
                name="display.timezone"
                label="Timezone"
                autoComplete="off"
                list="app-settings-timezones"
                required
                disabled={!canManage}
                description="An IANA timezone name, e.g. Asia/Dubai. The server validates it."
              />
              <datalist id="app-settings-timezones">
                {zones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </CardContent>
          </Card>

          {canManage ? <FormActions submitLabel="Save changes" /> : null}
        </form>
      </Form>
    </div>
  )
}
