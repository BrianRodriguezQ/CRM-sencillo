import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { User, UserRole } from '../../context/AuthContext'

export interface UsersList {
  items: User[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface Driver {
  id: number
  name: string
  phone?: string | null
  activeOrderCount: number
}

/** Vendedor tal como lo devuelve GET /users/sellers (solo superadmin). */
export interface Seller {
  id: number
  name: string
  phone?: string | null
  email: string
  isActive: boolean
  /** Total de órdenes que levantó (independiente del período). */
  orderCount: number
}

export function useDriversList() {
  return useQuery({
    queryKey: ['users', 'drivers'],
    queryFn: async () => {
      const res = await api.get<{ items: Driver[] }>('/users/drivers')
      return res.data?.items ?? []
    },
  })
}

export interface SellersListParams {
  page?: number
  perPage?: number
  search?: string
  isActive?: boolean
}

export interface SellersList {
  items: Seller[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

export function useSellersList(params: SellersListParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('perPage', String(params.perPage))
  if (params.search) searchParams.set('search', params.search)
  if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive))
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['users', 'sellers', params],
    queryFn: async () => {
      const res = await api.get<SellersList>(`/users/sellers${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

export interface UsersListParams {
  page?: number
  perPage?: number
  role?: UserRole | ''
  isActive?: boolean
  search?: string
}

export function useUsersList(params: UsersListParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('perPage', String(params.perPage))
  if (params.role) searchParams.set('role', params.role)
  if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive))
  if (params.search) searchParams.set('search', params.search)
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const res = await api.get<UsersList>(`/users${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

export interface CreateUserPayload {
  name: string
  lastName?: string | null
  cedula?: string | null
  address?: string | null
  email: string
  role: UserRole
  phone?: string | null
  /**
   * TEMPORAL y OBLIGATORIA: el backend la exige (`createUserSchema`) y crea al
   * usuario con `mustChangePassword = 1`, así que el empleado tiene que
   * cambiarla en su primer login. Antes era opcional acá y la pantalla no la
   * mandaba: el alta fallaba con 400 y TypeScript no decía nada.
   */
  password: string
}

export interface UpdateUserPayload {
  name?: string
  lastName?: string | null
  cedula?: string | null
  address?: string | null
  email?: string
  role?: UserRole
  phone?: string | null
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await api.post<{ user: User }>('/users', payload)
      return res.data.user
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: UpdateUserPayload }) => {
      const res = await api.patch<{ user: User }>(`/users/${id}`, payload)
      return res.data.user
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/**
 * El superadmin le deja a un miembro una contraseña TEMPORAL. El backend
 * revoca las sesiones activas y obliga a cambiarla en el primer login.
 */
export function useResetUserPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await api.post<{ user: User }>(`/users/${id}/reset-password`, { password })
      return res.data.user
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useToggleUserActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post<{ user: User }>(`/users/${id}/toggle-active`)
      return res.data.user
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
