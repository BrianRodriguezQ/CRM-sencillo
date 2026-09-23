import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DashboardTotals } from './useDeliveryDashboard'
import type { Order } from './useOrders'

/**
 * Dashboard de cobranza (GET /dashboard/cobranza — backend dashboard.ts).
 *
 * Cobranza ve TODAS las órdenes con saldo (paymentStatus pending/partial):
 *   - pendingRevenue / pendingOrders: KPIs globales de lo por cobrar.
 *   - topDebtors: los 10 clientes con mayor monto pendiente.
 *   - paymentStats: monto cobrado (Σ order_payments) agrupado por método.
 *   - recentOrders: actividad reciente (misma shape que los otros dashboards).
 */
export interface CobranzaDebtor {
  customerId: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  pendingAmount: number
  pendingOrders: number
}

export interface PaymentMethodStat {
  method: string
  methodCode: string
  totalAmount: number
  count: number
}

export interface CobranzaDashboardStats {
  totals: DashboardTotals
  pendingRevenue: number
  pendingOrders: number
  topDebtors: CobranzaDebtor[]
  recentOrders: Order[]
  paymentStats: PaymentMethodStat[]
}

export function useCobranzaDashboard() {
  return useQuery({
    queryKey: ['cobranza-dashboard'],
    queryFn: async () => {
      const res = await api.get<{ data: CobranzaDashboardStats }>('/dashboard/cobranza')
      return res.data.data
    },
    refetchInterval: 1000 * 60, // polling cada 60s: los abonos cambian el saldo en vivo
  })
}