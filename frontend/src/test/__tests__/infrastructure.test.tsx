/**
 * Smoke test — Verifies test infrastructure is correctly configured.
 *
 * If this passes, renderWithProviders, factories, and providers all work.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../test-utils'
import {
  createMockUser,
  createMockVendedor,
  createMockConductor,
  createLoginResponse,
} from '../mocks/factories'

// Mock api client (same pattern as existing tests)
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  // D2 exports
  getAuthToken: vi.fn(() => null),
  setAuthToken: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logoutServerSide: vi.fn(async () => {}),
  restoreSession: vi.fn(async () => false),
}))

import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

/* ── Component that reads auth context ──────── */

function AuthStatus() {
  const { user, token, loading } = useAuth()
  if (loading) return <div data-testid="status">loading</div>
  return (
    <div data-testid="status">
      <span data-testid="user-email">{user?.email ?? 'none'}</span>
      <span data-testid="has-token">{token ? 'yes' : 'no'}</span>
    </div>
  )
}

/* ── Tests ──────────────────────────────────── */

describe('Test infrastructure smoke test', () => {
  it('createMockUser builds a valid user', () => {
    const user = createMockUser()
    expect(user.id).toBe(1)
    expect(user.role).toBe('superadmin')
    expect(user.email).toBe('superadmin@nameemp.com')
  })

  it('createMockVendedor builds a seller user', () => {
    const vendedor = createMockVendedor()
    expect(vendedor.role).toBe('vendedor')
  })

  it('createMockConductor builds a driver user', () => {
    const conductor = createMockConductor()
    expect(conductor.role).toBe('conductor')
  })

  it('createLoginResponse has correct shape', () => {
    const res = createLoginResponse()
    expect(res.success).toBe(true)
    expect(res.data.token).toBeTruthy()
    expect(res.data.refreshToken).toBeTruthy()
    expect(res.data.user.email).toBe('superadmin@nameemp.com')
  })

  it('renderWithProviders renders with AuthProvider', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('no token'))

    renderWithProviders(<AuthStatus />)

    // When no token, AuthProvider resolves loading=false immediately (no fetch)
    await waitFor(() => {
      expect(screen.getByTestId('user-email').textContent).toBe('none')
      expect(screen.getByTestId('has-token').textContent).toBe('no')
    })
  })

  it('skipAuth renders without AuthProvider (useAuth throws)', () => {
    // skipAuth = true means no AuthProvider wrapping, so useAuth throws
    expect(() => {
      renderWithProviders(<AuthStatus />, { skipAuth: true })
    }).toThrow('useAuth debe usarse dentro de AuthProvider')
  })
})
