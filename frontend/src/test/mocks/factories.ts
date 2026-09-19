/**
 * Mock factories — reusable builders for test data.
 *
 * Cada factory tiene defaults sensatos + un override parcial.
 * Usar: createMockUser({ name: 'Custom' }) → merge con defaults.
 */

/* ── Users ───────────────────────────────────── */

export type MockUserRole = 'superadmin' | 'vendedor' | 'conductor'

export interface MockUser {
  id: number
  name: string
  email: string
  avatarUrl?: string | null
  phone?: string | null
  role: MockUserRole
  isActive: boolean
  mustChangePassword?: boolean
  createdAt?: string
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 1,
    name: 'Admin Test',
    email: 'superadmin@nameemp.com',
    avatarUrl: null,
    phone: null,
    role: 'superadmin',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function createMockVendedor(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    id: 2,
    name: 'Vendedor Test',
    email: 'vendedor@nameemp.com',
    role: 'vendedor',
    ...overrides,
  })
}

export function createMockConductor(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    id: 3,
    name: 'Conductor Test',
    email: 'conductor@nameemp.com',
    role: 'conductor',
    ...overrides,
  })
}

/* ── Tokens ──────────────────────────────────── */

export function createMockToken(user: MockUser = createMockUser()): string {
  // Fake JWT — base64 encoded payload (not validated, just parsed by context)
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  }
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

/* ── API Responses ───────────────────────────── */

export function createLoginResponse(user: MockUser = createMockUser()) {
  return {
    success: true,
    data: {
      token: createMockToken(user),
      accessToken: createMockToken(user),
      refreshToken: 'refresh-fake',
      user,
    },
  }
}

export function createProfileResponse(user: MockUser = createMockUser()) {
  return {
    success: true,
    data: user,
  }
}

export function createListResponse<T>(items: T[], total?: number) {
  return {
    success: true,
    data: items,
    total: total ?? items.length,
    page: 1,
    perPage: 20,
  }
}

export function createErrorResponse(error: string) {
  return {
    success: false,
    data: null,
    error,
  }
}

/* ── auth token helpers (D2) ─────────────────── */

export function setAuthToken(token: string = 'test-token') {
  // D2: access en memoria del api client + refresh en sessionStorage
  localStorage.setItem('spi_token', token)
  sessionStorage.setItem('spi_refresh_token', `${token}-refresh`)
}

export function clearAuthToken() {
  localStorage.removeItem('spi_token')
  sessionStorage.removeItem('spi_refresh_token')
}
