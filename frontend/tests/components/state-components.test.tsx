import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Inbox } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { LoadingState } from '@/components/common/loading-state'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'

/**
 * The F017 enhanced generics (BIG-PROMPT §5.2b): PageHeader, EmptyState,
 * ErrorState, LoadingState, StatusBadge. They are the vocabulary every later
 * screen uses for "no data", "failed", "loading" and "where am I", so the
 * assertions are about what each one *announces*, not about its colours.
 */

describe('PageHeader', () => {
  it('renders the title as the page heading with its description', () => {
    render(<PageHeader title="Users" description="Everyone with an account." />)

    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    expect(screen.getByText('Everyone with an account.')).toBeInTheDocument()
  })

  it('renders actions and the breadcrumbs slot', () => {
    render(
      <PageHeader
        title="Users"
        breadcrumbs={<nav aria-label="breadcrumb">trail</nav>}
        actions={<Button>New user</Button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('explains what is missing and can offer the action that changes it', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No users yet"
        description="Create the first account to get started."
        action={<Button>New user</Button>}
      />,
    )

    expect(screen.getByText('No users yet')).toBeInTheDocument()
    expect(screen.getByText('Create the first account to get started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument()
  })

  it('is not an alert — being empty is a normal state', () => {
    render(<EmptyState title="No users yet" />)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ErrorState', () => {
  it('announces as an alert and offers Retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has an offline flavour for network and 5xx failures (§6.2f)', () => {
    render(<ErrorState variant="offline" onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the server')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows no retry affordance when the caller cannot retry', () => {
    render(<ErrorState title="Not found" />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('LoadingState', () => {
  it('is one polite status region announcing the caller’s label', () => {
    render(<LoadingState label="Loading users" />)

    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toHaveAccessibleName('Loading users')
    expect(screen.getByText('Loading users')).toBeInTheDocument()
  })
})

describe('StatusBadge', () => {
  it('maps known statuses to a label and the status attribute', () => {
    render(<StatusBadge status="Active" />)

    const badge = screen.getByText('Active')
    expect(badge).toHaveAttribute('data-slot', 'status-badge')
    expect(badge).toHaveAttribute('data-status', 'active')
  })

  it('falls back to the raw value for an unknown status', () => {
    render(<StatusBadge status="suspended" />)

    const badge = screen.getByText('suspended')
    expect(badge).toHaveAttribute('data-status', 'suspended')
  })

  it('allows the caller to override the label', () => {
    render(<StatusBadge status="pending" label="Awaiting approval" />)

    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
  })
})
