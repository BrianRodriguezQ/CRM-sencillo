import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'

/** Contexto que el backend adjunta a cada aviso (columna `data` de la tabla). */
export interface NotificationData {
  orderId?: number
  orderNumber?: string
  status?: string
}

export interface Notification {
  id: number
  userId: number
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  data?: NotificationData | null
}

export interface NotificationsList {
  items: Notification[]
  unreadCount: number
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * Listado de avisos. Es la query "pesada" (trae los mensajes), así que se pide
 * BAJO DEMANDA: la campanita la habilita solo cuando el panel está abierto.
 * Para el badge está `useUnreadCount`, que trae únicamente el contador.
 */
export function useNotificationsList(
  params: { page?: number; limit?: number; unread?: boolean } = {},
  options: { enabled?: boolean } = {},
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.unread) searchParams.set('unread', 'true')
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async () => {
      const res = await api.get<NotificationsList>(`/notifications${qs ? `?${qs}` : ''}`)
      return res.data
    },
    enabled: options.enabled ?? true,
    // Sin staleTime: cada vez que se abre el panel queremos el estado real.
    staleTime: 0,
  })
}

/**
 * Contador de no leídas. Es el endpoint liviano que el backend expone "para el
 * badge": un solo COUNT sobre el índice (user_id, is_read, created_at).
 *
 * `refetchIntervalInBackground` es deliberado: el conductor suele tener el
 * panel en segundo plano. Si el polling se pausara sin foco, el aviso de una
 * orden nueva no llegaría nunca.
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await api.get<{ unreadCount: number }>('/notifications/unread-count')
      return res.data.unreadCount
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    refetchIntervalInBackground: true,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.put(`/notifications/${id}/read`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.put('/notifications/read-all')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
