import type { BadgeProps } from '../components/ui/Badge'

/**
 * Modelo de estados v2 (CTO 2026-09) — "Estado de la entrega":
 *   Inicio → Aceptada → En tránsito → Entregada (y Cancelada en la rama activa).
 * Espejo EXACTO del backend (routes/orders.ts → TRANSITIONS).
 */
export type OrderStatus = 'created' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'cancelled'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Inicio',
  accepted: 'Aceptada',
  in_transit: 'En tránsito',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}

export const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeProps['variant']> = {
  created: 'default',
  accepted: 'info',
  in_transit: 'warning',
  delivered: 'success',
  cancelled: 'error',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  cancelled: 'Cancelado',
}

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeProps['variant']> = {
  pending: 'warning',
  partial: 'info',
  paid: 'success',
  cancelled: 'error',
}

export const ORDER_STATUS_FLOW: OrderStatus[] = ['created', 'accepted', 'in_transit', 'delivered']

/** Transiciones v2: solo el conductor avanza su orden; cancelación con justificación. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['accepted', 'cancelled'],
  accepted: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Próximo paso de LA CADENA para un conductor: Inicio→Aceptada→En tránsito→Entregada.
 * (El conductor opera con UN botón contextual, nunca con un menú de estados.)
 */
export function nextDriverStatus(current: OrderStatus): OrderStatus | null {
  if (current === 'created') return 'accepted'
  if (current === 'accepted') return 'in_transit'
  if (current === 'in_transit') return 'delivered'
  return null
}

export function nextStatus(current: OrderStatus): OrderStatus | null {
  return nextDriverStatus(current)
}