import { describe, it, expect } from 'vitest'
import { passwordSchema } from './password-schema.js'

/** Helper: primer mensaje de error, o null si el valor es válido. */
function firstError(value: unknown): string | null {
  const result = passwordSchema.safeParse(value)
  if (result.success) return null
  return result.error.issues[0]?.message ?? null
}

describe('passwordSchema', () => {
  it('acepta una contraseña que cumple la política', () => {
    expect(firstError('Batista2026!')).toBeNull()
  })

  it('exige el mínimo de 8 caracteres (no 6)', () => {
    expect(firstError('Ab1!')).toBe('La contraseña debe tener al menos 8 caracteres')
  })

  it('exige una minúscula', () => {
    expect(firstError('BATISTA2026!')).toBe('Usá al menos una letra minúscula')
  })

  it('exige una mayúscula', () => {
    expect(firstError('batista2026!')).toBe('Usá al menos una letra mayúscula')
  })

  it('exige un número', () => {
    expect(firstError('Batista!!')).toBe('Usá al menos un número')
  })

  it('exige un símbolo', () => {
    expect(firstError('Batista2026')).toBe('Usá al menos un símbolo (ej: !@#$%^&*)')
  })

  it('rechaza valores que no son string', () => {
    expect(firstError(12345678)).not.toBeNull()
    expect(firstError(undefined)).not.toBeNull()
  })

  it('rechaza más de 72 caracteres (límite de bcrypt)', () => {
    const long = 'Aa1!' + 'x'.repeat(70)
    expect(firstError(long)).toBe('La contraseña no puede superar los 72 caracteres')
  })

  it('lista TODOS los problemas a la vez', () => {
    const result = passwordSchema.safeParse('abc')
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('La contraseña debe tener al menos 8 caracteres')
      expect(messages).toContain('Usá al menos una letra mayúscula')
      expect(messages).toContain('Usá al menos un número')
      expect(messages).toContain('Usá al menos un símbolo (ej: !@#$%^&*)')
    }
  })
})
