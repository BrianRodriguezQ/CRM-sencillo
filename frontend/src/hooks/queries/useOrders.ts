import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { OrderStatus, PaymentStatus } from '../../lib/order-status'
import type { User } from '../../context/AuthContext'

export interface CustomerReference {
  id: number
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

export interface OrderItem {
  id: number
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface OrderPayment {
  id: number
  paymentMethodId: number
  methodName: string
  methodCode: string
  amount: number
  reference?: string | null
  receiptUrl?: string | null
  note?: string | null
  paidAt: string
  recordedBy?: number | null
  recorderName?: string | null
}

export interface Order {
  id: number
  orderNumber: string
  customerId: number
  sellerId: number
  driverId: number | null
  paymentMethodId: number
  amount: string
  paymentStatus: PaymentStatus
  orderStatus: OrderStatus
  deliveryAddress?: string | null
  notes?: string | null
  deliveredAt?: string | null
  createdAt: string
  updatedAt: string
  customer?: CustomerReference | null
  seller?: Pick<User, 'id' | 'name' | 'email'> | null
  driver?: Pick<User, 'id' | 'name' | 'email' | 'phone'> | null
  paymentMethod?: { id: number; name: string; code: string } | null
  items?: OrderItem[]
  /** Dinero ya cobrado (Σ order_payments) — el cierre exige saldo 0. */
  paidAmount?: number
  /** amount − paidAmount. */
  balance?: number
  payments?: OrderPayment[]
}

export interface OrdersList {
  items: Order[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface OrdersListParams {
  page?: number
  perPage?: number
  status?: OrderStatus | ''
  /** Filtro por estado de pago: 'pending' = con saldo (pending|partial), 'paid' = saldadas. */
  paymentStatus?: PaymentStatus | ''
  customerId?: number
  driverId?: number
  sellerId?: number
  /** Fecha desde (YYYY-MM-DD). Filtra por createdAt. */
  desde?: string
  /** Fecha hasta (YYYY-MM-DD). Filtra por createdAt (inclusive). */
  hasta?: string
  search?: string
}

export function useOrdersList(params: OrdersListParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('perPage', String(params.perPage))
  if (params.status) searchParams.set('status', params.status)
  if (params.paymentStatus) searchParams.set('paymentStatus', params.paymentStatus)
  if (params.customerId) searchParams.set('customerId', String(params.customerId))
  if (params.driverId) searchParams.set('driverId', String(params.driverId))
  if (params.sellerId) searchParams.set('sellerId', String(params.sellerId))
  if (params.desde) searchParams.set('desde', params.desde)
  if (params.hasta) searchParams.set('hasta', params.hasta)
  if (params.search) searchParams.set('search', params.search)
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['orders', params],
    queryFn: async () => {
      const res = await api.get<OrdersList>(`/orders${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: async () => {
      const res = await api.get<Order>(`/orders/${id}`)
      return res.data
    },
    enabled: id !== null,
  })
}

export interface OrderItemInput {
  productName: string
  quantity: number
  unitPrice: number
}

export interface CreateOrderPayload {
  customerId: number
  paymentMethodId: number
  driverId?: number | null
  autoAssignDriver?: boolean
  amount?: string
  deliveryAddress?: string | null
  notes?: string | null
  items?: OrderItemInput[]
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) => {
      const res = await api.post<Order>('/orders', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
    },
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<CreateOrderPayload> }) => {
      const res = await api.patch<Order>(`/orders/${id}`, payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
    },
  })
}

export interface AssignDriverPayload {
  orderId: number
  driverId: number
}

export function useAssignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, driverId }: AssignDriverPayload) => {
      const res = await api.post<Order>(`/orders/${orderId}/assign-driver`, { driverId })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
    },
  })
}

export function useAssignAutoDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await api.post<Order>(`/orders/${orderId}/assign-auto`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
    },
  })
}

export interface UpdateOrderStatusPayload {
  orderId: number
  status: OrderStatus
  note?: string
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, status, note }: UpdateOrderStatusPayload) => {
      const res = await api.post<Order>(`/orders/${orderId}/status`, { status, note })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-status-history'] })
      qc.invalidateQueries({ queryKey: ['order-communications'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
    },
  })
}

export interface OrderStatusHistoryEntry {
  id: number
  orderId: number
  status: OrderStatus
  changedBy: number
  note?: string | null
  createdAt: string
  changer?: Pick<User, 'id' | 'name'> | null
}

export function useOrderStatusHistory(orderId: number | null) {
  return useQuery({
    queryKey: ['order-status-history', orderId],
    queryFn: async () => {
      const res = await api.get<{ items: OrderStatusHistoryEntry[] }>(
        `/orders/${orderId}/status-history`,
      )
      return res.data?.items ?? []
    },
    enabled: orderId !== null,
  })
}

export interface OrderCommunication {
  id: number
  orderId: number
  senderId: number
  senderName: string | null
  message: string
  createdAt: string
  /** WP2: adjunto de imagen (evidencia) — null si no hay. */
  attachmentUrl?: string | null
  attachmentMime?: string | null
}

export function useOrderCommunications(orderId: number | null) {
  return useQuery({
    queryKey: ['order-communications', orderId],
    queryFn: async () => {
      const res = await api.get<{ items: OrderCommunication[] }>(
        `/orders/${orderId}/communications`,
      )
      return res.data?.items ?? []
    },
    enabled: orderId !== null,
  })
}

export function useSendCommunication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      message,
      attachment,
    }: {
      orderId: number
      message?: string
      attachment?: File | null
    }) => {
      // WP2: adjuntar imagen requiere multipart; sin archivo, JSON (compat).
      let data: OrderCommunication
      if (attachment) {
        const fd = new FormData()
        if (message) fd.append('message', message)
        fd.append('attachment', attachment)
        const res = await api.post<OrderCommunication>(`/orders/${orderId}/communications`, fd)
        data = res.data
      } else {
        const res = await api.post<OrderCommunication>(`/orders/${orderId}/communications`, {
          message,
        })
        data = res.data
      }
      return data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['order-communications', variables.orderId] })
      qc.invalidateQueries({ queryKey: ['orders', 'detail', variables.orderId] })
    },
  })
}

/* ─── Pagos v2: abonos con comprobante (ref y/o foto según el método) ─── */

export interface RegisterOrderPaymentInput {
  orderId: number
  amount: number
  paymentMethodId?: number
  reference?: string
  note?: string
  receipt?: File | null
}

export function useRegisterOrderPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      amount,
      paymentMethodId,
      reference,
      note,
      receipt,
    }: RegisterOrderPaymentInput) => {
      const fd = new FormData()
      fd.append('amount', String(amount))
      if (paymentMethodId) fd.append('paymentMethodId', String(paymentMethodId))
      if (reference) fd.append('reference', reference)
      if (note) fd.append('note', note)
      if (receipt) fd.append('receipt', receipt)
      const res = await api.post<Order>(`/orders/${orderId}/payments`, fd)
      return res.data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
      qc.invalidateQueries({ queryKey: ['orders', 'detail', variables.orderId] })
    },
  })
}

export function useDeleteOrderPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, paymentId }: { orderId: number; paymentId: number }) => {
      const res = await api.del<Order>(`/orders/${orderId}/payments/${paymentId}`)
      return res.data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] })
      qc.invalidateQueries({ queryKey: ['orders', 'detail', variables.orderId] })
    },
  })
}
