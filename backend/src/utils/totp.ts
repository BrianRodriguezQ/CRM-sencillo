/**
 * D1 — Utilidades 2FA TOTP.
 * - Secret cifrado en reposo con AES-256-GCM (clave derivada de TOTP_ENCRYPTION_KEY || JWT_SECRET)
 * - Códigos de recuperación single-use, guardados como SHA-256 hex
 */
import crypto from 'node:crypto'
import { generateSecret } from 'otplib'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I (no ambiguos)

function getEncryptionKey(): Buffer {
  const material = process.env.TOTP_ENCRYPTION_KEY ?? process.env.JWT_SECRET
  if (!material) {
    throw new Error('Falta TOTP_ENCRYPTION_KEY o JWT_SECRET para cifrar secrets 2FA')
  }
  // scrypt deriva 32 bytes estables aunque el material cambie de largo
  return crypto.scryptSync(material, 'spi-totp-salt-v1', 32)
}

/** Normaliza input del usuario: saca espacios/guiones, mayúsculas */
export function normalizeOtpCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

/** Cifra el secret TOTP → "iv:tag:ciphertext" (hex) */
export function encryptTotpSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

/** Descifra "iv:tag:ciphertext" → secret base32. Devuelve null si está corrupto. */
export function decryptTotpSecret(enc: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = enc.split(':')
    if (!ivHex || !tagHex || !dataHex) return null
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivHex, 'hex'),
    )
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return null // tag inválido o formato corrupto
  }
}

/** Genera un nuevo secret base32 para Google Authenticator */
export function newTotpSecret(): string {
  return generateSecret()
}

/** Genera N códigos de recuperación con formato XXXX-XXXX */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    let code = ''
    for (let j = 0; j < 8; j++) {
      code += ALPHABET[crypto.randomInt(0, ALPHABET.length)]
      if (j === 3) code += '-'
    }
    codes.push(code)
  }
  return codes
}

/** SHA-256 hex del código normalizado (para almacenar hashes, nunca texto plano) */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeOtpCode(code)).digest('hex')
}
