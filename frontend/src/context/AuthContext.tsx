import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  api,
  setAuthToken,
  getAuthToken,
  setTokens,
  clearTokens,
  logoutServerSide,
  restoreSession,
} from '../api/client'

export type UserRole = 'superadmin' | 'operador' | 'conductor' | 'cobranza'

export interface User {
  id: number
  name: string
  lastName?: string | null
  cedula?: string | null
  address?: string | null
  email: string
  avatarUrl?: string | null
  phone?: string | null
  role: UserRole
  isActive: boolean
  mustChangePassword?: boolean
  createdAt?: string
}

interface LoginResponse {
  token?: string
  accessToken?: string
  refreshToken?: string
  requires2FA?: boolean
  challengeToken?: string
  requiresPasswordChange?: boolean
  user?: User
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  isStaff: boolean
  isSuperadmin: boolean
  isoperador: boolean
  isConductor: boolean
  requires2FA: boolean
  challengeKind: '2fa' | 'password-change' | null
  login: (email: string, password: string) => Promise<User | null>
  verify2FA: (code: string) => Promise<User | null>
  completePasswordChange: (newPassword: string) => Promise<User>
  logout: () => void
  fetchUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingChallenge, setPendingChallenge] = useState<string | null>(null)
  const [challengeKind, setChallengeKind] = useState<'2fa' | 'password-change' | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      const res = await api.get<User>('/auth/profile')
      setUser(res.data)
    } catch {
      clearTokens()
      setToken(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const hasSession = await restoreSession()

      if (cancelled) return

      if (hasSession) {
        setToken(getAuthToken())
        await fetchUser().finally(() => !cancelled && setLoading(false))
        return
      }

      setLoading(false)
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [fetchUser])

  const applyLoginSuccess = useCallback((data: LoginResponse): User => {
    // El backend devuelve token+user en el éxito, o un challenge sin ninguno
    // de los dos. Validamos en runtime en vez de afirmar con `!`.
    const accessToken = data.accessToken ?? data.token
    if (!accessToken || !data.user) {
      throw new Error('Respuesta de autenticación inválida: falta el token o el usuario')
    }

    setTokens(accessToken, data.refreshToken)
    setAuthToken(accessToken)
    setToken(accessToken)
    setUser(data.user)
    return data.user
  }, [])

  const login = async (email: string, password: string): Promise<User | null> => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password })

    if (res.data.requires2FA && res.data.challengeToken) {
      setPendingChallenge(res.data.challengeToken)
      setChallengeKind('2fa')
      return null
    }

    if (res.data.requiresPasswordChange && res.data.challengeToken) {
      setPendingChallenge(res.data.challengeToken)
      setChallengeKind('password-change')
      return null
    }

    setPendingChallenge(null)
    setChallengeKind(null)
    return applyLoginSuccess(res.data)
  }

  const verify2FA = async (code: string): Promise<User | null> => {
    if (!pendingChallenge) throw new Error('No hay verificación 2FA pendiente')
    const res = await api.post<LoginResponse>('/auth/verify-2fa', {
      challengeToken: pendingChallenge,
      code,
    })

    if (res.data.requiresPasswordChange && res.data.challengeToken) {
      setPendingChallenge(res.data.challengeToken)
      setChallengeKind('password-change')
      return null
    }

    setPendingChallenge(null)
    setChallengeKind(null)
    return applyLoginSuccess(res.data)
  }

  const completePasswordChange = async (newPassword: string): Promise<User> => {
    if (!pendingChallenge) throw new Error('No hay cambio de contraseña pendiente')
    const res = await api.post<LoginResponse>('/auth/complete-password-change', {
      challengeToken: pendingChallenge,
      newPassword,
    })
    setPendingChallenge(null)
    setChallengeKind(null)
    return applyLoginSuccess(res.data)
  }

  const logout = async () => {
    await logoutServerSide()
    clearTokens()
    setAuthToken(null)
    setToken(null)
    setUser(null)
    setPendingChallenge(null)
    setChallengeKind(null)
  }

  const isSuperadmin = user?.role === 'superadmin'
  const isoperador = user?.role === 'operador'
  const isConductor = user?.role === 'conductor'
  // Cobranza gestiona cobros/cuentas pendientes; sin backend de sesión propio
  // (usa el mismo token), solo hace falta que cuente como staff del panel.
  const isStaff = !!user && (isSuperadmin || isoperador || isConductor || user.role === 'cobranza')

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isStaff,
        isSuperadmin,
        isoperador,
        isConductor,
        requires2FA: pendingChallenge !== null,
        challengeKind,
        login,
        verify2FA,
        completePasswordChange,
        logout: logout as unknown as () => void,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
