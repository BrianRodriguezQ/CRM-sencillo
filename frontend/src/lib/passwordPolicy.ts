/**
 * Política de contraseñas del lado del cliente.
 *
 * Es un ESPEJO de `backend/src/utils/password-policy.ts`: la validación real la
 * hace el backend, esto solo sirve para avisar antes de mandar el formulario.
 * Si cambia una regla, hay que cambiar las dos.
 */

export const PASSWORD_MIN_LENGTH = 8

/** Texto de ayuda para los formularios que piden una contraseña. */
export const PASSWORD_HINT =
  'Mínimo 8 caracteres, con mayúscula, número y símbolo (ej: Batista2026!)'

/**
 * Devuelve la lista de problemas de una contraseña (vacía = válida).
 * Mismo orden y mismos mensajes que el backend.
 */
export function validatePassword(password: string): string[] {
  const errors: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Usá al menos una letra minúscula')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Usá al menos una letra mayúscula')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Usá al menos un número')
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Usá al menos un símbolo (ej: !@#$%^&*)')
  }
  return errors
}
