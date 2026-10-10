import * as React from 'react'

/**
 * True below the source's mobile boundary (BIG-PROMPT §1.2): under 768px the
 * sidebar becomes an off-canvas drawer instead of a pinned column. Between 768
 * and 1023px it stays pinned but the shell collapses it to the 64px rail on
 * first load — see `layout/sidebar-preferences.ts`.
 */
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
