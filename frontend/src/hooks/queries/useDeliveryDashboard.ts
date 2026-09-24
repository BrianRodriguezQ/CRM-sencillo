import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { UserRole } from '../../context/AuthContext'
import type { Order } from './useOrders'

/**
 * Dashboard v2 (CTO 2026-09): cada rol ve SOLO lo suyo.
 *   - superadmin: totales de la empresa + rankings (detalle individual → /admin/equipo/:id).
 *   - operador:  sus pedidos + sus ingresos cobrados + pendientes sin asignar.
 *   - conductor: su trabajo + ganancia de entregadas.
 */
export interface DashboardTotals {
  todayOrders: number
  inProgress: number
  delivered: number
  cancelled: number
  totalRevenue: string
  pendingRevenue: string
  /** Cantidad de órdenes del scope con saldo (paymentStatus pending|partial). */
  pendingPayments: number
}

export interface SellerDashboardStats {
  totals: DashboardTotals
  myOrders: number
  /** Pedidos míos en Inicio sin conductor (decisión 1-A: card separada). */
  unassigned: number
  topCustomers: Array<{ id: number; name: string; totalOrders: number; totalAmount: string }>
  recentOrders: Order[]
}

export interface DriverDashboardStats {
  totals: DashboardTotals
  recentOrders: Order[]
}

export interface TopDriverEntry {
  id: number
  name: string
  deliveredCount: number
  totalDelivered: string
}

export interface SuperadminDashboardStats {
  totals: DashboardTotals
  activeSellers: number
  activeDrivers: number
  totalCustomers: number
  topSellers: Array<{ id: number; name: string; totalOrders: number; totalAmount: string }>
  topDrivers: TopDriverEntry[]
  recentOrders: Order[]
}

/** Deudor del panel de cobranza (shape de GET /dashboard/cobranza y /user/:id). */
export interface MemberDebtor {
  customerId: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  pendingAmount: number
  pendingOrders: number
}

/** Estadísticas de UN miembro del equipo (GET /dashboard/user/:id — decisión 3-B). */
export interface MemberDashboardStats {
  user: { id: number; name: string; role: 'operador' | 'conductor' | 'cobranza' }
  totals: DashboardTotals
  /** operador: pedidos sin conductor. Conductor/cobranza: 0. */
  unassigned: number
  /** Conductor: entregadas. operador/cobranza: 0. */
  delivered: number
  topCustomers: Array<{ id: number; name: string; totalOrders: number; totalAmount: string }>
  recentOrders: Order[]
  /** cobranza: top deudores globales (estrategia segura, sin asignación de clientes). */
  topDebtors?: MemberDebtor[]
  /** cobranza: monto cobrado por ESTE miembro (order_payments.recordedBy) en 30 días. */
  collected30d?: number
  /** cobranza: total por cobrar global (pending|partial). */
  pendingRevenue?: number
}

export function useDeliveryDashboard(role: UserRole | undefined) {
  return useQuery({
    queryKey: ['delivery-dashboard', role],
    queryFn: async () => {
      const url =
        role === 'superadmin'
          ? '/dashboard'
          : role === 'operador'
            ? '/dashboard/operador'
            : '/dashboard/driver'
      const res = await api.get<unknown>(url)
      return res.data as SuperadminDashboardStats | SellerDashboardStats | DriverDashboardStats
    },
    enabled: !!role,
    refetchInterval: 1000 * 60, // polling cada 60s: el conductor ve los pedidos nuevos sin recargar
  })
}

/** Detalle de rendimiento de un operador/conductor (solo consume el superadmin). */
export function useTeamMemberDashboard(userId: number | null) {
  return useQuery({
    queryKey: ['team-member-dashboard', userId],
    queryFn: async () => {
      const res = await api.get<MemberDashboardStats>(`/dashboard/user/${userId}`)
      return res.data
    },
    enabled: userId !== null,
  })
}

/** Series temporales de revenue (solo superadmin). */
export interface RevenueSeriesPoint {
  fecha: string
  label: string
  cobrado: number
  porCobrar: number
  total: number
}

export function useRevenueSeries(
  periodo: 'semana' | 'mes' = 'semana',
  desde?: string,
  hasta?: string,
) {
  return useQuery({
    queryKey: ['revenue-series', periodo, desde, hasta],
    queryFn: async () => {
      const params = new URLSearchParams({ periodo })
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await api.get<{ data: { periodo: string; series: RevenueSeriesPoint[] } }>(
        `/dashboard/revenue-series?${params.toString()}`,
      )
      return res.data
    },
    enabled: !!desde && !!hasta,
  })
}

/** Top clientes por período (solo superadmin). */
export interface TopClientEntry {
  id: number
  name: string
  totalOrders: number
  totalAmount: number
}

export function useTopClients(
  periodo: 'semana' | 'mes' = 'semana',
  desde?: string,
  hasta?: string,
  limite = 10,
) {
  return useQuery({
    queryKey: ['top-clients', periodo, desde, hasta, limite],
    queryFn: async () => {
      const params = new URLSearchParams({ periodo, limite: String(limite) })
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const res = await api.get<{ data: TopClientEntry[] }>(
        `/dashboard/top-clients?${params.toString()}`,
      )
      return res.data
    },
    enabled: !!desde && !!hasta,
  })
}
