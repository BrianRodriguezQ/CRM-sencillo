import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

export const TWO_FACTOR_STATUS_KEY = ['two-factor', 'status'] as const

/** ¿El usuario logueado ya tiene 2FA activado? */
export function useTwoFactorStatus() {
  return useQuery({
    queryKey: TWO_FACTOR_STATUS_KEY,
    queryFn: async () => {
      const res = await api.get<{ enabled: boolean }>('/auth/2fa/status')
      return res.data.enabled
    },
  })
}

/** Genera un secret nuevo (queda pendiente) y devuelve la URI otpauth para el QR. */
export function useStartTwoFactorSetup() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {})
      return res.data
    },
  })
}

/** Activa 2FA verificando el primer código. Los códigos de recuperación se ven UNA vez. */
export function useEnableTwoFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code })
      return res.data.recoveryCodes
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY })
    },
  })
}

/** Desactiva 2FA (exige la contraseña actual). */
export function useDisableTwoFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (password: string) => {
      await api.post('/auth/2fa/disable', { password })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY })
    },
  })
}
