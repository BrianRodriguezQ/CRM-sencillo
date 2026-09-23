import type { UserRole } from '../context/AuthContext'

/**
 * Fuente ÚNICA de verdad del acceso por rol en el panel.
 *
 * La consumen dos lugares que antes decidían por su cuenta:
 *   1. El menú lateral → qué links se muestran.
 *   2. El guard del layout → qué pantallas se pueden abrir tecleando la URL.
 *
 * Si esos dos criterios divergieran, un rol podría abrir pantallas que no le
 * corresponden (ocultas en el menú pero accesibles por URL). Con un solo mapa
 * eso no puede pasar.
 *
 * El match es por PREFIJO MÁS LARGO, así `/admin/ordenes/34` resuelve a
 * `/admin/ordenes`.
 *
 * Las rutas NO declaradas quedan permitidas (no rompe rutas nuevas); declarar
 * el acceso es responsabilidad de quien agrega la ruta.
 */
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/admin': ['superadmin', 'operador', 'conductor'],
  '/admin/ordenes': ['superadmin', 'operador', 'conductor'],
  // El conductor recibe y ejecuta órdenes; NO crea (el backend también lo exige).
  '/admin/ordenes/nueva': ['superadmin', 'operador'],
  '/admin/clientes': ['superadmin', 'operador'],
  // Ruta legacy: redirige a /admin/equipo/conductores (se mantiene declarada
  // para que el guard no la abra a roles indebidos mientras vive el redirect).
  '/admin/conductores': ['superadmin'],
  '/admin/equipo': ['superadmin'],
  '/admin/equipo/conductores': ['superadmin'],
  '/admin/equipo/operadores': ['superadmin'],
  '/admin/metodos-pago': ['superadmin'],
  '/admin/notas-entrega': ['superadmin', 'operador'],
  '/admin/perfil': ['superadmin', 'operador', 'conductor'],
}

/** Roles que pueden ver `pathname`, o `null` si la ruta no está restringida. */
export function rolesForPath(pathname: string): UserRole[] | null {
  const match = Object.keys(ROUTE_ROLES)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0]

  return match ? (ROUTE_ROLES[match] ?? null) : null
}

/** ¿El rol puede abrir esta ruta? Rutas no declaradas → permitido. */
export function canAccessRoute(role: UserRole | undefined, pathname: string): boolean {
  const allowed = rolesForPath(pathname)
  if (!allowed) return true
  if (!role) return false
  return allowed.includes(role)
}

/**
 * ¿La ruta está declarada en el mapa?
 *
 * Ojo: una ruta NO declarada queda abierta a TODOS los roles. Por eso el
 * invariante que hay que cuidar es "todo link del menú está declarado" —
 * hay un test que lo verifica.
 */
export function isRouteDeclared(pathname: string): boolean {
  return rolesForPath(pathname) !== null
}
