import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from '@/app/router'
import { ThemeProvider } from '@/components/providers/theme-provider'
import '@/styles/globals.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Mount point #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
