import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider } from './context/ThemeContext'
import { queryClient } from './lib/queryClient'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
          <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
