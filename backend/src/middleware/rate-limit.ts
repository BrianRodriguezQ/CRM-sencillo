/**
 * Rate Limiter — In-memory sliding window
 *
 * Simple, sin dependencias externas. Cada ventana se limpia sola.
 * Para producción con múltiples instancias, reemplazar por Redis.
 *
 * ⚠️ CADA instancia tiene su propio store — no comparten contadores.
 *    Así el rate limit global de 100 req/min no interfiere con
 *    el rate limit de login de 5 intentos/min.
 */

import type { Context, Next } from 'hono'

interface Entry {
  count: number
  resetAt: number
}

export interface RateLimitOptions {
  windowMs: number // Ventana en milisegundos
  max: number // Máximo de requests en la ventana
  message?: string // Mensaje de error
  /** Paths que NO se cuentan (exactos o prefijos). Ej: rutas SSE. */
  skipPaths?: string[]
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message, skipPaths = [] } = options

  // Store PRIVADO por instancia — cada rateLimit() tiene el suyo
  const store = new Map<string, Entry>()

  // Limpieza cada 30s (más agresiva) + límite máximo de entradas
  const MAX_ENTRIES = 10_000
  const cleanup = setInterval(() => {
    const now = Date.now()
    let deleted = 0
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key)
        deleted++
      }
    }
    // Si aún así hay muchas entradas, borrar las más antiguas
    if (store.size > MAX_ENTRIES) {
      const entries = Array.from(store.entries())
      entries.sort((a, b) => a[1].resetAt - b[1].resetAt)
      const toDelete = entries.slice(0, store.size - MAX_ENTRIES)
      for (const [key] of toDelete) store.delete(key)
    }
  }, 30_000)

  // Permitir que el cleanup no evite que el proceso termine
  if (cleanup.unref) cleanup.unref()

  return async (c: Context, next: Next) => {
    // Skip paths: rutas long-lived (SSE) que no deben contar requests.
    const path = c.req.path
    if (skipPaths.some((p) => path === p || path.startsWith(p))) {
      await next()
      return
    }

    // Get client IP — use first IP from x-forwarded-for (added by trusted proxy)
    // Strip port, take only first IP to prevent header spoofing
    const forwarded = c.req.header('x-forwarded-for')
    const realIp = c.req.header('x-real-ip')
    const cfIp = c.req.header('cf-connecting-ip') // Cloudflare

    let clientIp = 'global'
    if (cfIp) {
      clientIp = cfIp.split(',')[0].trim().split(':')[0]
    } else if (forwarded) {
      clientIp = forwarded.split(',')[0].trim().split(':')[0]
    } else if (realIp) {
      clientIp = realIp.split(':')[0]
    }

    const key = clientIp
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++

    // Set headers
    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > max) {
      return c.json(
        {
          success: false,
          error: message || 'Demasiadas solicitudes. Intentá de nuevo en un minuto.',
        },
        429,
      )
    }

    await next()
  }
}
