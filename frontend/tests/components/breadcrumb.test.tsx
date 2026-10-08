import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

function Trail() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Users</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

describe('Breadcrumb', () => {
  it('is exposed as a labelled navigation landmark', () => {
    render(<Trail />)

    // The registry labels it lowercase; the landmark name is what matters.
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
  })

  it('renders an ordered list of items', () => {
    const { container } = render(<Trail />)

    expect(container.querySelector('[data-slot="breadcrumb-list"]')?.tagName).toBe('OL')
    expect(container.querySelectorAll('[data-slot="breadcrumb-item"]').length).toBe(3)
  })

  it('renders earlier crumbs as links', () => {
    render(<Trail />)

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('marks the current page as current and non-navigable', () => {
    render(<Trail />)

    const current = screen.getByText('Users')
    // BreadcrumbPage keeps the link styling but is a span with aria-disabled,
    // so it is announced as the current page rather than offered as a target.
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveAttribute('aria-disabled', 'true')
    expect(current.tagName).toBe('SPAN')
    expect(current).not.toHaveAttribute('href')
  })

  it('renders separators as decorative so they are not announced', () => {
    const { container } = render(<Trail />)

    const separators = container.querySelectorAll('[data-slot="breadcrumb-separator"]')
    expect(separators.length).toBe(2)
    separators.forEach((separator) => {
      expect(separator).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('renders the collapsed ellipsis with an accessible label', () => {
    render(<Trail />)

    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('merges a caller className on the list', () => {
    const { container } = render(
      <BreadcrumbList className="text-sm">
        <BreadcrumbItem>one</BreadcrumbItem>
      </BreadcrumbList>,
    )

    expect(container.querySelector('[data-slot="breadcrumb-list"]')).toHaveClass('text-sm')
  })
})
