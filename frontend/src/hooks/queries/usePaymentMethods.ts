import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

export interface PaymentMethod {
  id: number
  name: string
  code: string
  /** Datos libres que el cliente necesita para pagar (cuenta, alias, ref...). */
  paymentDetails?: string | null
  isActive: boolean
  sortOrder: number
  /** Regla de comprobante v2: exige número de referencia escrito. */
  requiresReference: boolean
  /** Regla de comprobante v2: exige foto del comprobante (o ref como alternativa). */
  requiresReceipt: boolean
  createdAt: string
  updatedAt: string
}

export function usePaymentMethodsList() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const res = await api.get<{ items: PaymentMethod[] }>('/payment-methods')
      return res.data?.items ?? []
    },
  })
}

export interface PaymentMethodPayload {
  name?: string
  code?: string
  paymentDetails?: string | null
  isActive?: boolean
  sortOrder?: number
  requiresReference?: boolean
  requiresReceipt?: boolean
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: PaymentMethodPayload) => {
      const res = await api.post<PaymentMethod>('/payment-methods', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
    },
  })
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: PaymentMethodPayload }) => {
      const res = await api.patch<PaymentMethod>(`/payment-methods/${id}`, payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
    },
  })
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.del(`/payment-methods/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
    },
  })
}
