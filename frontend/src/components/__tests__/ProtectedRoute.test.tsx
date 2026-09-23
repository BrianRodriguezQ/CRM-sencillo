/**
 * Tests — ProtectedRoute
 *
 * Estrategia: mockear useAuth con vi.mock + vi.mocked.
 * El mock factory devuelve un vi.fn() que controlamos desde cada test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from '../ProtectedRoute'

// Mock completo del módulo AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../context/AuthContext'
const mockUseAuth = vi.mocked(useAuth)

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Navigate: vi.fn(({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />),
  Outlet: vi.fn(() => <div data-testid="outlet" />),
  useLocation: vi.fn(() => ({ pathname: '/' })),
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockClear()
  })

  it('muestra spinner mientras loading', () => {
    ;(mockUseAuth as any).mockReturnValue({ user: null, token: null, loading: true })
    const { container } = render(<ProtectedRoute />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeDefined()
  })

  it('redirige a /login si no hay token ni user', () => {
    ;(mockUseAuth as any).mockReturnValue({ user: null, token: null, loading: false })
    render(<ProtectedRoute />)
    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
  })

  it('redirige a /login si hay token pero no user', () => {
    ;(mockUseAuth as any).mockReturnValue({ user: null, token: 'token-valido', loading: false })
    render(<ProtectedRoute />)
    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
  })

  it('redirige a /login si hay user pero no token', () => {
    ;(mockUseAuth as any).mockReturnValue({
      user: { role: 'operador' },
      token: null,
      loading: false,
    })
    render(<ProtectedRoute />)
    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
  })

  it('renderiza Outlet si hay user y token (cualquier rol staff)', () => {
    ;(mockUseAuth as any).mockReturnValue({
      user: { role: 'conductor' },
      token: 'token-valido',
      loading: false,
    })
    render(<ProtectedRoute />)
    expect(screen.getByTestId('outlet')).toBeDefined()
  })

  it('renderiza Outlet para superadmin', () => {
    ;(mockUseAuth as any).mockReturnValue({
      user: { role: 'superadmin' },
      token: 'token-valido',
      loading: false,
    })
    render(<ProtectedRoute />)
    expect(screen.getByTestId('outlet')).toBeDefined()
  })
})
