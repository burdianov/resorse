import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

describe('Card', () => {
  it('renders a composed card with a slot marker per part', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )

    for (const slot of ['card', 'card-header', 'card-title', 'card-description', 'card-action', 'card-content', 'card-footer']) {
      expect(container.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    }
  })

  it('renders its content', () => {
    render(
      <Card>
        <CardTitle>Manpower</CardTitle>
        <CardDescription>Summary</CardDescription>
        <CardContent>42 rows</CardContent>
        <CardFooter>Updated today</CardFooter>
      </Card>,
    )

    expect(screen.getByText('Manpower')).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('42 rows')).toBeInTheDocument()
    expect(screen.getByText('Updated today')).toBeInTheDocument()
  })

  it('merges a caller className on the outer card', () => {
    const { container } = render(<Card className="max-w-md" />)

    expect(container.querySelector('[data-slot="card"]')).toHaveClass('max-w-md')
  })

  it('renders the title as a div by default so heading level stays the caller’s choice', () => {
    const { container } = render(<CardTitle>Title</CardTitle>)

    expect(container.querySelector('[data-slot="card-title"]')?.tagName).toBe('DIV')
  })
})
