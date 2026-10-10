import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

/**
 * The frame a component-lab section is built from (F054).
 *
 * The lab's whole job is to show a component being a component, so every case
 * needs three things said about it: what is being demonstrated, that its values
 * are placeholders, and where the example ends. `LabSection` is the outer
 * heading, `LabCase` is one example inside it, and `SampleNote` is the sentence
 * that keeps the page honest.
 *
 * **Why the sample note is a component and not a paragraph someone remembers to
 * write.** This page sits in the same application as the real screens, and a
 * panel of plausible-looking numbers with no provenance is indistinguishable
 * from a panel of real ones. Anything on this page that is not read from the API
 * says so, in the same words, every time.
 */

export interface LabSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export function LabSection({ title, description, children }: LabSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export interface LabCaseProps {
  /** What this example is for — the primitive's name, usually. */
  title: string
  /** What the example is meant to show, when the name alone does not say. */
  note?: string
  children: ReactNode
}

export function LabCase({ title, note, children }: LabCaseProps) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-0.5">
        <h3 className="font-mono text-xs font-medium text-muted-foreground">{title}</h3>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/** Marks the values that follow as written in the source, not read from the API. */
export function SampleNote() {
  return (
    <Badge variant="outline" data-slot="sample-note">
      Sample values
    </Badge>
  )
}
