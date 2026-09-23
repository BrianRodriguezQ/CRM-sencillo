/**
 * Middleware de autenticación — L&L System CRM.
 *
 * Roles: superadmin | operador | cobranza | conductor.
 * Sin companies: este sistema es single-tenant (una empresa por instalación).
 * Verificación de usuario activo en cada request (1 query indexada por PK).
 */
import type { Context, Next } from 'hono'
import { verifyToken, type JWTPayload, type Role } from '../utils/jwt.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

type Variables = { user: JWTPayload }

export async function authMiddleware(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization')
  let token: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  if (!token) {
    return c.json({ success: false, error: 'Token no proporcionado' }, 401)
  }

  try {
    const payload = verifyToken(token)

    // Re-verificar que el usuario siga ACTIVO en la DB. El JWT dura ~15 min;
    // si el superadmin desactivó al usuario, su token vigente no debe operar.
    const [row] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1)

    if (!row || !row.isActive) {
      return c.json({ success: false, error: 'Usuario desactivado. Contactá al superadmin.' }, 403)
    }

    c.set('user', payload)
    await next()
  } catch {
    return c.json({ success: false, error: 'Token inválido o expirado' }, 401)
  }
}

/** requireRole — verifica que el usuario tenga UNO de los roles indicados. */
export function requireRole(...roles: Role[]) {
  return async (c: Context<{ Variables: Variables }>, next: Next) => {
    const user = c.get('user') as JWTPayload | undefined
    if (!user) {
      return c.json({ success: false, error: 'No autenticado' }, 401)
    }
    if (!roles.includes(user.role)) {
      return c.json({ success: false, error: 'No tienes permisos para esta acción' }, 403)
    }
    await next()
  }
}

/** requireSuperadmin — solo el dueño del sistema. */
export const requireSuperadmin = requireRole('superadmin')

/** requireOperador — operador o superadmin. */
export const requireOperador = requireRole('superadmin', 'operador')

/** requireCobranza — cobranza o superadmin. */
export const requireCobranza = requireRole('superadmin', 'cobranza')

/** requireConductor — conductor, operador, cobranza o superadmin. */
export const requireConductor = requireRole('superadmin', 'operador', 'cobranza', 'conductor')
