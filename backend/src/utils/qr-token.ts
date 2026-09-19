/**
 * qr-token — firma HMAC para la ficha digital pública de una orden (WP3).
 *
 * El QR de la Nota de Entrega apunta a `/entrega/{token}`; el token es una
 * carga cifrada con HMAC-SHA256 derivada del JWT_SECRET. Así:
 *   - Cualquiera que vea el QR puede abrir la ficha (caso de uso: el cliente
 *     escanea y ve LA HOJA DIGITALIZADA de su entrega — respaldo vivo).
 *   - Nadie puede fabricar un token de una orden que no exista (anti-estafa:
 *     una "nota" apócrifa no escanea a un documento válido).
 *   - No se exponen IDs secuenciales adivinables: un token no implica el orden
 *     interno de la DB.
 *
 * Formato: base64url(JSON{ o: orderId, i: intentoHash, s: HMAC })
 * El "intento" es un hash del token completo: sin él, dos órdenes con los
 * mismos bytes de payload tendrían token idéntico (no es un bug, pero
 * dificulta distinguir visualmente un QR de otro).
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return secret
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

export function signQrToken(orderId: number): string {
  const secret = getSecret()
  // Componente aleatorio: hace que dos tokens de la MISMA orden (impresos en
  // momentos distintos) no sean byte-idénticos.
  const nonce = randomUUID()
  const payload = b64url(JSON.stringify({ o: orderId, n: nonce }))
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyQrToken(token: string): number | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot <= 0) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!payload || !sig) return null

    const secret = getSecret()
    const expected = createHmac('sha256', secret).update(payload).digest('base64url')
    const expectedBuf = Buffer.from(expected, 'base64url')
    const sigBuf = Buffer.from(sig, 'base64url')
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
      return null
    }

    const parsed = JSON.parse(b64urlDecode(payload)) as { o?: unknown }
    if (typeof parsed.o !== 'number' || !Number.isInteger(parsed.o) || parsed.o <= 0) return null
    return parsed.o
  } catch {
    return null
  }
}