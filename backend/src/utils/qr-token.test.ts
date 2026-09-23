import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signQrToken, verifyQrToken } from './qr-token.js'

const ORIGINAL = process.env.JWT_SECRET

describe('qr-token (WP3)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-crm'
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = ORIGINAL
  })

  it('firma y verifica un token de orden', () => {
    const token = signQrToken(42)
    expect(verifyQrToken(token)).toBe(42)
  })

  it('tokens distintos para la misma orden (nonce)', () => {
    const a = signQrToken(7)
    const b = signQrToken(7)
    expect(a).not.toBe(b)
    // Ambos resuelven a la misma orden.
    expect(verifyQrToken(a)).toBe(7)
    expect(verifyQrToken(b)).toBe(7)
  })

  it('rechaza tokens adulterados', () => {
    const token = signQrToken(9)
    // Alterar el payload (mantener firma) → debe fallar.
    const [payload] = token.split('.')
    const tampered = `${payload.slice(0, -2)}XX.${token.split('.').pop()}`
    expect(verifyQrToken(tampered)).toBeNull()
  })

  it('rechaza firmas de otro secreto', () => {
    const token = signQrToken(9)
    process.env.JWT_SECRET = 'otro-secreto'
    expect(verifyQrToken(token)).toBeNull()
  })

  it('rechaza basura y formatos inválidos', () => {
    expect(verifyQrToken('')).toBeNull()
    expect(verifyQrToken('abc')).toBeNull()
    expect(verifyQrToken('eyJ.abc')).toBeNull()
  })
})
