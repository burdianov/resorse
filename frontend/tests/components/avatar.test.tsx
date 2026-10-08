import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'

describe('Avatar', () => {
  it('renders initials from the fallback when no image has loaded', () => {
    render(
      <Avatar>
        <AvatarImage src="/nonexistent.png" alt="Ada Lovelace" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    )

    // jsdom never loads images, so this is the state a user sees before load —
    // and the one that matters when an image is missing entirely.
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('marks the shared slots for styling', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="/nonexistent.png" alt="Ada" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    )

    expect(container.querySelector('[data-slot="avatar"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="avatar-fallback"]')).not.toBeNull()
  })

  it('renders a badge inside the avatar', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
        <AvatarBadge />
      </Avatar>,
    )

    expect(container.querySelector('[data-slot="avatar-badge"]')).not.toBeNull()
  })

  it('renders a group with an overflow count', () => {
    const { container } = render(
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>AL</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>GH</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>,
    )

    expect(container.querySelector('[data-slot="avatar-group"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="avatar-group-count"]')).not.toBeNull()
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('merges a caller className', () => {
    const { container } = render(<Avatar className="size-12" />)

    expect(container.querySelector('[data-slot="avatar"]')).toHaveClass('size-12')
  })
})
