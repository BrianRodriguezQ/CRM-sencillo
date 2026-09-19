/**
 * useSSE — Realtime CRM Batista (WP1).
 *
 * Conexión Server-Sent Events por fetch + ReadableStream.
 *
 * POR QUÉ NO EventSource nativo:
 *   El token JWT vive en header Authorization (Bearer), no en cookie.
 *   EventSource nativo no permite headers → habría que poner el token en un
 *   query string y quedaría expuesto en logs de proxy. Con fetch streaming
 *   mandamos el header y controlamos la reconexión.
 *
 * Comportamiento:
 *   - Conecta SOLO si hay usuario autenticado (se desmonta con logout).
 *   - Reconexión exponencial: 1s → 2s → 4s → 8s → 16s → 30s (cap).
 *   - En 401: intenta refresh (restoreSession). Si el refresh funciona,
 *     reconecta con el token nuevo; si no, se detiene sin hacer ruido.
 *   - Cada evento del backend invalida las queries afectadas en React Query:
 *       notification  → ['notifications', ...]        (badge + lista)
 *       order_changed → ['orders', ...]                (listas + detalle)
 *                       ['delivery-dashboard'...]      (dashboard realtime)
 *                       ['order-status-history'...]
 *                       ['order-communications'...]    (chat en vivo)
 *   - El polling 30s/60s existente NO se desactiva: queda como fallback
 *     silencioso si la conexión se cae (red, backend reiniciado).
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BASE_URL, getAuthToken, restoreSession } from '../api/client'

// Hono streamSSE emite: `event: <name>\ndata: <json>\n\n` (puede haber varias
// líneas `data:` por evento).
interface ParsedEvent {
  event: string | null
  data: string
}

function parseSSEChunk(chunk: string, acc: { buffer: string }): ParsedEvent | null {
  acc.buffer += chunk
  const events: ParsedEvent[] = []

  while (true) {
    const sep = acc.buffer.indexOf('\n\n')
    if (sep === -1) {
      // No hay evento completo aún; esperar más datos.
      // Si el buffer crece demasiado sin \n\n, cortar para evitar memory leak.
      if (acc.buffer.length > 16384) acc.buffer = acc.buffer.slice(-8192)
      return events.length ? events.shift() ?? null : null
    }

    const raw = acc.buffer.slice(0, sep)
    acc.buffer = acc.buffer.slice(sep + 2)

    let event: string | null = null
    const dataLines: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }

    events.push({ event, data: dataLines.join('\n') })
  }

  // Retornar el primer evento completo; los siguientes se procesarán en la próxima llamada.
  return events.shift() ?? null
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (parsed: ParsedEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const acc = { buffer: '' }
  const decoder = new TextDecoder()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal.aborted) return
    const { done, value } = await reader.read()
    if (done) return
    const text = decoder.decode(value, { stream: true })
    // Feed the entire chunk to the parser; it handles \n\n boundaries internally.
    const parsed = parseSSEChunk(text, acc)
    if (parsed) onEvent(parsed)
  }
}

/** Hook principal: montálo UNA vez por sesión autenticada (ver App/AdminLayout). */
export function useSSE(enabled: boolean) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'off'>('idle')
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!enabledRef.current) {
      setStatus('idle')
      return
    }

    const abortController = new AbortController()
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let disposed = false

    const handleEvent = (parsed: ParsedEvent) => {
      if (parsed.event === 'connected' || parsed.event === 'ping') return

      try {
        const payload = parsed.data ? JSON.parse(parsed.data) : {}
        if (parsed.event === 'notification') {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
        } else if (parsed.event === 'order_changed') {
          queryClient.invalidateQueries({ queryKey: ['orders'] })
          queryClient.invalidateQueries({ queryKey: ['delivery-dashboard'] })
          queryClient.invalidateQueries({ queryKey: ['order-status-history'] })
          queryClient.invalidateQueries({ queryKey: ['order-communications'] })
          // También invalidar detalle específico si el payload trae orderId
          if ('orderId' in payload && typeof payload.orderId === 'number') {
            queryClient.invalidateQueries({ queryKey: ['orders', 'detail', payload.orderId] })
            queryClient.invalidateQueries({ queryKey: ['order-status-history', payload.orderId] })
            queryClient.invalidateQueries({ queryKey: ['order-communications', payload.orderId] })
          }
        } else if (parsed.event && 'orderId' in payload && typeof payload.orderId === 'number') {
          // Evento con orden específica (cualquier nombre futuro): refrescar detalle.
          queryClient.invalidateQueries({ queryKey: ['orders', 'detail', payload.orderId] })
          queryClient.invalidateQueries({ queryKey: ['order-status-history', payload.orderId] })
          queryClient.invalidateQueries({ queryKey: ['order-communications', payload.orderId] })
        }
      } catch {
        // Evento no-JSON/desconocido: ignorar sin romper el stream.
      }
    }

    const connect = async () => {
      if (disposed || abortController.signal.aborted) return
      const token = getAuthToken()
      if (!token) {
        setStatus('off')
        return
      }

      setStatus(attempt === 0 ? 'connecting' : 'reconnecting')

      try {
        const res = await fetch(`${BASE_URL}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        })

        if (!res.ok || !res.body) {
          if (res.status === 401) {
            // Token vencido: intentar refresh una vez y reconectar con el nuevo.
            const refreshed = await restoreSession()
            if (refreshed && !disposed) {
              attempt++
              scheduleReconnect(0)
            } else {
              setStatus('off')
            }
            return
          }
          throw new Error(`SSE ${res.status}`)
        }

        attempt = 0
        setStatus('connected')

        const reader = res.body.getReader()
        await readStream(reader, handleEvent, abortController.signal)
        // Stream cerrado naturalmente → reconectar con backoff.
        scheduleReconnect()
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return
        scheduleReconnect()
      }
    }

    const scheduleReconnect = (baseDelay?: number) => {
      if (disposed || abortController.signal.aborted) return
      const delay =
        baseDelay ?? RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
      setStatus('reconnecting')
      reconnectTimer = setTimeout(() => {
        attempt++
        void connect()
      }, delay)
    }

    void connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      abortController.abort()
    }
  }, [queryClient])

  return { status }
}