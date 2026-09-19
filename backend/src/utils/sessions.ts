/**
 * D2 — Sesiones con refresh token rotation.
 *
 * Modelo:
 *  - Login crea una FAMILIA (family_id) con el primer refresh token.
 *  - Cada refresh rota: nuevo refresh en la familia + el viejo queda revocado.
 *  - Reutilizar un refresh ya rotado = señal de robo → se revoca TODA la familia
 *    (todas las pestañas/dispositivos de esa sesión original mueren).
 *  - Grace period de 30s: dos pestañas refrescando a la vez con el mismo token
 *    no disparan falso positivo de robo — la segunda recibe el mismo resultado.
 *
 * El refresh NUNCA se guarda en claro: solo SHA-256. Filtrar la DB no filtra sesiones.
 */

import { createHash, randomBytes, randomUUID } from 'crypto'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 días
const ROTATION_GRACE_MS = 30_000

export class SessionError extends Error {
  code: 'INVALID' | 'EXPIRED' | 'REUSE_DETECTED'
  constructor(code: SessionError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

interface SessionMeta {
  userAgent?: string | null
  ip?: string | null
}

/** Crea una nueva familia de sesión para el usuario y devuelve el refresh token EN CLARO (una sola vez). */
export async function createSession(
  userId: number,
  meta: SessionMeta,
): Promise<{ sessionId: number; refreshToken: string }> {
  const refreshToken = generateRefreshToken()
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      familyId: randomUUID(),
      refreshHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      lastUsedAt: new Date(),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ip: meta.ip ?? null,
    })
    .returning({ id: sessions.id })

  return { sessionId: row.id, refreshToken }
}

/**
 * Rota un refresh token: valida, revoca el viejo y emite uno nuevo de la misma familia.
 * - INVALID/EXPIRED → no existe o venció (sin drama).
 * - REUSE_DETECTED → el token ya fue usado antes de su grace period → robo →
 *   se revoca toda la familia y se lanza error.
 */
export async function rotateRefreshToken(
  refreshToken: string,
): Promise<{ sessionId: number; userId: number; refreshToken: string }> {
  const hash = hashToken(refreshToken)

  const [current] = await db.select().from(sessions).where(eq(sessions.refreshHash, hash)).limit(1)

  if (!current) throw new SessionError('INVALID', 'Refresh token inválido')

  if (new Date() > new Date(current.expiresAt)) {
    throw new SessionError('EXPIRED', 'Sesión expirada. Iniciá sesión nuevamente.')
  }

  if (current.revokedAt !== null) {
    const sinceRevocation = Date.now() - new Date(current.revokedAt).getTime()

    if (sinceRevocation > ROTATION_GRACE_MS) {
      // Reuso REAL fuera del grace period → robo detectado → matar la familia completa
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, current.familyId), isNull(sessions.revokedAt)))
      throw new SessionError('REUSE_DETECTED', 'Sesión invalidada por seguridad.')
    }

    // Dentro del grace period: carrera benigna entre pestañas.
    // Entregar el token ACTIVO más reciente de la familia (ya rotado por la otra pestaña).
    const [active] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.familyId, current.familyId), isNull(sessions.revokedAt)))
      .limit(1)

    if (!active) throw new SessionError('INVALID', 'Sesión inválida')

    return { sessionId: active.id, userId: active.userId, refreshToken: '' }
  }

  // Rotación normal: revocar actual + emitir nuevo de la misma familia
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, current.id))

  const refreshTokenNew = generateRefreshToken()
  const [rotated] = await db
    .insert(sessions)
    .values({
      userId: current.userId,
      familyId: current.familyId,
      refreshHash: hashToken(refreshTokenNew),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      lastUsedAt: new Date(),
      userAgent: current.userAgent,
      ip: current.ip,
    })
    .returning({ id: sessions.id })

  return { sessionId: rotated.id, userId: current.userId, refreshToken: refreshTokenNew }
}

/** Revoca UNA sesión (logout). Idempotente. */
export async function revokeSession(sessionId: number): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId))
}

/** Devuelve la sesión de un refresh token en claro (para auditoría ANTES de revocar). */
export async function getSessionByRefreshToken(
  refreshToken: string,
): Promise<{ sessionId: number; userId: number } | null> {
  const [current] = await db
    .select({ sessionId: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.refreshHash, hashToken(refreshToken)))
    .limit(1)
  return current ?? null
}

/** Revoca la sesión que corresponde a un refresh token en claro (logout). Idempotente. */
export async function revokeByRefreshToken(refreshToken: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.refreshHash, hashToken(refreshToken)))
}

/**
 * Revoca TODAS las sesiones activas del usuario (cambio de contraseña, desactivación).
 *
 * `keepSessionId` permite salvar la sesión que está haciendo el cambio: si un
 * usuario cambia su propia contraseña, no tiene sentido expulsarlo justo cuando
 * acaba de demostrar que es él. Las demás sesiones (otros dispositivos) sí mueren.
 */
export async function revokeAllUserSessions(userId: number, keepSessionId?: number): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        keepSessionId === undefined ? undefined : ne(sessions.id, keepSessionId),
      ),
    )
}
