import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'

/**
 * Tear down between tests.
 *
 * Overlays (Dialog, Sheet, DropdownMenu, Popover) apply **document-level** side
 * effects while they are open — focus trap, `aria-hidden` on sibling nodes, a
 * nested-dialog counter. React Testing Library's `cleanup()` unmounts the React
 * tree without running the component's close path, so that global state
 * survives into the next test and the following modal never receives focus.
 *
 * That failure is easy to misread as a broken component: it passes when the
 * test runs alone and fails when the file runs in sequence. Pressing Escape
 * first takes the normal close path. Both steps live in this one hook so the
 * ordering is explicit rather than relying on hook LIFO.
 */
afterEach(async () => {
  const openOverlay = document.querySelector(
    '[role="dialog"][data-open], [role="menu"][data-open], [role="listbox"][data-open]',
  )
  if (openOverlay) {
    await userEvent.keyboard('{Escape}')
  }
  cleanup()
})

// jsdom implements neither of these, and Base UI's positioning/scroll primitives
// touch them during mount. Stubbed rather than left to throw.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

// jsdom implements no layout, so these exist only as no-ops. cmdk calls
// scrollIntoView whenever it highlights an item; without this shim every
// Command test fails on mount with "scrollIntoView is not a function".
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// Pointer capture is likewise absent; Base UI's overlays call these when
// handling drag/dismiss interactions.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn()
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn()
}
