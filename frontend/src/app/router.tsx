import { createBrowserRouter } from 'react-router'

/**
 * Router skeleton — data-router mode (ARCHITECTURE §5).
 *
 * F006 only proves the mode works end to end. The real registry arrives with
 * F016 (route metadata, permission filtering, lazy chunks, command palette
 * parity) and the route states — `/` redirect, 403, 404, error boundary — with
 * F017. Nothing here renders data of any kind.
 */
function FoundationStatus() {
  return (
    <main>
      <h1>Application Platform</h1>
      <p>Frontend foundation bootstrapped: Vite + React + TypeScript + React Router.</p>
      <p>Routing mode: data router. No application pages exist yet.</p>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <FoundationStatus />,
  },
])
