/**
 * Tests — AuthContext
 *
 * Estrategia: mockear api.client para controlar respuestas del backend.
 * Verificar login, desafíos 2FA / cambio de contraseña, logout y flags de rol.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// Mock completo del api client — incluye helpers D2
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn(() => null),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logoutServerSide: vi.fn(async () => {}),
  restoreSession: vi.fn(async () => false),
}))

import { api, setAuthToken } from '../../api/client'

function TestLogin() {
  const {
    user,
    token,
    loading,
    isStaff,
    isSuperadmin,
    isoperador,
    isConductor,
    login,
    logout,
    verify2FA,
    completePasswordChange,
    requires2FA,
    challengeKind,
  } = useAuth()
  if (loading) return <div>cargando...</div>
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'null'}</span>
      <span data-testid="token">{token ? 'tiene-token' : 'no-token'}</span>
      <span data-testid="isStaff">{isStaff ? 'staff' : 'no-staff'}</span>
      <span data-testid="isSuperadmin">{isSuperadmin ? 'superadmin' : 'no-superadmin'}</span>
      <span data-testid="isoperador">{isoperador ? 'operador' : 'no-operador'}</span>
      <span data-testid="isConductor">{isConductor ? 'conductor' : 'no-conductor'}</span>
      <span data-testid="challenge">
        {requires2FA ? `challenge:${challengeKind}` : 'sin-challenge'}
      </span>
      <button onClick={() => login('a@b.com', 'pass')}>login</button>
      <button onClick={() => verify2FA('123456')}>verify2FA</button>
      <button onClick={() => completePasswordChange('NuevaClave123')}>cambiar-pass</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

const mockUser = {
  id: 1,
  name: 'Admin',
  email: 'superadmin@nameemp.com',
  role: 'superadmin',
  isActive: true,
  createdAt: '2026-01-01',
}

const mockoperador = { ...mockUser, id: 2, email: 'operador@nameemp.com', role: 'operador' }
const mockConductor = { ...mockUser, id: 3, email: 'conductor@nameemp.com', role: 'conductor' }

const mockLoginResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    token: 'jwt-fake',
    accessToken: 'jwt-fake',
    refreshToken: 'refresh-fake',
    user: mockUser,
    ...overrides,
  },
})

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.mocked(setAuthToken).mockImplementation(() => {})
  })

  it('arranca sin usuario y sin token', async () => {
    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null')
      expect(screen.getByTestId('token').textContent).toBe('no-token')
      expect(screen.getByTestId('isStaff').textContent).toBe('no-staff')
      expect(screen.getByTestId('challenge').textContent).toBe('sin-challenge')
    })
  })

  it('login setea usuario y token (superadmin)', async () => {
    vi.mocked(api.post).mockResolvedValue(mockLoginResponse())

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('login')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('superadmin@nameemp.com')
      expect(screen.getByTestId('token').textContent).toBe('tiene-token')
      expect(screen.getByTestId('isStaff').textContent).toBe('staff')
      expect(screen.getByTestId('isSuperadmin').textContent).toBe('superadmin')
    })
  })

  it('flags de rol reflejan operador y conductor', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce(mockLoginResponse({ user: mockoperador }))
      .mockResolvedValueOnce(mockLoginResponse({ user: mockConductor }))

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('login')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('login'))
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('operador@nameemp.com')
    })
    expect(screen.getByTestId('isoperador').textContent).toBe('operador')
    expect(screen.getByTestId('isSuperadmin').textContent).toBe('no-superadmin')

    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null')
      expect(screen.getByTestId('token').textContent).toBe('no-token')
    })

    fireEvent.click(screen.getByText('login'))
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('conductor@nameemp.com')
    })
    expect(screen.getByTestId('isConductor').textContent).toBe('conductor')
    expect(screen.getByTestId('isStaff').textContent).toBe('staff')
  })

  it('login que requiere 2FA no setea sesión (challenge pendiente)', async () => {
    vi.mocked(api.post).mockResolvedValue(
      mockLoginResponse({ requires2FA: true, challengeToken: 'ch-2fa', user: undefined }),
    )

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('login')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null')
      expect(screen.getByTestId('token').textContent).toBe('no-token')
      expect(screen.getByTestId('challenge').textContent).toBe('challenge:2fa')
    })

    // verify2FA resuelve el desafío y setea la sesión
    vi.mocked(api.post).mockResolvedValue(mockLoginResponse())
    fireEvent.click(screen.getByText('verify2FA'))

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('superadmin@nameemp.com')
      expect(screen.getByTestId('token').textContent).toBe('tiene-token')
      expect(screen.getByTestId('challenge').textContent).toBe('sin-challenge')
    })
  })

  it('login que requiere cambio de contraseña se completa con completePasswordChange', async () => {
    vi.mocked(api.post).mockResolvedValue(
      mockLoginResponse({
        requiresPasswordChange: true,
        challengeToken: 'ch-pass',
        user: undefined,
      }),
    )

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('login')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('challenge').textContent).toBe('challenge:password-change')
      expect(screen.getByTestId('user').textContent).toBe('null')
    })

    vi.mocked(api.post).mockResolvedValue(mockLoginResponse())
    fireEvent.click(screen.getByText('cambiar-pass'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/complete-password-change', {
        challengeToken: 'ch-pass',
        newPassword: 'NuevaClave123',
      })
      expect(screen.getByTestId('user').textContent).toBe('superadmin@nameemp.com')
      expect(screen.getByTestId('token').textContent).toBe('tiene-token')
    })
  })

  it('logout limpia usuario y token y revoca server-side', async () => {
    vi.mocked(api.post).mockResolvedValue(mockLoginResponse())

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('login')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('login'))
    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('tiene-token')
    })

    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null')
    })
    expect(screen.getByTestId('token').textContent).toBe('no-token')
    const { logoutServerSide } = await import('../../api/client')
    expect(vi.mocked(logoutServerSide)).toHaveBeenCalled()
  })

  it('restaura sesión si restoreSession devuelve true', async () => {
    const { restoreSession, getAuthToken } = await import('../../api/client')
    vi.mocked(restoreSession).mockImplementation(async () => {
      vi.mocked(getAuthToken).mockReturnValue('access-restaurado')
      return true
    })
    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockUser })

    render(
      <AuthProvider>
        <TestLogin />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('tiene-token')
      expect(screen.getByTestId('user').textContent).toBe('superadmin@nameemp.com')
    })
  })
})

describe('useAuth sin provider', () => {
  it('lanza error si se usa fuera de AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestLogin />)).toThrow('useAuth debe usarse dentro de AuthProvider')
  })
})
