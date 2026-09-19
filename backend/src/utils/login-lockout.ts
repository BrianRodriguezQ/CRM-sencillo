/**
 * Login lockout — bloqueo de cuenta por intentos fallidos.
 *
 * Estado EN MEMORIA, indexado por email (no por id de usuario): se pierde al
 * reiniciar el backend y no se comparte entre instancias. Si algún día corre
 * más de un proceso, hay que moverlo a la base de datos.
 *
 * Vive acá y no dentro de `routes/auth.ts` porque el reseteo de contraseña del
 * superadmin (`routes/users.ts`) también tiene que limpiar el contador: si no,
 * al empleado bloqueado se le cambia la clave y sigue bloqueado 15 minutos,
 * con lo cual la función parece no andar.
 */

/** Intentos fallidos dentro de la ventana antes de bloquear la cuenta. */
export const MAX_FAILED_ATTEMPTS = 10

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000 // ventana de conteo: 15 minutos
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // duración del bloqueo: 15 minutos

interface LockoutEntry {
  count: number
  windowStart: number
  lockedUntil: number | null
}

const failedLogins = new Map<string, LockoutEntry>()

// Limpieza cada 60s (más agresiva) + límite máximo
const MAX_ENTRIES = 5_000
const lockoutCleanup = setInterval(() => {
  const now = Date.now()
  let deleted = 0
  for (const [email, entry] of failedLogins) {
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      failedLogins.delete(email)
      deleted++
    } else if (!entry.lockedUntil && now - entry.windowStart > LOCKOUT_WINDOW_MS) {
      failedLogins.delete(email)
      deleted++
    }
  }
  // Límite duro
  if (failedLogins.size > 5_000) {
    const entries = Array.from(failedLogins.entries())
    entries.sort((a, b) => a[1].windowStart - b[1].windowStart)
    const toDelete = entries.slice(0, failedLogins.size - 5_000)
    for (const [email] of toDelete) failedLogins.delete(email)
  }
}, 60_000)
if (lockoutCleanup.unref) lockoutCleanup.unref()

export type LockStatus =
  { locked: true; remainingMs: number } | { locked: false; remainingMs?: undefined }

export function isLocked(email: string): LockStatus {
  const entry = failedLogins.get(email)
  if (!entry) return { locked: false }
  if (entry.lockedUntil) {
    const remaining = entry.lockedUntil - Date.now()
    if (remaining <= 0) {
      failedLogins.delete(email)
      return { locked: false }
    }
    return { locked: true, remainingMs: remaining }
  }
  return { locked: false }
}

export function recordFailedAttempt(email: string): void {
  const now = Date.now()
  const entry = failedLogins.get(email)
  if (!entry || now - entry.windowStart > LOCKOUT_WINDOW_MS) {
    failedLogins.set(email, { count: 1, windowStart: now, lockedUntil: null })
  } else {
    entry.count++
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_MS
    }
  }
}

export function clearFailedAttempts(email: string): void {
  failedLogins.delete(email)
}
