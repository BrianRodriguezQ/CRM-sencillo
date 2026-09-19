/**
 * Sanitización de inputs — Stripea HTML tags de strings
 * para prevenir XSS en texto plano.
 */

export function stripHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').trim()
}

/**
 * Schema helper para aplicar stripHtml en un string Zod.
 * Uso: z.string().pipe(strippedString)
 */
import { z } from 'zod'

export const strippedString = z.string().transform((v) => stripHtml(v))

export const strippedEmail = z
  .string()
  .email()
  .transform((v) => stripHtml(v.toLowerCase()))
