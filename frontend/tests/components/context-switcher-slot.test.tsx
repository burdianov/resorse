import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ContextSwitcherSlot } from '@/components/layout/context-switcher-slot'
import type { ContextSwitcherAdapter } from '@/components/layout/context-switcher-slot'

/**
 * The workspace-context extension slot (BIG-PROMPT §3.2a, ARCHITECTURE §7).
 *
 * The default state is the one that ships: no adapter, or a disabled one, and
 * the slot renders **nothing** — §3.2a forbids an inert selector. The enabled
 * path is the contract a future module (or F063's extension proof) plugs into,
 * so it is exercised here with a test adapter.
 */
interface Workspace {
  id: string
  name: string
}

const WORKSPACES: Workspace[] = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'beta', name: 'Beta' },
]

function makeAdapter(
  overrides: Partial<ContextSwitcherAdapter<Workspace>> = {},
): ContextSwitcherAdapter<Workspace> {
  return {
    enabled: true,
    listAvailable: vi.fn().mockResolvedValue(WORKSPACES),
    getSelected: vi.fn().mockReturnValue(WORKSPACES[0]),
    select: vi.fn(),
    ...overrides,
  }
}

function renderSlot(adapter?: ContextSwitcherAdapter<Workspace>) {
  const props = adapter ? { adapter } : {}
  return render(<ContextSwitcherSlot<Workspace> {...props} getKey={(w) => w.id} getLabel={(w) => w.name} />)
}

describe('ContextSwitcherSlot', () => {
  it('renders nothing without an adapter', () => {
    const { container } = renderSlot()

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing and asks nothing of a disabled adapter', () => {
    const adapter = makeAdapter({ enabled: false })
    const { container } = renderSlot(adapter)

    expect(container).toBeEmptyDOMElement()
    expect(adapter.listAvailable).not.toHaveBeenCalled()
  })

  it('lists the available contexts and reports the current selection', async () => {
    renderSlot(makeAdapter())

    const trigger = await screen.findByRole('combobox', { name: 'Workspace context' })
    expect(trigger).toBeInTheDocument()
  })

  it('calls select with the chosen context', async () => {
    const adapter = makeAdapter()
    renderSlot(adapter)
    await screen.findByRole('combobox', { name: 'Workspace context' })

    await userEvent.click(screen.getByRole('combobox', { name: 'Workspace context' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Beta' }))

    expect(adapter.select).toHaveBeenCalledWith(WORKSPACES[1])
  })

  it('renders nothing when the adapter has no contexts to offer', async () => {
    const adapter = makeAdapter({ listAvailable: vi.fn().mockResolvedValue([]) })
    const { container } = renderSlot(adapter)

    await waitFor(() => {
      expect(adapter.listAvailable).toHaveBeenCalled()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when loading fails, rather than a dead control', async () => {
    const adapter = makeAdapter({ listAvailable: vi.fn().mockRejectedValue(new Error('offline')) })
    const { container } = renderSlot(adapter)

    await waitFor(() => {
      expect(adapter.listAvailable).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })
})
