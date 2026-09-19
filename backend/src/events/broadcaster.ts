/**
 * Broadcaster SSE — CRM Batista (WP1 realtime).
 *
 * Hub en memoria de conexiones SSE por usuario. Cada conexión es un "sink"
 * con userId + role. Emisión dirigida:
 *   - emitToUser(userId, ...)  → solo ese usuario (notificaciones, chat)
 *   - emitToRole(role, ...)    → todos los conectados de un rol (dashboard,
 *                                 superadmin veee todo)
 *   - emitToAll(...)           → broadcast completo (último recurso)
 *
 * ⚠️ En memoria: por instancia. Si mañana hay N instancias backend, este hub
 *    debe pasar a Redis pub/sub. Hoy (un solo servidor) es suficiente y es
 *    la elección más simple que mantiene el orden de los eventos.
 */

import type { Role } from '../utils/jwt.js'

export interface SSEConnection {
  id: string
  userId: number
  role: Role
  /** Escribe un evento al stream del cliente. Nunca debe lanzar. */
  write: (event: string, data: unknown) => void
  /** Timestamp de la última actividad (heartbeat/ping exitoso) */
  lastActivity: number
}

/** userId → conexiones abiertas (un usuario puede tener varias pestañas). */
const connections = new Map<number, Set<SSEConnection>>()

function safeWrite(conn: SSEConnection, event: string, data: unknown): boolean {
  try {
    conn.write(event, data)
    conn.lastActivity = Date.now()
    return true
  } catch {
    // Stream roto: el onAbort de la ruta lo limpiará; acá no podemos fallar.
    return false
  }
}

export function onConnect(userId: number, role: Role, write: SSEConnection['write']): string {
  const conn: SSEConnection = { id: crypto.randomUUID(), userId, role, write, lastActivity: Date.now() }
  let set = connections.get(userId)
  if (!set) {
    set = new Set()
    connections.set(userId, set)
  }
  set.add(conn)
  return conn.id
}

export function onDisconnect(userId: number, connId: string): void {
  const set = connections.get(userId)
  if (!set) return
  for (const conn of set) {
    if (conn.id === connId) {
      set.delete(conn)
      break
    }
  }
  if (set.size === 0) connections.delete(userId)
}

/** Envía un evento a todas las pestañas de un usuario. */
export function emitToUser(userId: number, event: string, data: unknown): void {
  const set = connections.get(userId)
  if (!set || set.size === 0) return
  for (const conn of set) safeWrite(conn, event, data)
}

/** Envía un evento a todos los conectados con un rol (ej: superadmin). */
export function emitToRole(role: Role, event: string, data: unknown): void {
  for (const set of connections.values()) {
    for (const conn of set) {
      if (conn.role === role) safeWrite(conn, event, data)
    }
  }
}

/** Broadcast a todas las conexiones activas. */
export function emitToAll(event: string, data: unknown): void {
  for (const set of connections.values()) {
    for (const conn of set) safeWrite(conn, event, data)
  }
}

// ─── Safety Net: limpieza periódica de conexiones muertas ───
// Si onAbort no dispara (corte de red brusco, proxy, etc.), la conexión
// queda en el mapa para siempre. Cada 60s escaneamos y removemos las
// que no tuvieron actividad en 120s (2 heartbeats perdidos).
const CLEANUP_INTERVAL_MS = 60_000
const MAX_INACTIVITY_MS = 120_000
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [userId, set] of connections) {
    for (const conn of set) {
      if (now - conn.lastActivity > MAX_INACTIVITY_MS) {
        set.delete(conn)
      }
    }
    if (set.size === 0) connections.delete(userId)
  }
}, 60_000)

if (cleanupInterval.unref) cleanupInterval.unref()

export function sseStats(): { connections: number; users: number } {
  let connectionsCount = 0
  for (const set of connections.values()) connectionsCount += set.size
  return { connections: connectionsCount, users: connections.size }
}