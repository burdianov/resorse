import { useState } from 'react'
import { LogOutIcon, KeyRoundIcon, UserRoundIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'

/**
 * The header's account menu (F032, BIG-PROMPT §7.1) — the profile menu the
 * header deliberately left out until a real session existed behind it.
 *
 * Four real actions and nothing else: profile (F042's `/profile`),
 * change password (now Profile > Security — the forced flow keeps its own
 * standalone screen), sign out, and sign out everywhere — the last behind a
 * confirmation, because it ends the account's sessions on every device and
 * the menu item alone cannot say that much.
 *
 * The avatar shows the account's initials; the menu label shows the name and
 * email the session actually carries — no fabricated avatar URL, no cached
 * second copy of the identity.
 */

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function UserMenu() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false)

  const user = auth.user
  if (!user) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initialsOf(user.full_name)}</AvatarFallback>
              </Avatar>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-64">
          {/* Base UI requires the label inside a group; the name needs the
              room, so the two lines live in the label itself. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block truncate">{user.full_name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                void navigate('/profile')
              }}
            >
              <UserRoundIcon />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // F042 moved the in-shell destination to Profile > Security;
                // the standalone /change-password screen stays the forced
                // flow's landing (it has no shell by design).
                void navigate('/profile/security')
              }}
            >
              <KeyRoundIcon />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void auth.logout()
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setConfirmingSignOutAll(true)
              }}
            >
              <LogOutIcon />
              Sign out everywhere…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmingSignOutAll}
        onOpenChange={setConfirmingSignOutAll}
        title="Sign out everywhere?"
        description="Every session of this account ends on every device, including this one. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => {
          // Local state clears in the provider's `finally` either way, so the
          // dialog does not need to hold itself open on the request.
          void auth.logoutAll()
        }}
      />
    </>
  )
}
