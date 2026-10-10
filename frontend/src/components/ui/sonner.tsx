import { Toaster as Sonner, type ToasterProps } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react'

import { useTheme } from '@/components/providers/theme-provider'

/**
 * Toaster from the registry, corrected (ARCHITECTURE §5).
 *
 * 1. The generated file imports `useTheme` from `next-themes` — the dependency
 *    F010 deliberately rejected and documented the exception for
 *    (ARCHITECTURE §5, STACK_VERSIONS §2). It now reads this project's own
 *    theme provider, whose `resolvedTheme` is already the concrete
 *    `'light' | 'dark'`, which is exactly what Sonner's `theme` prop takes.
 * 2. `className="toaster group"` and the `cn-toast` toast class were dropped:
 *    like `no-scrollbar` before them, those classes come from
 *    `shadcn/tailwind.css`, which this project does not import — they style
 *    nothing here.
 *
 * The `--normal-*` / `--border-radius` variables ARE kept: Sonner itself reads
 * them for its own chrome, so they are live styling, not decoration.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
