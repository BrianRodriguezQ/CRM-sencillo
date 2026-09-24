/**
 * Orders — núcleo del sistema (delivery/ventas).
 *
 * Modelo de estados v2 (CTO 2026-09): "Estado de la entrega"
 *   created (Inicio) → accepted (Aceptada) → in_transit (En tránsito)
 *     → delivered (Entregado)
 *   y en cualquier punto de la rama activa: cancelled (Cancelado, exige
 *   justificación escrita ≥ 4 caracteres).
 *
 * Reglas operativas v2:
 *   - Asignar conductor NO cambia el estado (la orden sigue en Inicio hasta
 *     que el conductor la Acepta). Antes la asignación mutaba a 'assigned'
 *     y eso rompía el flujo (reclamo del CTO).
 *   - SOLO el conductor transiciona el estado de SU orden; el superadmin es
 *     respaldo (puede hacer cualquier transición válida). El vendedor NO
 *     toca estados: crea, asigna y registra pagos.
 *   - Entregar exige saldo 0 (pagado). Si el método es efectivo, el pago por
 *     el total pendiente se auto-registra en el acto de la entrega.
 *   - Los pagos van a order_payments (uno o varios abonos); paymentStatus es
 *     derivado: pending | partial | paid.
 *   - Carga del conductor (asignación automática): ponderada — in_transit
 *     pesa 2, accepted/created pesa 1. Elige el de MENOR carga (A+B, CTO).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, count, like, inArray, gte, lte, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '../db/index.js'
import {
  users,
  customers,
  paymentMethods,
  orders,
  orderItems,
  orderStatusHistory,
  orderCommunications,
  notifications,
  orderPayments,
} from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { writeAuditLog, clientIp } from '../utils/audit-log.js'
import { emitToUser, emitToRole } from '../events/broadcaster.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

const sellerAlias = alias(users, 'seller')
const driverAlias = alias(users, 'driver')
const recorderAlias = alias(users, 'recorder')
const branchAlias = alias(customers, 'branch')

const ORDER_STATUSES = ['created', 'accepted', 'in_transit', 'delivered', 'cancelled'] as const
type OrderStatus = (typeof ORDER_STATUSES)[number]

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['accepted', 'cancelled'],
  accepted: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

/** Justificación mínima para cancelar (CTO: cancelada requiere justificación). */
const CANCEL_NOTE_MIN = 4

/** Los pagos ≠ efectivo con comprobante se registran manualmente; efectivo = auto al entregar. */
const CASH_METHOD_CODE = 'efectivo'

// 500: los modales de actividad (Driver/Seller/CustomerDetail) cargan hasta
// 200 órdenes por período CON scroll interno (decisión 2-A: el total del
// período suma todo, no la página visible). El cliente nunca puede pasar de
// este límite — el schema lo rechaza con 400.
const PAGE_SIZE_MAX = 500

/** Tipos de imagen permitidos para comprobantes de pago. */
const ALLOWED_RECEIPT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024 // 5MB

function toNumber(v: unknown): number {
  return Number.parseFloat(String(v ?? '0'))
}

/** Filtro de scope según el rol (superadmin = sin restricción). */
function ordersScope(user: JWTPayload): SQL[] {
  if (user.role === 'superadmin') return []
  if (user.role === 'operador') return [eq(orders.sellerId, user.id)]
  if (user.role === 'cobranza') return [] // cobranza ve todas para gestión de cobros
  return [eq(orders.driverId, user.id)]
}

/** Acceso a UNA orden según el rol. */
function canAccessOrder(
  user: JWTPayload,
  order: { sellerId: number; driverId: number | null },
): boolean {
  if (user.role === 'superadmin') return true
  if (user.role === 'operador') return order.sellerId === user.id
  if (user.role === 'cobranza') return true // cobranza ve todas para gestión de cobros
  return order.driverId === user.id
}

async function notifyUser(
  userId: number,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db.insert(notifications).values({ userId, type, title, message, data })
  // Realtime (WP1): empujar la notificación al destinatario en el acto.
  // El polling 30s del badge queda como fallback, no como vía principal.
  emitToUser(userId, 'notification', { id: undefined, type, title, message, ...(data ?? {}) })
}

/**
 * Emite un evento de orden por SSE a TODOS los que pueden verla:
 * superadmin (ve todo) + seller + driver. Refresca listas, detalle y
 * dashboards en todas las pestañas abiertas de los involucrados.
 */
function emitOrderEvent(
  order: { id: number; orderNumber: string; sellerId: number; driverId: number | null },
  event: string,
  payload: Record<string, unknown>,
): void {
  const data = { orderId: order.id, orderNumber: order.orderNumber, ...payload }
  emitToRole('superadmin', event, data)
  emitToUser(order.sellerId, event, data)
  if (order.driverId) emitToUser(order.driverId, event, data)
}

async function loadOrderRaw(id: number) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  return row ?? null
}

/* ─── Pagos: saldo y paymentStatus derivado ─── */

/** Suma de abonos registrados contra la orden. */
async function paidForOrder(orderId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${orderPayments.amount}), 0)` })
    .from(orderPayments)
    .where(eq(orderPayments.orderId, orderId))
  return toNumber(row?.total)
}

/** paymentStatus derivado: paid (saldo ≤ centavos), partial (hay abonos), pending (nada). */
function derivePaymentStatus(total: number, paid: number): 'paid' | 'partial' | 'pending' {
  if (paid >= total - 0.005) return 'paid'
  if (paid > 0) return 'partial'
  return 'pending'
}

async function setDerivedPaymentStatus(order: { id: number; amount: string | number }): Promise<void> {
  const paid = await paidForOrder(order.id)
  const status = derivePaymentStatus(toNumber(order.amount), paid)
  await db
    .update(orders)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(eq(orders.id, order.id))
}

/** Arma el detalle completo de una orden (participantes + historial + chat + pagos). */
async function loadOrderDetail(id: number) {
  const order = await loadOrderRaw(id)
  if (!order) return null

  const [customer, seller, paymentMethod, branch] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, order.customerId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, order.sellerId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({
        id: paymentMethods.id,
        name: paymentMethods.name,
        code: paymentMethods.code,
        requiresReference: paymentMethods.requiresReference,
        requiresReceipt: paymentMethods.requiresReceipt,
      })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, order.paymentMethodId))
      .limit(1)
      .then((r) => r[0] ?? null),
    order.branchId
      ? db
          .select({ id: customers.id, name: customers.name, address: customers.address })
          .from(customers)
          .where(eq(customers.id, order.branchId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ])

  let driver: { id: number; name: string; phone: string | null } | null = null
  if (order.driverId) {
    const [d] = await db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, order.driverId))
      .limit(1)
    driver = d ?? null
  }

  const history = await db
    .select({
      id: orderStatusHistory.id,
      status: orderStatusHistory.status,
      note: orderStatusHistory.note,
      changedBy: orderStatusHistory.changedBy,
      changerName: users.name,
      createdAt: orderStatusHistory.createdAt,
    })
    .from(orderStatusHistory)
    .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(orderStatusHistory.createdAt)

  const communications = await db
    .select({
      id: orderCommunications.id,
      senderId: orderCommunications.senderId,
      senderName: users.name,
      message: orderCommunications.message,
      attachmentUrl: orderCommunications.attachmentUrl,
      attachmentMime: orderCommunications.attachmentMime,
      createdAt: orderCommunications.createdAt,
    })
    .from(orderCommunications)
    .leftJoin(users, eq(users.id, orderCommunications.senderId))
    .where(eq(orderCommunications.orderId, order.id))
    .orderBy(orderCommunications.createdAt)

  const items = await db
    .select({
      id: orderItems.id,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.id)

  const payments = await db
    .select({
      id: orderPayments.id,
      paymentMethodId: orderPayments.paymentMethodId,
      methodName: paymentMethods.name,
      methodCode: paymentMethods.code,
      amount: orderPayments.amount,
      reference: orderPayments.reference,
      receiptUrl: orderPayments.receiptUrl,
      note: orderPayments.note,
      paidAt: orderPayments.paidAt,
      recordedBy: orderPayments.recordedBy,
      recorderName: recorderAlias.name,
    })
    .from(orderPayments)
    .leftJoin(paymentMethods, eq(paymentMethods.id, orderPayments.paymentMethodId))
    .leftJoin(recorderAlias, eq(recorderAlias.id, orderPayments.recordedBy))
    .where(eq(orderPayments.orderId, order.id))
    .orderBy(orderPayments.paidAt)

  const paid = toNumber(payments.reduce((acc, p) => acc + toNumber(p.amount), 0))
  const total = toNumber(order.amount)

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    amount: total,
    // Método de pago de la orden (id suelto + objeto con flags de comprobante).
    paymentMethodId: order.paymentMethodId,
    // Saldo y pagos: el cierre exige saldo 0.
    paidAmount: paid,
    balance: Math.max(0, total - paid),
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    customerId: order.customerId,
    customer,
    // Sucursal (branch) si la orden se facturó a una sucursal del grupo.
    branchId: order.branchId,
    branch,
    // "Dejar pago pendiente" (el conductor no cobra; lo gestiona cobranza).
    paymentPending: order.paymentPending,
    seller,
    driver,
    paymentMethod,
    items: items.map((it) => ({
      id: it.id,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: toNumber(it.unitPrice),
      lineTotal: toNumber(it.unitPrice) * it.quantity,
    })),
    statusHistory: history,
    communications,
    payments: payments.map((p) => ({
      id: p.id,
      paymentMethodId: p.paymentMethodId,
      methodName: p.methodName,
      methodCode: p.methodCode,
      amount: toNumber(p.amount),
      reference: p.reference,
      receiptUrl: p.receiptUrl,
      note: p.note,
      paidAt: p.paidAt,
      recordedBy: p.recordedBy,
      recorderName: p.recorderName,
    })),
  }
}

/**
 * Conductor activo con MENOS carga ponderada (CTO 2026-09):
 *   in_transit × 2, accepted × 1, created asignado × 1 → elige el menor.
 * Empates: el de id más bajo (orden de alta).
 */
async function pickLeastBusyDriver(): Promise<{ id: number; name: string } | null> {
  const drivers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, 'conductor'), eq(users.isActive, true)))
  if (drivers.length === 0) return null

  const loadExpr = sql<number>`coalesce(sum(case when ${orders.orderStatus} = 'in_transit' then 2 when ${orders.orderStatus} in ('created','accepted') then 1 else 0 end), 0)`
  const activeLoads = await db
    .select({ driverId: orders.driverId, load: loadExpr })
    .from(orders)
    .where(
      and(
        inArray(
          orders.driverId,
          drivers.map((d) => d.id),
        ),
        inArray(orders.orderStatus, ['created', 'accepted', 'in_transit']),
      ),
    )
    .groupBy(orders.driverId)

  const loads = new Map(activeLoads.map((r) => [r.driverId, Number(r.load)]))

  return (
    drivers.sort(
      (a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0) || a.id - b.id,
    )[0] ?? null
  )
}

/**
 * Asigna conductor SIN cambiar el estado (la orden sigue en Inicio hasta que
 * el conductor la Acepta). Antes esto mutaba a 'assigned' y rompía el flujo.
 */
async function applyDriverAssignment(
  order: { id: number; orderNumber: string; amount: string | number; orderStatus: string },
  driver: { id: number; name: string },
  changedBy: number,
): Promise<void> {
  await db
    .update(orders)
    .set({ driverId: driver.id, updatedAt: new Date() })
    .where(eq(orders.id, order.id))
  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    status: order.orderStatus,
    changedBy,
    note: `Asignada a ${driver.name}`,
  })
  await notifyUser(
    driver.id,
    'order_assigned',
    `Nueva orden ${order.orderNumber}`,
    `Se te asignó la orden ${order.orderNumber} por ${toNumber(order.amount).toFixed(2)}. Aceptala para arrancar.`,
    { orderId: order.id, orderNumber: order.orderNumber },
  )
}

/** Genera el número de orden: ORD-YYYYMMDD-NNN. */
async function nextOrderNumber(): Promise<string> {
  const now = new Date()
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const prefix = `ORD-${yyyymmdd}-`

  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`))

  const maxSeq = rows.reduce((max, r) => {
    const match = /-(\d+)$/.exec(r.orderNumber)
    const n = match ? Number.parseInt(match[1], 10) : 0
    return Math.max(max, n)
  }, 0)

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}

/* ─── GET / — listado con filtros y paginación ─── */

const listQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  // Filtro por estado de PAGO: 'pending' = con saldo (pending|partial), para que
  // el rastreo de "Pagos pendientes" del dashboard sea un clic (CTO 2026-09).
  paymentStatus: z.enum(['pending', 'partial', 'paid']).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  driverId: z.coerce.number().int().positive().optional(),
  sellerId: z.coerce.number().int().positive().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional().default(20),
})

router.get('/', zValidator('query', listQuerySchema), async (c) => {
  const auth = c.get('user')
  const q = c.req.valid('query')
  const offset = (q.page - 1) * q.perPage

  // Cuando se filtra por un cliente específico (perfil de cliente), 
  // mostramos TODOS los pedidos de ese cliente sin importar qué vendedor los creó.
  // Esto permite que tanto vendedores como superadmin vean el historial completo.
  const filters = q.customerId ? [] : ordersScope(auth)
  if (q.status) filters.push(eq(orders.orderStatus, q.status))
  if (q.paymentStatus) {
    if (q.paymentStatus === 'pending') {
      // "Pendiente" para el negocio = con saldo (nada cobrado o abono parcial).
      filters.push(inArray(orders.paymentStatus, ['pending', 'partial']))
    } else {
      filters.push(eq(orders.paymentStatus, q.paymentStatus))
    }
  }
  if (q.customerId) filters.push(eq(orders.customerId, q.customerId))
  if (q.driverId) filters.push(eq(orders.driverId, q.driverId))
  if (q.sellerId) filters.push(eq(orders.sellerId, q.sellerId))
  if (q.desde) {
    const desdeDate = new Date(`${q.desde}T00:00:00.000Z`)
    if (!Number.isNaN(desdeDate.getTime())) filters.push(gte(orders.createdAt, desdeDate))
  }
  if (q.hasta) {
    const hastaDate = new Date(`${q.hasta}T23:59:59.999Z`)
    if (!Number.isNaN(hastaDate.getTime())) filters.push(lte(orders.createdAt, hastaDate))
  }

  const where = filters.length ? and(...filters) : undefined

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        amount: orders.amount,
        paymentStatus: orders.paymentStatus,
        orderStatus: orders.orderStatus,
        deliveryAddress: orders.deliveryAddress,
        deliveredAt: orders.deliveredAt,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        customerId: orders.customerId,
        customer: { id: customers.id, name: customers.name },
        // Sucursal puntual del grupo (las órdenes viejas de grupos pueden
        // traer null: antes se permitía facturar "al grupo consolidado").
        branchId: orders.branchId,
        branchName: branchAlias.name,
        paymentPending: orders.paymentPending,
        sellerId: orders.sellerId,
        seller: { id: sellerAlias.id, name: sellerAlias.name },
        driverId: orders.driverId,
        driver: { id: driverAlias.id, name: driverAlias.name },
        paymentMethodId: orders.paymentMethodId,
        paymentMethod: {
          id: paymentMethods.id,
          name: paymentMethods.name,
          code: paymentMethods.code,
        },
        notes: orders.notes,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(sellerAlias, eq(sellerAlias.id, orders.sellerId))
      .leftJoin(driverAlias, eq(driverAlias.id, orders.driverId))
      .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
      .leftJoin(branchAlias, eq(branchAlias.id, orders.branchId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(q.perPage)
      .offset(offset),
    db.select({ count: count() }).from(orders).where(where),
  ])

  const total = Number(totalRow?.count ?? 0)

  return c.json({
    success: true,
    data: {
      items: rows.map((r) => ({
        ...r,
        amount: toNumber(r.amount),
        branch: r.branchId ? { id: r.branchId, name: r.branchName } : null,
        driver: r.driverId ? r.driver : null,
        seller: r.seller ?? null,
        customer: r.customer ?? null,
        paymentMethod: r.paymentMethod ?? null,
      })),
      total,
      page: q.page,
      perPage: q.perPage,
      totalPages: Math.max(1, Math.ceil(total / q.perPage)),
    },
  })
})

/* ─── POST / — crear orden (vendedor o superadmin) ─── */

const orderItemSchema = z.object({
  productName: z.string().trim().min(1, 'El nombre del producto es requerido').max(255),
  quantity: z.coerce.number().int().min(1, 'La cantidad debe ser al menos 1').max(10000).default(1),
  unitPrice: z.coerce.number().min(0, 'El precio unitario no puede ser negativo'),
})

const createOrderSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  // Sucursal específica (branch). Decisión CTO (Punto 6): los pedidos SIEMPRE
  // van a una sucursal puntual cuando el cliente es grupo/franquicia; la
  // consolidación grupo/individual SOLO aplica a notas de entrega. La regla
  // exacta (obligatoria para grupos, null para clientes simples) se valida
  // abajo contra el customer, no en el schema.
  branchId: z.coerce.number().int().positive().optional().nullable(),
  paymentMethodId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0').optional(),
  paymentStatus: z.enum(['pending', 'paid']).optional().default('pending'),
  // "Dejar pago pendiente": conductor NO cobra; cobranza lo gestiona luego
  paymentPending: z.boolean().optional().default(false),
  deliveryAddress: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  driverId: z.coerce.number().int().positive().optional().nullable(),
  autoAssignDriver: z.boolean().optional().default(false),
  items: z.array(orderItemSchema).optional().default([]),
})

router.post(
  '/',
  requireRole('superadmin', 'operador'),
  zValidator('json', createOrderSchema),
  async (c) => {
    const auth = c.get('user')
    try {
      const data = c.req.valid('json')

      // Con el modelo de pagos v2, una orden nace PENDIENTE: el pago se registra
      // en /:id/payments (o se auto-cobra efectivo al entregar).
      if (data.paymentStatus === 'paid') {
        return c.json(
          {
            success: false,
            error: 'La orden se crea pendiente: registrá el pago desde el detalle de la orden',
          },
          400,
        )
      }

      const [customer] = await db
        .select({ id: customers.id, isGroup: customers.isGroup })
        .from(customers)
        .where(and(eq(customers.id, data.customerId), eq(customers.isActive, true)))
        .limit(1)
      if (!customer) {
        return c.json({ success: false, error: 'Cliente no encontrado' }, 400)
      }

      // Decisión CTO (Punto 6): los pedidos SIEMPRE van a una sucursal puntual
      // cuando el cliente es grupo/franquicia; la consolidación grupo/individual
      // SOLO aplica a notas de entrega. Cliente simple → branchId null.
      let branchId: number | null = null
      if (customer.isGroup) {
        if (!data.branchId) {
          return c.json(
            {
              success: false,
              error:
                'Elegí la sucursal que recibe el pedido (el cliente es un grupo/franquicia)',
            },
            400,
          )
        }
        const [branch] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.id, data.branchId),
              eq(customers.parentId, data.customerId),
              eq(customers.isActive, true),
            ),
          )
          .limit(1)
        if (!branch) {
          return c.json({ success: false, error: 'Sucursal no encontrada para este cliente' }, 400)
        }
        branchId = branch.id
      } else if (data.branchId) {
        return c.json(
          {
            success: false,
            error: 'Solo los clientes grupo/franquicia admiten una sucursal de facturación',
          },
          400,
        )
      }

      const [method] = await db
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.id, data.paymentMethodId), eq(paymentMethods.isActive, true)))
        .limit(1)
      if (!method) {
        return c.json({ success: false, error: 'Método de pago no encontrado' }, 400)
      }

      let driver: { id: number; name: string } | null = null
      if (data.driverId) {
        const [selected] = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(
            and(eq(users.id, data.driverId), eq(users.role, 'conductor'), eq(users.isActive, true)),
          )
          .limit(1)
        if (!selected) {
          return c.json({ success: false, error: 'Conductor no encontrado' }, 404)
        }
        driver = selected
      } else if (data.autoAssignDriver) {
        driver = await pickLeastBusyDriver()
        if (!driver) {
          return c.json({ success: false, error: 'No hay conductores activos disponibles' }, 400)
        }
      }

      // Si vienen items, el total SIEMPRE se calcula en el backend (no se confía en el cliente).
      const items = (data.items ?? []).map((it) => ({
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }))
      const itemsTotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0)
      if (items.length > 0 && itemsTotal <= 0) {
        return c.json({ success: false, error: 'El monto del pedido debe ser mayor a 0' }, 400)
      }
      const finalAmount = items.length > 0 ? itemsTotal : (data.amount ?? 0)

      const orderNumber = await nextOrderNumber()

      const order = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            orderNumber,
            customerId: data.customerId,
            branchId,
            sellerId: auth.id,
            paymentMethodId: data.paymentMethodId,
            amount: finalAmount.toFixed(2),
            paymentStatus: 'pending',
            paymentPending: data.paymentPending ?? false,
            deliveryAddress: data.deliveryAddress ?? null,
            notes: data.notes ?? null,
          })
          .returning()

        if (items.length > 0) {
          await tx.insert(orderItems).values(
            items.map((it) => ({
              orderId: created.id,
              productName: it.productName,
              quantity: it.quantity,
              unitPrice: it.unitPrice.toFixed(2),
            })),
          )
        }
        return created
      })

      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        status: order.orderStatus,
        changedBy: auth.id,
        note: driver ? 'Orden creada' : 'Orden creada',
      })

      await writeAuditLog({
        userId: auth.id,
        action: 'order.created',
        metadata: { orderId: order.id, orderNumber },
        ipAddress: clientIp(c),
      })

      if (driver) {
        await applyDriverAssignment(order, driver, auth.id)
      }

      // Realtime (WP1): la orden nace → todos los involucrados refrescan.
      emitOrderEvent(order, 'order_changed', { action: 'created' })

      const detail = await loadOrderDetail(order.id)
      return c.json({ success: true, data: detail }, 201)
    } catch (error) {
      console.error('Create order error:', error)
      return c.json({ success: false, error: 'Error al crear la orden' }, 500)
    }
  },
)

/* ─── GET /:id — detalle completo ─── */

router.get('/:id', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const order = await loadOrderRaw(id)
  if (!order || !canAccessOrder(auth, order)) {
    return c.json({ success: false, error: 'Orden no encontrada' }, 404)
  }

  const detail = await loadOrderDetail(id)
  return c.json({ success: true, data: detail })
})

/* ─── PATCH /:id — editar campos de la orden (solo estado Inicio) ─── */

const updateOrderSchema = z.object({
  paymentMethodId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0').optional(),
  deliveryAddress: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

router.patch(
  '/:id',
  requireRole('superadmin', 'operador'),
  zValidator('json', updateOrderSchema),
  async (c) => {
    const auth = c.get('user')
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400)
    }

    try {
      const data = c.req.valid('json')

      const order = await loadOrderRaw(id)
      if (!order || !canAccessOrder(auth, order)) {
        return c.json({ success: false, error: 'Orden no encontrada' }, 404)
      }
      if (order.orderStatus !== 'created') {
        return c.json(
          { success: false, error: 'Solo se pueden editar órdenes en estado Inicio (created)' },
          400,
        )
      }

      if (data.paymentMethodId) {
        const [method] = await db
          .select({ id: paymentMethods.id })
          .from(paymentMethods)
          .where(
            and(eq(paymentMethods.id, data.paymentMethodId), eq(paymentMethods.isActive, true)),
          )
          .limit(1)
        if (!method) {
          return c.json({ success: false, error: 'Método de pago no encontrado' }, 400)
        }
      }

      const patch: Partial<typeof orders.$inferInsert> = { updatedAt: new Date() }
      if (data.paymentMethodId) patch.paymentMethodId = data.paymentMethodId
      if (data.amount !== undefined) patch.amount = data.amount.toString()
      if (data.deliveryAddress !== undefined) patch.deliveryAddress = data.deliveryAddress ?? null
      if (data.notes !== undefined) patch.notes = data.notes ?? null

      await db.update(orders).set(patch).where(eq(orders.id, id))
      // paymentStatus se deriva de los pagos: si cambiaron el monto, recalcular.
      await setDerivedPaymentStatus({ id: order.id, amount: patch.amount ?? order.amount })

      await writeAuditLog({
        userId: auth.id,
        action: 'order.updated',
        metadata: { orderId: id, orderNumber: order.orderNumber },
        ipAddress: clientIp(c),
      })

      emitOrderEvent(order, 'order_changed', { action: 'updated' })

      const detail = await loadOrderDetail(id)
      return c.json({ success: true, data: detail })
    } catch (error) {
      console.error('Update order error:', error)
      return c.json({ success: false, error: 'Error al actualizar la orden' }, 500)
    }
  },
)

/* ─── POST /:id/assign-driver — asignar conductor (sin cambiar estado) ─── */

const assignDriverSchema = z.object({
  driverId: z.number().int().positive(),
})

router.post(
  '/:id/assign-driver',
  requireRole('superadmin', 'operador'),
  zValidator('json', assignDriverSchema),
  async (c) => {
    const auth = c.get('user')
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400)
    }

    try {
      const { driverId } = c.req.valid('json')

      const order = await loadOrderRaw(id)
      if (!order || !canAccessOrder(auth, order)) {
        return c.json({ success: false, error: 'Orden no encontrada' }, 404)
      }
      if (order.orderStatus !== 'created') {
        return c.json(
          { success: false, error: 'Solo se puede asignar conductor con estado Inicio (created)' },
          400,
        )
      }

      // Regla 2-B/3-sí: una vez asignado, SOLO el superadmin puede reasignar (y solo en Inicio).
      if (order.driverId && auth.role !== 'superadmin') {
        return c.json(
          {
            success: false,
            error: 'Este pedido ya tiene un conductor asignado. Solo el administrador puede reasignarlo.',
          },
          400,
        )
      }

      const [driver] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.id, driverId), eq(users.role, 'conductor'), eq(users.isActive, true)))
        .limit(1)
      if (!driver) {
        return c.json({ success: false, error: 'Conductor no encontrado' }, 404)
      }

      await applyDriverAssignment(order, driver, auth.id)

      // Realtime (WP1): el conductor ahora lo ve en su panel sin tocar nada.
      emitOrderEvent(order, 'order_changed', { action: 'assigned', driverId })

      await writeAuditLog({
        userId: auth.id,
        action: 'order.assign_driver',
        metadata: { orderId: id, driverId, orderNumber: order.orderNumber },
        ipAddress: clientIp(c),
      })

      const detail = await loadOrderDetail(id)
      return c.json({ success: true, data: detail })
    } catch (error) {
      console.error('Assign driver error:', error)
      return c.json({ success: false, error: 'Error al asignar el conductor' }, 500)
    }
  },
)

/* ─── POST /:id/assign-auto — asignar al conductor con MENOR carga ponderada ─── */

router.post('/:id/assign-auto', requireRole('superadmin', 'operador'), async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const order = await loadOrderRaw(id)
    if (!order || !canAccessOrder(auth, order)) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }
    if (order.orderStatus !== 'created') {
      return c.json(
        { success: false, error: 'Solo se puede asignar conductor con estado Inicio (created)' },
        400,
      )
    }

    // Regla 2-B/3-sí: una vez asignado, SOLO el superadmin puede reasignar (y solo en Inicio).
    if (order.driverId && auth.role !== 'superadmin') {
      return c.json(
        {
          success: false,
          error: 'Este pedido ya tiene un conductor asignado. Solo el administrador puede reasignarlo.',
        },
        400,
      )
    }

    const driver = await pickLeastBusyDriver()
    if (!driver) {
      return c.json({ success: false, error: 'No hay conductores activos disponibles' }, 400)
    }

await applyDriverAssignment(order, driver, auth.id)

      // Realtime (WP1): mismo evento que la asignación manual.
      emitOrderEvent(order, 'order_changed', { action: 'assigned', driverId: driver.id })

      await writeAuditLog({
        userId: auth.id,
        action: 'order.assign_auto',
        metadata: { orderId: id, driverId: driver.id, orderNumber: order.orderNumber },
        ipAddress: clientIp(c),
      })

    const detail = await loadOrderDetail(id)
    return c.json({ success: true, data: detail })
  } catch (error) {
    console.error('Auto-assign driver error:', error)
    return c.json({ success: false, error: 'Error al asignar el conductor' }, 500)
  }
})

/* ─── POST /:id/status — "Estado de la entrega" v2 ───
 * created → accepted → in_transit → delivered
 * cualquier rama activa → cancelled (exige justificación ≥ 4 chars)
 * SOLO el conductor transiciona su orden; el superadmin es respaldo.
 */

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().optional().nullable(),
})

router.post('/:id/status', zValidator('json', statusSchema), async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const { status: target, note } = c.req.valid('json')

    const order = await loadOrderRaw(id)
    if (!order || !canAccessOrder(auth, order)) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }

    const current = order.orderStatus as OrderStatus

    // El vendedor NO toca estados (CTO: solo el conductor; superadmin respaldo).
    if (auth.role === 'operador') {
      return c.json(
        { success: false, error: 'El vendedor no puede cambiar el estado de la entrega' },
        403,
      )
    }

    // Justificación obligatoria para cancelar (CTO: cancelada requiere justificación escrita).
    if (target === 'cancelled' && (!note || note.trim().length < CANCEL_NOTE_MIN)) {
      return c.json(
        {
          success: false,
          error: `Para cancelar escribí una justificación (mínimo ${CANCEL_NOTE_MIN} caracteres)`,
        },
        400,
      )
    }

    if (auth.role === 'conductor') {
      // El conductor trabaja SOLO sus órdenes.
      if (order.driverId !== auth.id) {
        return c.json({ success: false, error: 'Orden no encontrada' }, 404)
      }
      const allowedDriver: Record<string, OrderStatus[]> = {
        created: ['accepted', 'cancelled'],
        accepted: ['in_transit', 'cancelled'],
        in_transit: ['delivered', 'cancelled'],
      }
      if (!(allowedDriver[current] ?? []).includes(target)) {
        return c.json(
          { success: false, error: `No se puede pasar de "${current}" a "${target}"` },
          400,
        )
      }
    } else {
      // Superadmin = respaldo: cualquier transición válida del modelo.
      if (!TRANSITIONS[current].includes(target)) {
        return c.json(
          { success: false, error: `No se puede pasar de "${current}" a "${target}"` },
          400,
        )
      }
    }

    // Entregar exige saldo 0. Efectivo pendiente → se cobra en el acto (auto).
    if (target === 'delivered') {
      const paid = await paidForOrder(order.id)
      const total = toNumber(order.amount)
      let balance = total - paid

      if (balance > 0.005) {
        const [method] = await db
          .select({ code: paymentMethods.code })
          .from(paymentMethods)
          .where(eq(paymentMethods.id, order.paymentMethodId))
          .limit(1)
        if (method?.code === CASH_METHOD_CODE) {
          await db.insert(orderPayments).values({
            orderId: order.id,
            paymentMethodId: order.paymentMethodId,
            amount: balance.toFixed(2),
            note: 'Cobro en efectivo en el acto de la entrega',
            recordedBy: auth.id,
          })
          balance = 0
        } else {
          return c.json(
            {
              success: false,
              error: `La orden tiene un saldo pendiente de ${balance.toFixed(2)}. Registrá el pago antes de entregar.`,
            },
            400,
          )
        }
      }
    }

    const patch: Partial<typeof orders.$inferInsert> = {
      orderStatus: target,
      updatedAt: new Date(),
    }
    if (target === 'delivered') {
      patch.deliveredAt = new Date()
      // Con el pago registrado (manual o efectivo auto), la orden queda pagada.
      patch.paymentStatus = 'paid'
    }
    if (target === 'cancelled') {
      const paid = await paidForOrder(order.id)
      // Si no hubo abonos, la orden cancelada no debe figurar como pendiente.
      patch.paymentStatus = paid > 0 ? order.paymentStatus : 'cancelled'
    }

    await db.update(orders).set(patch).where(eq(orders.id, id))

    await db.insert(orderStatusHistory).values({
      orderId: id,
      status: target,
      changedBy: auth.id,
      note: note ?? null,
    })

    // Notificar según quién transicionó.
    if (auth.role === 'conductor') {
      await notifyUser(
        order.sellerId,
        'order_status',
        `Orden ${order.orderNumber} — ${target}`,
        note
          ? `La orden ${order.orderNumber} fue marcada como "${target}" por ${auth.email}. Motivo: ${note}`
          : `La orden ${order.orderNumber} fue marcada como "${target}" por ${auth.email}.`,
        { orderId: id, orderNumber: order.orderNumber, status: target },
      )
    } else if (order.driverId) {
      await notifyUser(
        order.driverId,
        'order_status',
        `Orden ${order.orderNumber} — ${target}`,
        `La orden ${order.orderNumber} cambió a estado "${target}".`,
        { orderId: id, orderNumber: order.orderNumber, status: target },
      )
      await notifyUser(
        order.sellerId,
        'order_status',
        `Orden ${order.orderNumber} — ${target}`,
        `La orden ${order.orderNumber} cambió a estado "${target}".`,
        { orderId: id, orderNumber: order.orderNumber, status: target },
      )
    }

    await writeAuditLog({
      userId: auth.id,
      action: 'order.status_changed',
      metadata: { orderId: id, from: current, to: target },
      ipAddress: clientIp(c),
    })

    // Realtime (WP1): el cambio de estado refresca listas + dashboard de TODOS
    // los involucrados (el conductor que lo hizo también actualiza su vista).
    emitOrderEvent(order, 'order_changed', { action: 'status', status: target })

    const detail = await loadOrderDetail(id)
    return c.json({ success: true, data: detail })
  } catch (error) {
    console.error('Order status error:', error)
    return c.json({ success: false, error: 'Error al actualizar la orden' }, 500)
  }
})

/* ─── POST /:id/payments — registrar abono (multipart) ───
 * Cualquiera con acceso a la orden (vendedor, conductor, superadmin) puede
 * registrar un pago mientras la orden no esté entregada ni cancelada.
 * Campos: amount*, paymentMethodId? (default = método de la orden),
 * reference?, receipt? (imagen), note?
 * Validación por método: pago móvil = referencia y/o foto; tarjeta /
 * transferencia / zelle = referencia; efectivo = ninguno.
 */
router.post('/:id/payments', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const order = await loadOrderRaw(id)
    if (!order || !canAccessOrder(auth, order)) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }
    if (order.orderStatus === 'delivered' || order.orderStatus === 'cancelled') {
      return c.json(
        { success: false, error: 'No se pueden registrar pagos en una orden cerrada' },
        400,
      )
    }

    const body = await c.req.parseBody()
    const amount = Number(body['amount'])
    if (!Number.isFinite(amount) || amount <= 0) {
      return c.json({ success: false, error: 'Escribí un monto válido' }, 400)
    }

    const paid = await paidForOrder(order.id)
    const total = toNumber(order.amount)
    const balance = total - paid
    if (amount > balance + 0.005) {
      return c.json(
        { success: false, error: `El pago excede el saldo (saldo pendiente: ${balance.toFixed(2)})` },
        400,
      )
    }

    // Método real del abono: si no viene, usa el de la orden.
    const requestedMethodId = body['paymentMethodId']
      ? Number(body['paymentMethodId'])
      : order.paymentMethodId
    const [method] = await db
      .select({
        id: paymentMethods.id,
        code: paymentMethods.code,
        requiresReference: paymentMethods.requiresReference,
        requiresReceipt: paymentMethods.requiresReceipt,
      })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, requestedMethodId), eq(paymentMethods.isActive, true)))
      .limit(1)
    if (!method) {
      return c.json({ success: false, error: 'Método de pago no encontrado' }, 400)
    }

    const reference = typeof body['reference'] === 'string' ? body['reference'].trim() : ''
    const note = typeof body['note'] === 'string' ? body['note'].trim() : null
    const receipt = body['receipt']

    const hasReference = reference.length > 0
    const hasReceipt = receipt instanceof File

    // Regla de comprobante según el método (ref y/o foto según flags).
    if (method.requiresReference && !hasReference && !(method.requiresReceipt && hasReceipt)) {
      return c.json(
        {
          success: false,
          error:
            method.requiresReceipt
              ? 'Adjuntá el número de referencia o la foto del comprobante'
              : 'Escribí el número de referencia',
        },
        400,
      )
    }
    if (method.requiresReceipt && !hasReceipt && !hasReference) {
      return c.json(
        { success: false, error: 'Adjuntá la foto del comprobante o el número de referencia' },
        400,
      )
    }

    let receiptUrl: string | null = null
    if (hasReceipt) {
      const ext = ALLOWED_RECEIPT_TYPES[receipt.type]
      if (!ext) {
        return c.json({ success: false, error: 'Formato no permitido. Usá PNG, JPG o WebP.' }, 400)
      }
      if (receipt.size > MAX_RECEIPT_BYTES) {
        return c.json({ success: false, error: 'La imagen supera los 5MB' }, 400)
      }
      const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts')
      await mkdir(uploadsDir, { recursive: true })
      const filename = `${id}-${Date.now()}.${ext}`
      await writeFile(path.join(uploadsDir, filename), Buffer.from(await receipt.arrayBuffer()))
      receiptUrl = `/uploads/receipts/${filename}`
    }

    const [payment] = await db
      .insert(orderPayments)
      .values({
        orderId: id,
        paymentMethodId: method.id,
        amount: amount.toFixed(2),
        reference: reference || null,
        receiptUrl,
        note,
        recordedBy: auth.id,
      })
      .returning()

    await setDerivedPaymentStatus(order)

    await writeAuditLog({
      userId: auth.id,
      action: 'order.payment_created',
      metadata: { orderId: id, paymentId: payment.id, amount: amount.toFixed(2) },
      ipAddress: clientIp(c),
    })

    await notifyUser(
      order.sellerId,
      'order_status',
      `Pago registrado en ${order.orderNumber}`,
      `Se registró un pago de ${amount.toFixed(2)} en la orden ${order.orderNumber}.`,
      { orderId: id, orderNumber: order.orderNumber },
    )

    // Realtime (WP1): si el dashboard muestra saldos/pagos pendientes, se refresca.
    emitOrderEvent(order, 'order_changed', { action: 'payment', amount: amount.toFixed(2) })

    const detail = await loadOrderDetail(id)
    return c.json({ success: true, data: detail }, 201)
  } catch (error) {
    console.error('Register payment error:', error)
    return c.json({ success: false, error: 'Error al registrar el pago' }, 500)
  }
})

/* ─── DELETE /:id/payments/:paymentId — eliminar abono ─── */

router.delete('/:id/payments/:paymentId', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  const paymentId = Number(c.req.param('paymentId'))
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(paymentId) || paymentId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const order = await loadOrderRaw(id)
    if (!order || !canAccessOrder(auth, order)) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }
    if (order.orderStatus === 'delivered' || order.orderStatus === 'cancelled') {
      return c.json(
        { success: false, error: 'No se pueden eliminar pagos de una orden cerrada' },
        400,
      )
    }

    const [payment] = await db
      .select({ id: orderPayments.id })
      .from(orderPayments)
      .where(and(eq(orderPayments.id, paymentId), eq(orderPayments.orderId, id)))
      .limit(1)
    if (!payment) {
      return c.json({ success: false, error: 'Pago no encontrado' }, 404)
    }

    await db.delete(orderPayments).where(eq(orderPayments.id, paymentId))
    await setDerivedPaymentStatus(order)

    await writeAuditLog({
      userId: auth.id,
      action: 'order.payment_deleted',
      metadata: { orderId: id, paymentId },
      ipAddress: clientIp(c),
    })

    emitOrderEvent(order, 'order_changed', { action: 'payment_deleted', paymentId })

    const detail = await loadOrderDetail(id)
    return c.json({ success: true, data: detail })
  } catch (error) {
    console.error('Delete payment error:', error)
    return c.json({ success: false, error: 'Error al eliminar el pago' }, 500)
  }
})

/* ─── Comunicaciones vendedor ↔ conductor ─── */

const messageSchema = z.object({
  message: z.string().trim().min(1, 'El mensaje es requerido').max(2000),
})

/** Tipos de imagen permitidos como adjunto del chat (WP2). */
const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5MB — misma regla que comprobantes

router.post('/:id/communications', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    // WP2: acepta JSON (mensaje puro, compatibilidad) o multipart (mensaje + imagen).
    const contentType = c.req.header('Content-Type') ?? ''
    let message = ''
    let attachment: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody()
      message = typeof body['message'] === 'string' ? body['message'].trim() : ''
      const file = body['attachment']
      attachment = file instanceof File ? file : null
    } else {
      const parsed = messageSchema.safeParse(await c.req.json().catch(() => ({})))
      if (!parsed.success) {
        const first = parsed.error.issues[0]
        return c.json({ success: false, error: first?.message ?? 'El mensaje es requerido' }, 400)
      }
      message = parsed.data.message
    }

    if (!message && !attachment) {
      return c.json(
        { success: false, error: 'Escribí un mensaje o adjuntá una imagen' },
        400,
      )
    }
    if (message.length > 2000) {
      return c.json({ success: false, error: 'El mensaje es demasiado largo (máx 2000)' }, 400)
    }

    let attachmentUrl: string | null = null
    let attachmentMime: string | null = null
    if (attachment) {
      const ext = ALLOWED_ATTACHMENT_TYPES[attachment.type]
      if (!ext) {
        return c.json({ success: false, error: 'Formato no permitido. Usá PNG, JPG o WebP.' }, 400)
      }
      if (attachment.size > MAX_ATTACHMENT_BYTES) {
        return c.json({ success: false, error: 'La imagen supera los 5MB' }, 400)
      }
      const uploadsDir = path.join(process.cwd(), 'uploads', 'communications')
      await mkdir(uploadsDir, { recursive: true })
      const filename = `${id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
      await writeFile(path.join(uploadsDir, filename), Buffer.from(await attachment.arrayBuffer()))
      attachmentUrl = `/uploads/communications/${filename}`
      attachmentMime = attachment.type
    }

    const order = await loadOrderRaw(id)
    if (!order || !canAccessOrder(auth, order)) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }

    // La columna message es NOT NULL (migración sin cambiar el constraint):
    // mensajes solo-imagen guardan '' y el frontend omite la burbuja vacía.
    const [comm] = await db
      .insert(orderCommunications)
      .values({
        orderId: id,
        senderId: auth.id,
        message: message || '',
        attachmentUrl,
        attachmentMime,
      })
      .returning()

    // Avisar al interlocutor (conductor ↔ vendedor).
    if (order.driverId) {
      if (auth.role === 'conductor') {
        await notifyUser(
          order.sellerId,
          'order_message',
          `Mensaje en orden ${order.orderNumber}`,
          message,
          { orderId: id, orderNumber: order.orderNumber },
        )
      } else {
        await notifyUser(
          order.driverId,
          'order_message',
          `Mensaje en orden ${order.orderNumber}`,
          message,
          { orderId: id, orderNumber: order.orderNumber },
        )
        if (auth.role === 'superadmin') {
          await notifyUser(
            order.sellerId,
            'order_message',
            `Mensaje en orden ${order.orderNumber}`,
            message,
            { orderId: id, orderNumber: order.orderNumber },
          )
        }
      }
    }

    // Realtime (WP1): nuevo mensaje → la orden se refresca en las pantallas
    // abiertas de los involucrados (burujas + notificación ya emitida arriba).
    emitOrderEvent(order, 'order_changed', { action: 'chat' })

    return c.json({ success: true, data: comm }, 201)
  } catch (error) {
    console.error('Communication error:', error)
    return c.json({ success: false, error: 'Error al enviar el mensaje' }, 500)
  }
})

router.get('/:id/communications', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const order = await loadOrderRaw(id)
  if (!order || !canAccessOrder(auth, order)) {
    return c.json({ success: false, error: 'Orden no encontrada' }, 404)
  }

  const rows = await db
    .select({
      id: orderCommunications.id,
      senderId: orderCommunications.senderId,
      senderName: users.name,
      message: orderCommunications.message,
      attachmentUrl: orderCommunications.attachmentUrl,
      attachmentMime: orderCommunications.attachmentMime,
      createdAt: orderCommunications.createdAt,
    })
    .from(orderCommunications)
    .leftJoin(users, eq(users.id, orderCommunications.senderId))
    .where(eq(orderCommunications.orderId, id))
    .orderBy(orderCommunications.createdAt)

  return c.json({ success: true, data: { items: rows, total: rows.length } })
})

/* ─── Historial de estados ─── */

router.get('/:id/status-history', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const order = await loadOrderRaw(id)
  if (!order || !canAccessOrder(auth, order)) {
    return c.json({ success: false, error: 'Orden no encontrada' }, 404)
  }

  const rows = await db
    .select({
      id: orderStatusHistory.id,
      status: orderStatusHistory.status,
      note: orderStatusHistory.note,
      changedBy: orderStatusHistory.changedBy,
      changerName: users.name,
      createdAt: orderStatusHistory.createdAt,
    })
    .from(orderStatusHistory)
    .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(orderStatusHistory.createdAt)

  return c.json({ success: true, data: { items: rows, total: rows.length } })
})

export default router
