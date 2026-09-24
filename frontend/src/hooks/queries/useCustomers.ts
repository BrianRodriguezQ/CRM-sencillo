import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

export interface Customer {
  id: number
  name: string
  // RIF venezolano: "J-123456789" (prefijo fijo J- + números que completa el operador)
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  createdBy?: number | null
  // Grupo/franquicia
  isGroup?: boolean
  parentId?: number | null
  // Campos de sucursal (para branches)
  contactPerson?: string | null
  isBillingAddress?: boolean
  isDeliveryAddress?: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Sucursales activas del cliente (badge "N sedes" en la lista unificada)
  branchCount?: number
  // Sucursales anidadas (solo cuando el detalle pide un grupo)
  branches?: Branch[]
}

export interface CustomersList {
  items: Customer[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface CustomersListParams {
  page?: number
  perPage?: number
  search?: string
  isActive?: boolean
}

export function useCustomersList(params: CustomersListParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('perPage', String(params.perPage))
  if (params.search) searchParams.set('search', params.search)
  if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive))
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => {
      const res = await api.get<CustomersList>(`/customers${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

/** Grupos/franquicias (isGroup=true) para selector en órdenes. */
export function useCustomerGroups(params: CustomersListParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('perPage', String(params.perPage))
  if (params.search) searchParams.set('search', params.search)
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['customers', 'groups', params],
    queryFn: async () => {
      const res = await api.get<CustomersList>(`/customers/groups${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

/** Sucursales de un grupo/franquicia. */
export interface Branch {
  id: number
  name: string
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  contactPerson?: string | null
  isBillingAddress?: boolean
  isDeliveryAddress?: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BranchesList {
  branches: Branch[]
}

export function useBranches(groupId: number | null) {
  return useQuery({
    queryKey: ['customers', 'branches', groupId],
    queryFn: async () => {
      const res = await api.get<BranchesList>(`/customers/${groupId}/branches`)
      return res.data.branches
    },
    enabled: groupId !== null,
  })
}

export interface BranchPayload {
  name: string
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  contactPerson?: string | null
  isBillingAddress?: boolean
  isDeliveryAddress?: boolean
  isActive?: boolean
}

export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, payload }: { groupId: number; payload: BranchPayload }) => {
      const res = await api.post<Branch>(`/customers/${groupId}/branches`, payload)
      return res.data
    },
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['customers', 'branches', groupId] })
    },
  })
}

export function useUpdateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ branchId, payload }: { branchId: number; payload: Partial<BranchPayload> }) => {
      const res = await api.patch<Branch>(`/customers/branches/${branchId}`, payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', 'branches'] })
    },
  })
}

export function useDeleteBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (branchId: number) => {
      await api.del(`/customers/branches/${branchId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', 'branches'] })
    },
  })
}

export interface CustomerPayload {
  name: string
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  isGroup?: boolean
  // Punto 3 del mandato: al crear, el cliente se arma con su sucursal
  // principal + secundarias opcionales en una sola llamada.
  branches?: BranchPayload[]
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CustomerPayload) => {
      const res = await api.post<Customer>('/customers', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: CustomerPayload }) => {
      const res = await api.patch<Customer>(`/customers/${id}`, payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useCustomer(id: number | null) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: async () => {
      const res = await api.get<{ customer: Customer }>(`/customers/${id}`)
      return res.data.customer
    },
    enabled: id !== null,
  })
}

/** Convierte un cliente individual en grupo/franquicia (raíz, sin sucursales).
 *  Después de convertir, la ficha invalida las queries de clientes y muestra
 *  la sección de gestión de sucursales. */
export function useConvertCustomerToGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post<{ customer: Customer }>(`/customers/${id}/convert-to-group`)
      return res.data.customer
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
