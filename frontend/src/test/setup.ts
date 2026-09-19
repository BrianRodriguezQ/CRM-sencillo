/**
 * Vitest global setup — runs before each test file.
 *
 * - Adds jest-dom matchers to expect()
 * - Sets up MSW server lifecycle (optional per test file)
 * - Configures browser API mocks that many components depend on
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Auto-cleanup after each test (redundant with React 18+ but explicit is better)
afterEach(() => {
  cleanup()
})

// Mock browsers APIs that aren't available in jsdom

// IntersectionObserver — used by useInView and many UI components
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root = null
    rootMargin = ''
    thresholds = []
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  } as unknown as typeof IntersectionObserver
}

// matchMedia — used by ThemeContext and responsive components
if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// scrollTo — used by scroll-based components
if (!globalThis.scrollTo) {
  globalThis.scrollTo = vi.fn()
}
