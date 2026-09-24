import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

/**
 * Un pago registrado en order_payments (shape de GET /dashboard/cobranza/activity).
 * Lo consume el tab "Cobranza" de TeamPage para rastrear qué cobra cada
 * miembro del equipo (PUNTO 5 del mandato del CTO): quién lo registró
 * (recordedBy), de qué cliente, cuánto, por qué método y cuándo.
 */
export interface CobranzaActivityItem {
  id: number
  orderId: number
  orderNumber: string
  customerId: number
  customerName: string
  amount: number
  method: string
  methodCode: string
  reference?: string | null
  note?: string | null
  /** String ISO — el servidor serializa el timestamp a JSON. */
  paidAt: string
  recordedById: number | null
  recordedByName: string
}

export interface CobranzaActivityData {
  activity: CobranzaActivityItem[]
  total: number
}

export interface CobranzaActivityParams {
  /** Filtrar los pagos registrados por UN miembro. */
  memberId?: number
  limit?: number
  /**
   * false → el fetch se salta (ej. el hook se monta pero el tab Cobranza no
   * está activo). Default: true.
   */
  enabled?: boolean
}

/**
 * Actividad reciente de cobranza (solo superadmin en backend): últimos pagos
 * registrados, con quién los cargó. `memberId` opcional filtra por miembro.
 */
export function useCobranzaActivity(params: CobranzaActivityParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.memberId) searchParams.set('memberId', String(params.memberId))
  if (params.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()

  return useQuery({
    queryKey: ['cobranza', 'activity', params],
    enabled: params.enabled !== false,
    queryFn: async () => {
      const res = await api.get<CobranzaActivityData>(
        `/dashboard/cobranza/activity${qs ? `?${qs}` : ''}`,
      )
      return res.data
    },
  })
}