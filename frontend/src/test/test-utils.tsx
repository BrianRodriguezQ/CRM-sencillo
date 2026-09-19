/**
 * renderWithProviders — custom render with all context providers.
 *
 * Usage:
 *   import { renderWithProviders } from '../test/test-utils'
 *   renderWithProviders(<MyComponent />, { initialRoute: '/admin' })
 *
 * Options allow controlling which providers are included and their initial state.
 */
import { type ReactElement, type ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'

/* ── QueryClient for tests (no retries, no stale cache) ─── */

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/* ── Options ─────────────────────────────────── */

export interface RenderOptionsWithProviders extends Omit<RenderOptions, 'wrapper'> {
  /** Route to wrap with BrowserRouter (default: '/') */
  initialRoute?: string
  /** Skip wrapping with AuthProvider (default: false) */
  skipAuth?: boolean
  /** Skip wrapping with ThemeProvider (default: false) */
  skipTheme?: boolean
  /** Skip wrapping with QueryClientProvider (default: false) */
  skipQuery?: boolean
  /** Pre-existing query client (if you need to inspect cache) */
  queryClient?: QueryClient
}

/* ── Wrapper component ───────────────────────── */

function AllProviders({
  children,
  initialRoute = '/',
  skipAuth = false,
  skipTheme = false,
  skipQuery = false,
  queryClient,
}: {
  children: ReactNode
} & Omit<RenderOptionsWithProviders, 'wrapper'>) {
  let tree = <>{children}</>

  // BrowserRouter must be outermost for routing hooks
  tree = <BrowserRouter>{tree}</BrowserRouter>

  if (!skipTheme) {
    tree = <ThemeProvider>{tree}</ThemeProvider>
  }

  if (!skipQuery) {
    const qc = queryClient ?? createTestQueryClient()
    tree = <QueryClientProvider client={qc}>{tree}</QueryClientProvider>
  }

  if (!skipAuth) {
    tree = <AuthProvider>{tree}</AuthProvider>
  }

  return <>{tree}</>
}

/* ── Custom render ───────────────────────────── */

export function renderWithProviders(ui: ReactElement, options: RenderOptionsWithProviders = {}) {
  const { initialRoute, skipAuth, skipTheme, skipQuery, queryClient, ...renderOptions } = options

  // Navigate to initialRoute if specified
  if (initialRoute && initialRoute !== '/') {
    window.history.pushState({}, '', initialRoute)
  }

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <AllProviders
      initialRoute={initialRoute}
      skipAuth={skipAuth}
      skipTheme={skipTheme}
      skipQuery={skipQuery}
      queryClient={queryClient}
    >
      {children}
    </AllProviders>
  )

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  }
}

/* ── Re-export everything from testing-library ─ */

export {
  screen,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved,
  within,
  act,
} from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
