import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

export interface Customer {
  id: number
  name: string
  // RIF venezolano: "J-123456789" (prefijo fijo J- + números que completa el vendedor)
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  createdBy?: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
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

export interface CustomerPayload {
  name: string
  rif?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
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
