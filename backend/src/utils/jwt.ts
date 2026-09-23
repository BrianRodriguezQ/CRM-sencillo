import jwt from 'jsonwebtoken'

/**
 * Roles del sistema (post-refactor 2026):
 * - superadmin: acceso total
 * - operador: antes "operador" — toma pedidos, gestiona sus clientes
 * - cobranza: gestiona cobros, cuentas por cobrar, resumen financiero, notas de entrega
 * - conductor: solo lectura, ve sus entregas asignadas
 */
export type Role = 'superadmin' | 'operador' | 'cobranza' | 'conductor'

export type JWTPayload = {
  id: number
  email: string
  role: Role
  /** D2: id de la sesión dueña de este access token */
  sid?: number
  /** D2: tipo de token — los access tokens lo declaran; tokens legacy no */
  type?: 'access'
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return secret
}

/**
 * Access token de corta vida (15 min). La sesión real vive en `sessions`
 * y se extiende vía refresh token con rotación.
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, getSecret(), { expiresIn: '15m' })
}

export function verifyToken(token: string): JWTPayload {
  const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as JWTPayload
  if (payload.type !== undefined && payload.type !== 'access') {
    throw new jwt.JsonWebTokenError('Tipo de token inválido')
  }
  return payload
}

/* ── D1: challenge token para el paso 2 del login con 2FA ── */

export type ChallengePayload = { id: number; type: 'challenge' }

export function generateChallengeToken(userId: number): string {
  return jwt.sign({ id: userId, type: 'challenge' } satisfies ChallengePayload, getSecret(), {
    expiresIn: '5m',
    algorithm: 'HS256',
  })
}

export function verifyChallengeToken(token: string): ChallengePayload {
  const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as ChallengePayload
  if (payload.type !== 'challenge' || typeof payload.id !== 'number') {
    throw new jwt.JsonWebTokenError('Tipo de token inválido')
  }
  return { id: payload.id, type: 'challenge' }
}
