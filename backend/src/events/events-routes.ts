/**
 * Ruta SSE — CRM Batista (WP1 realtime).
 *
 * GET /api/events — stream Server-Sent Events autenticado.
 *
 * Por qué NO EventSource nativo:
 *   El token JWT viaja en header Authorization (Bearer), no en cookie.
 *   EventSource nativo no permite headers → usaríamos query string y el
 *   token quedaría en logs de nginx/proxy. Con fetch + ReadableStream
 *   podemos mandar el header y reconectar con backoff (ver hook useSSE).
 *
 * Detalles de transporte:
 *   - Heartbeat cada 20s (proxies cierran conexiones idle).
 *   - X-Accel-Buffering: no → evita que nginx bufferé el stream.
 *   - Excluida del rate-limit global (una conexión viva no debe contar
 *     requests; las reconexiones con backoff tampoco).
 *   - onAbort limpia el broadcaster (pestaña cerrada / red caída).
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { authMiddleware } from '../middleware/auth.js'
import { onConnect, onDisconnect } from '../events/broadcaster.js'

const eventsRoutes = new Hono()

eventsRoutes.get('/', authMiddleware, (c) => {
  const user = c.get('user')!

  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('Connection', 'keep-alive')
  c.header('X-Accel-Buffering', 'no')

  return streamSSE(c, async (stream) => {
    // Registrar la conexión; el broadcaster escribe en el stream real.
    const connId = onConnect(user.id, user.role, (event, data) => {
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
        // Stream roto → onAbort limpiará la conexión.
      })
    })

    // Heartbeat: mantiene viva la conexión frente a proxies/nginx.
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: JSON.stringify({ t: Date.now() }) }).catch(() => {})
    }, 20_000)
    if (typeof heartbeat.unref === 'function') heartbeat.unref()

    stream.onAbort(() => {
      clearInterval(heartbeat)
      onDisconnect(user.id, connId)
    })

    // Confirmación de conexión + espera pasiva hasta que el cliente aborte.
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ ok: true }) })
    await stream.aborted
  })
})

export default eventsRoutes