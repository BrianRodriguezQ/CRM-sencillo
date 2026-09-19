/**
 * Auditoría — helper único para el dominio nuevo (CRM Batista).
 *
 * Reemplaza event-bus.ts + security-events.ts (rotos: referenciaban tablas y
 * columnas del dominio viejo). Escribe directo en audit_log con las únicas
 * columnas que existen: userId, action, metadata (jsonb), ipAddress, createdAt.
 */
import type { Context } from 'hono'
import { db } from '../db/index.js'
import { auditLog } from '../db/schema.js'

/** Extrae la IP del cliente (firma del patrón del proyecto). */
export function clientIp(c: Context): string | undefined {
  return c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
}

export interface AuditLogInput {
  /**
   * `null` cuando el evento no tiene usuario detras: el caso real es un intento
   * de login contra un email que no existe. Escribir un centinela (0) rompia la
   * FK y el registro se perdia.
   */
  userId: number | null
  action: string
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

/**
 * Registra una acción de auditoría. Es defensiva: si falla el INSERT no tira
 * la request — la auditoría nunca debe romper la operación principal.
 *
 * OJO: que sea defensiva NO significa que se ignoren los fallos. Si el INSERT
 * falla se pierde un registro de auditoría, así que se loguea fuerte y con la
 * acción incluida. Si aparece este mensaje en los logs, hay un problema real de
 * esquema o de datos (ya pasó una vez: ver migración 0004).
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      action: input.action.slice(0, 50),
      metadata: input.metadata as never,
      ipAddress: input.ipAddress ?? null,
    })
  } catch (error) {
    console.error(
      `[AUDIT] FALLO al registrar la accion "${input.action}" (userId=${String(input.userId)}):`,
      error,
    )
  }
}
