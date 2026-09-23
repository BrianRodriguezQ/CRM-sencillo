/**
 * Tests — routeAccess (mapa de acceso por rol del panel)
 *
 * Este módulo es la fuente única de verdad que consumen el menú lateral y el
 * guard del layout. Si esto se rompe, un rol puede abrir pantallas que no le
 * corresponden.
 */
import { describe, it, expect } from 'vitest'
import { canAccessRoute, rolesForPath, isRouteDeclared } from '../routeAccess'
import type { UserRole } from '../../context/AuthContext'

const ROLES: UserRole[] = ['superadmin', 'operador', 'conductor']

describe('routeAccess — rutas permitidas por rol', () => {
  it('superadmin accede a todo el panel', () => {
    const rutas = [
      '/admin',
      '/admin/ordenes',
      '/admin/clientes',
      '/admin/conductores',
      '/admin/equipo',
      '/admin/metodos-pago',
      '/admin/notas-entrega',
      '/admin/perfil',
    ]
    for (const ruta of rutas) {
      expect(canAccessRoute('superadmin', ruta), ruta).toBe(true)
    }
  })

  it('operador accede a las suyas y NO a las de gestión de usuarios', () => {
    expect(canAccessRoute('operador', '/admin')).toBe(true)
    expect(canAccessRoute('operador', '/admin/ordenes')).toBe(true)
    expect(canAccessRoute('operador', '/admin/clientes')).toBe(true)
    expect(canAccessRoute('operador', '/admin/notas-entrega')).toBe(true)

    expect(canAccessRoute('operador', '/admin/equipo')).toBe(false)
    expect(canAccessRoute('operador', '/admin/conductores')).toBe(false)
    expect(canAccessRoute('operador', '/admin/metodos-pago')).toBe(false)
  })

  it('conductor solo accede a Panel / Órdenes / Mi Perfil', () => {
    expect(canAccessRoute('conductor', '/admin')).toBe(true)
    expect(canAccessRoute('conductor', '/admin/ordenes')).toBe(true)
    expect(canAccessRoute('conductor', '/admin/perfil')).toBe(true)

    expect(canAccessRoute('conductor', '/admin/clientes')).toBe(false)
    expect(canAccessRoute('conductor', '/admin/equipo')).toBe(false)
    expect(canAccessRoute('conductor', '/admin/conductores')).toBe(false)
    expect(canAccessRoute('conductor', '/admin/metodos-pago')).toBe(false)
    expect(canAccessRoute('conductor', '/admin/notas-entrega')).toBe(false)
  })

  it('roles desconocidos o ausentes no acceden a rutas declaradas', () => {
    expect(canAccessRoute(undefined, '/admin/equipo')).toBe(false)
    expect(canAccessRoute('' as UserRole, '/admin/equipo')).toBe(false)
  })
})

describe('routeAccess — matching por prefijo', () => {
  it('resuelve rutas con parámetros al prefijo declarado', () => {
    // /admin/ordenes está declarado para conductor → su detalle también
    expect(canAccessRoute('conductor', '/admin/ordenes/34')).toBe(true)
    // y no escala al resto del panel
    expect(canAccessRoute('conductor', '/admin/equipo/7')).toBe(false)
  })

  it('crear orden es de superadmin/operador — el conductor no crea, ejecuta', () => {
    // REGLA DE NEGOCIO: el conductor recibe y ejecuta órdenes, no las crea.
    // La ruta de creación está declarada con sus propios roles (prefijo más
    // largo gana sobre /admin/ordenes) y el backend POST /orders exige lo mismo.
    expect(canAccessRoute('superadmin', '/admin/ordenes/nueva')).toBe(true)
    expect(canAccessRoute('operador', '/admin/ordenes/nueva')).toBe(true)
    expect(canAccessRoute('conductor', '/admin/ordenes/nueva')).toBe(false)
  })

  it('no matchea por prefijo PARCIAL de string', () => {
    // '/admin/equipoXYZ' no es '/admin/equipo' → cae al prefijo más corto ('/admin'),
    // que está abierto a todos los roles. Lo importante: NO hereda la
    // restricción de superadmin de '/admin/equipo'.
    expect(canAccessRoute('conductor', '/admin/equipoXYZ')).toBe(true)
    expect(canAccessRoute('operador', '/admin/equipoXYZ')).toBe(true)

    // y '/adminX' no es '/admin'
    expect(rolesForPath('/adminX')).toBeNull()
    expect(isRouteDeclared('/adminX')).toBe(false)
  })

  it('rutas fuera del panel no están declaradas y quedan abiertas', () => {
    expect(isRouteDeclared('/login')).toBe(false)
    expect(isRouteDeclared('/publico/algo')).toBe(false)
    expect(canAccessRoute('conductor', '/publico/algo')).toBe(true)
  })
})

describe('routeAccess — invariantes', () => {
  it('toda ruta declarada tiene al menos un rol y no tiene duplicados', () => {
    const rutas = [
      '/admin',
      '/admin/ordenes',
      '/admin/clientes',
      '/admin/conductores',
      '/admin/equipo',
      '/admin/metodos-pago',
      '/admin/notas-entrega',
      '/admin/perfil',
    ]
    for (const ruta of rutas) {
      const roles = rolesForPath(ruta)
      expect(roles, `${ruta} debería estar declarada`).not.toBeNull()
      expect(roles!.length, `${ruta} sin roles`).toBeGreaterThan(0)
      expect(new Set(roles!).size, `${ruta} con roles duplicados`).toBe(roles!.length)
    }
  })

  it('cada rol accede al Panel (todo rol logueado tiene una landing)', () => {
    for (const role of ROLES) {
      expect(canAccessRoute(role, '/admin'), role).toBe(true)
    }
  })
})
