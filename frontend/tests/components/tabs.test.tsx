import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function Harness() {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="rates">Rates</TabsTrigger>
        <TabsTrigger value="audit" disabled>
          Audit
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="rates">Rates panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('exposes a tablist with tabs and shows only the selected panel', () => {
    render(<Harness />)

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Overview panel')).toBeInTheDocument()
    expect(screen.queryByText('Rates panel')).toBeNull()
  })

  it('moves focus between tabs with the arrow keys without selecting', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'Overview' }).focus()

    await userEvent.keyboard('{ArrowRight}')

    // Base UI uses manual activation (the ARIA APG alternative): arrows move
    // focus, and the panel only changes on Enter or Space.
    expect(screen.getByRole('tab', { name: 'Rates' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Overview panel')).toBeInTheDocument()
  })

  it('selects the focused tab on Enter', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'Overview' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('tab', { name: 'Rates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Rates panel')).toBeInTheDocument()
  })

  it('moves backwards with ArrowLeft', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('tab', { name: 'Rates' }))
    screen.getByRole('tab', { name: 'Rates' }).focus()

    await userEvent.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus()
  })

  it('switches panel on click', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Rates' }))

    expect(screen.getByText('Rates panel')).toBeInTheDocument()
    expect(screen.queryByText('Overview panel')).toBeNull()
  })

  it('is reachable by Tab from outside', async () => {
    render(<Harness />)

    await userEvent.tab()

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus()
  })

  it('keeps a disabled tab out of the tab order', () => {
    render(<Harness />)

    const audit = screen.getByRole('tab', { name: 'Audit' })
    // Base UI marks it with data-disabled rather than the DOM disabled
    // attribute, so the guarantee to assert is that it cannot be reached.
    expect(audit).toHaveAttribute('data-disabled')
    expect(audit.tabIndex).toBe(-1)
  })
})
