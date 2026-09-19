export const PASSWORD_POLICY_MIN_LENGTH = 8

export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = []
  if (password.length < PASSWORD_POLICY_MIN_LENGTH) {
    errors.push(`La contraseña debe tener al menos ${PASSWORD_POLICY_MIN_LENGTH} caracteres`)
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
