import { useMutation } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { User } from '../../context/AuthContext'

export interface ChangePasswordPayload {
  /** La contraseña que el usuario tiene ahora (el backend la verifica). */
  currentPassword: string
  newPassword: string
}

/**
 * Cambio de contraseña del propio usuario logueado.
 *
 * NO confundir con `completePasswordChange` del AuthContext: esa es la rotación
 * de una contraseña TEMPORAL en medio del login (usa un challenge token, todavía
 * no hay sesión). Esta es para alguien que ya está adentro y quiere cambiarla.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const res = await api.post<{ user: User }>('/auth/change-password', payload)
      return res.data.user
    },
  })
}

export interface UpdateProfilePayload {
  name?: string
  lastName?: string | null
  cedula?: string | null
  address?: string | null
  phone?: string | null
}

/**
 * Actualización de los datos del perfil del propio usuario (PATCH /auth/profile).
 * El email NO se edita desde acá (el backend lo ignora / no lo acepta).
 */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const res = await api.patch<{ user: User }>('/auth/profile', payload)
      return res.data.user
    },
  })
}

/**
 * Subida de imagen de perfil (POST /auth/avatar, multipart field `file`).
 * Acepta PNG / JPG / WebP hasta 2MB (lo valida el backend).
 */
export function useUploadAvatar() {
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await api.post<{ avatarUrl: string }>('/auth/avatar', formData)
      return res.data.avatarUrl
    },
  })
}
