/**
 * Tests — AdminLayout
 *
 * Tests sidebar navigation, user display, logout, and role-based link filtering.
 * Mocks heavy dependencies (useAuth, NotificationBell, hooks, etc.).
 *
 * Note: AdminLayout renders mobile + desktop sidebars simultaneously in jsdom,
 * so each nav link/section title appears twice (one per sidebar). Use getAllByText.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { AdminLayout } from '../AdminLayout'
import { ADMIN_NAV_SECTIONS } from '../../lib/adminNav'
import { isRouteDeclared } from '../../lib/routeAccess'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  BASE_URL: '/api',
  getAuthToken: vi.fn(() => 'test-token'),
  restoreSession: vi.fn(async () => true),
}))

// El layout monta la conexión SSE real; en jsdom el hook se mockea para
// que el test no dependa de fetches ni timers de reconexión.
vi.mock('../../hooks/useSSE', () => ({
  useSSE: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../ui/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}))

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

import { useAuth } from '../../context/AuthContext'
const mockUseAuth = vi.mocked(useAuth)

const superadminUser = {
  id: 1,
  name: 'Admin User',
  email: 'superadmin@nameemp.com',
  role: 'superadmin' as const,
  isActive: true,
  createdAt: '2026-01-01',
  avatarUrl: null,
}

function makeAuth(variants: Partial<Parameters<typeof mockUseAuth.mockReturnValue>[0]> = {}) {
  mockUseAuth.mockReturnValue({
    user: superadminUser,
    token: 'test-token',
    loading: false,
    isStaff: true,
    isSuperadmin: true,
    isVendedor: false,
    isConductor: false,
    requires2FA: false,
    challengeKind: null,
    login: vi.fn(),
    verify2FA: vi.fn(),
    completePasswordChange: vi.fn(),
    logout: mockLogout,
    fetchUser: vi.fn(),
    ...variants,
  })
}

const mockLogout = vi.fn()

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeAuth()
    window.history.pushState({}, '', '/admin')
  })

  it('renders L&L System branding in sidebar', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('L&L System').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByAltText('L&L System').length).toBeGreaterThanOrEqual(1)
  })

  it('renders user name in header menu', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Admin User').length).toBeGreaterThanOrEqual(1)
  })

  it('renders nav sections and core links', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Núcleo').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Gestión').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Panel').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Órdenes').length).toBeGreaterThanOrEqual(2)
    // Decisión CTO: "Mi Perfil" ya NO vive en la navegación lateral (solo en el
    // menú desplegable del usuario, "Mi perfil y seguridad").
    expect(screen.queryByText('Mi Perfil')).toBeNull()
    expect(screen.queryByText('Configuración')).toBeNull()
  })

  it('superadmin sees all management links', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Clientes').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Conductores').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Equipo').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Métodos de Pago').length).toBeGreaterThanOrEqual(1)
  })

  it('vendedor sees Clientes but not Conductores/Equipo/Métodos de Pago', () => {
    makeAuth({
      user: { ...superadminUser, role: 'vendedor' },
      isSuperadmin: false,
      isVendedor: true,
    })
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Clientes').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Órdenes').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('Conductores')).toBeNull()
    expect(screen.queryByText('Equipo')).toBeNull()
    expect(screen.queryByText('Métodos de Pago')).toBeNull()
  })

  it('conductor only sees Panel/Órdenes (no management links)', () => {
    makeAuth({
      user: { ...superadminUser, role: 'conductor' },
      isSuperadmin: false,
      isConductor: true,
    })
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Panel').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Órdenes').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('Clientes')).toBeNull()
    expect(screen.queryByText('Conductores')).toBeNull()
    expect(screen.queryByText('Equipo')).toBeNull()
    expect(screen.queryByText('Métodos de Pago')).toBeNull()
  })

  it('renders Cerrar sesión button', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getAllByText('Cerrar sesión').length).toBeGreaterThanOrEqual(1)
  })

  it('calls logout when clicking Cerrar sesión', () => {
    renderWithProviders(<AdminLayout />)
    const logoutBtns = screen.getAllByText('Cerrar sesión')
    fireEvent.click(logoutBtns[logoutBtns.length - 1]) // desktop sidebar
    expect(mockLogout).toHaveBeenCalled()
  })

  it('renders notification bell and theme toggle', () => {
    renderWithProviders(<AdminLayout />)
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument()
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
  })
})

/**
 * Guard por rol (opción 2 del CTO): el menú oculta los links, pero abrir la
 * URL a mano tiene que quedar bloqueado. El menú y el guard comparten el mapa
 * de `lib/routeAccess.ts`.
 *
 * OJO: este describe es HERMANO de `AdminLayout`, no anidado → NO hereda su
 * beforeEach. Declara el suyo: si no, el rol que dejó el test anterior se
 * filtra y los tests pasan o fallan según el orden de ejecución.
 */
describe('AdminLayout — guard por rol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeAuth() // superadmin por defecto; cada test cambia el rol si hace falta
  })

  const asConductor = () =>
    makeAuth({
      user: { ...superadminUser, role: 'conductor' },
      isSuperadmin: false,
      isConductor: true,
    })
  const asVendedor = () =>
    makeAuth({
      user: { ...superadminUser, role: 'vendedor' },
      isSuperadmin: false,
      isVendedor: true,
    })

  it('bloquea al conductor que teclea una URL de gestión', () => {
    asConductor()
    window.history.pushState({}, '', '/admin/equipo')
    renderWithProviders(<AdminLayout />)
    expect(screen.getByText('No tenés acceso a esta sección')).toBeInTheDocument()
  })

  it('bloquea al vendedor en Métodos de Pago pero no en Notas de entrega', () => {
    asVendedor()

    window.history.pushState({}, '', '/admin/metodos-pago')
    const bloqueado = renderWithProviders(<AdminLayout />)
    expect(screen.getByText('No tenés acceso a esta sección')).toBeInTheDocument()
    bloqueado.unmount()

    window.history.pushState({}, '', '/admin/notas-entrega')
    renderWithProviders(<AdminLayout />)
    expect(screen.queryByText('No tenés acceso a esta sección')).toBeNull()
  })

  it('no bloquea al rol correcto en su propia ruta', () => {
    window.history.pushState({}, '', '/admin/equipo') // superadmin
    renderWithProviders(<AdminLayout />)
    expect(screen.queryByText('No tenés acceso a esta sección')).toBeNull()
  })

  it('no bloquea el detalle de orden del conductor (/admin/ordenes/:id)', () => {
    asConductor()
    window.history.pushState({}, '', '/admin/ordenes/34')
    renderWithProviders(<AdminLayout />)
    expect(screen.queryByText('No tenés acceso a esta sección')).toBeNull()
  })

  it('al volver al panel desde la pantalla de bloqueo se libera el guard', async () => {
    asConductor()
    window.history.pushState({}, '', '/admin/conductores')
    renderWithProviders(<AdminLayout />)
    expect(screen.getByText('No tenés acceso a esta sección')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volver al panel'))

    await waitFor(() => {
      expect(screen.queryByText('No tenés acceso a esta sección')).toBeNull()
    })
  })

  it('todo link del menú está declarado en el mapa de acceso', () => {
    for (const section of ADMIN_NAV_SECTIONS) {
      for (const link of section.links) {
        expect(
          isRouteDeclared(link.href),
          `${link.href} no está declarado en ROUTE_ROLES → quedaría abierto a TODOS los roles`,
        ).toBe(true)
      }
    }
  })
})
