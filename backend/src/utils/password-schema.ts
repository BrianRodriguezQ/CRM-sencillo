/**
 * Esquema zod de contraseña — ÚNICA fuente de verdad para toda ruta que recibe
 * una contraseña: alta de usuario, reset del admin, rotación de temporal y
 * cambio propio.
 *
 * Antes cada ruta repetía el mismo bloque y ya se habían desincronizado: dos de
 * ellas pedían "al menos 6 caracteres" mientras la política real exige 8, así
 * que el mensaje que veía el usuario contradecía la regla.
 */
import { z } from 'zod'
import { validatePasswordPolicy } from './password-policy.js'

/** Límite duro de bcrypt: más de 72 bytes se ignoran silenciosamente. */
const MAX_LENGTH = 72

export const passwordSchema = z
  .string()
  .max(MAX_LENGTH, `La contraseña no puede superar los ${MAX_LENGTH} caracteres`)
  .superRefine((val, ctx) => {
    for (const message of validatePasswordPolicy(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    }
  })
