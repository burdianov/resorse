import { useEffect, useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The optional workspace-context slot from BIG-PROMPT §3.2a, with the interface
 * designed in ARCHITECTURE §7. Stage A builds the *capability*, not a domain
 * module: no project table, no membership model, no navigation entry.
 *
 * Disabled by default, and a disabled slot renders **nothing** — never an inert
 * selector (§3.2a is explicit about that). An enabled adapter gets a working
 * selector: it lists the available contexts and calls `select` on change. The
 * adapter owns persistence and any server-side scoping; this slot only renders.
 *
 * A future business module supplies a real adapter (and proves it in F063);
 * until one exists the header passes nothing.
 */
export interface ContextSwitcherAdapter<TContext> {
  /** False keeps the slot invisible; true renders a functional selector. */
  enabled: boolean
  listAvailable(): Promise<TContext[]>
  getSelected(): TContext | null
  select(context: TContext): Promise<void> | void
}

export interface ContextSwitcherSlotProps<TContext> {
  /** Omit (or pass a disabled adapter) and the slot renders nothing. */
  adapter?: ContextSwitcherAdapter<TContext>
  /** Stable identity for a context; defaults to `String(context)`. */
  getKey?: (context: TContext) => string
  /** Human label for a context; defaults to `String(context)`. */
  getLabel?: (context: TContext) => string
}

function defaultStringify<TContext>(context: TContext): string {
  return String(context)
}

export function ContextSwitcherSlot<TContext>({
  adapter,
  getKey = defaultStringify,
  getLabel = defaultStringify,
}: ContextSwitcherSlotProps<TContext>) {
  const [contexts, setContexts] = useState<TContext[] | null>(null)
  const [selected, setSelected] = useState<TContext | null>(() => adapter?.getSelected() ?? null)

  // `adapter` identity is the contract boundary: the shell creates it once.
  useEffect(() => {
    if (!adapter || !adapter.enabled) {
      return
    }
    let cancelled = false
    void adapter
      .listAvailable()
      .then((available) => {
        if (cancelled) return
        setContexts(available)
        // Drop a selection that is not in the list rather than showing a value
        // the user cannot see or change.
        setSelected((current) =>
          current !== null && available.some((item) => getKey(item) === getKey(current))
            ? current
            : null,
        )
      })
      .catch(() => {
        // The adapter owns surfacing failures; the slot must not turn a failed
        // load into an inert control.
        if (!cancelled) setContexts([])
      })
    return () => {
      cancelled = true
    }
  }, [adapter, getKey])

  if (!adapter || !adapter.enabled) {
    return null
  }

  if (contexts === null) {
    return (
      <div data-slot="context-switcher" className="hidden md:block">
        <Skeleton className="h-8 w-40" aria-hidden />
      </div>
    )
  }

  if (contexts.length === 0) {
    return null
  }

  const items = contexts.map((context) => ({ value: getKey(context), label: getLabel(context) }))
  const selectedKey = selected === null ? null : getKey(selected)

  return (
    <div data-slot="context-switcher" className="hidden md:block">
      <Select
        items={items}
        value={selectedKey}
        onValueChange={(value) => {
          const next = contexts.find((context) => getKey(context) === value)
          if (!next) return
          setSelected(next)
          void adapter.select(next)
        }}
      >
        <SelectTrigger aria-label="Workspace context" className="w-44">
          <SelectValue placeholder="Select context" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
