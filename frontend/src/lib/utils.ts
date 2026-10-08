import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge conditional class names, then resolve Tailwind conflicts so a caller's
 * `className` always wins over a component's defaults.
 *
 * The shadcn `base-nova` registry item imports an equivalent helper from the
 * `cn` package. We keep `clsx` + `tailwind-merge` instead because BIG-PROMPT
 * §2.1 names both in the mandated stack and the reference project carries
 * `lib/utils.ts`. Generated components therefore need their import rewritten —
 * see docs/ARCHITECTURE.md §5.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
