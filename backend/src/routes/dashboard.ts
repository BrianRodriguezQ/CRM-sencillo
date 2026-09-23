/**
 * Dashboard — métricas por rol (v3, CTO 2026-09).
 *   - superadmin: totals globales + equipo + top operadores + top conductores
 *                 + recientes. El detalle individual del equipo se ve en
 *                 GET /user/:id (páginas /admin/equipo/:id, decisión 3-B).
 *   - operador:   totals de SUS órdenes + clientes top + recientes.
 *   - cobranza:   cuentas por cobrar, resumen financiero, notas de entrega
 *   - conductor:  totals de SU trabajo (incluye ganancia de entregadas) + recientes.
 *
 * Contrato con el frontend (hooks/queries/useDeliveryDashboard):
 *   superadmin: { totals, activeSellers, activeDrivers, totalCustomers,
 *                 topSellers: [{id,name,totalOrders,totalAmount}],
 *                 topDrivers: [{id,name,deliveredCount,totalDelivered}],
 *                 recentOrders: Order[] }
 *   operador:   { totals, myOrders, unassigned,
 *                 topCustomers: [{id,name,totalOrders,totalAmount}],
 *                 recentOrders: Order[] }
 *   cobranza:   { totals, pendingRevenue, pendingOrders, topDebtors,
 *                 recentOrders, paymentStats }
 *   conductor:  { totals, recentOrders }
 *
 * Regla de ingresos v2 (dinero REAL cobrado):
 *   totalRevenue = Σ order_payments (pagos registrados)
 *   - para el conductor: solo pagos de órdenes SUYAS ENTREGADAS (decisión 2-A).
 *   pendingRevenue = Σ orders.amount con paymentStatus pending|partial.
 *   paymentPending = órdenes con flag payment_pending = true (para cobranza).
 */
import { Hono } from 'hono'
import { eq, and, gte, lt, count, desc, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { orders, customers, users, orderPayments, paymentMethods } from '../db/schema.js'
import { authMiddleware, requireRole, requireSuperadmin, requireOperador, requireCobranza } from '../middleware/auth.js'
import type { JWTPayload } from '../utils/jwt.js'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function getWeekNumber(d: Date): number {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7))
  const week1 = new Date(dt.getFullYear(), 0, 4)
  return 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

function startOfToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function toNumber(v: unknown): number {
  return Number.parseFloat(String(v ?? '0'))
}

/** Órdenes "en progreso" = Aceptada + En tránsito (decisión 1-A del CTO). */
const ACTIVE_STATUSES = ['accepted', 'in_transit'] as const
const PENDING_STATUSES = ['pending', 'partial'] as const

interface OrderTotals {
  todayOrders: number
  inProgress: number
  delivered: number
  cancelled: number
  totalRevenue: number
  pendingRevenue: number
  /** Cantidad de órdenes del scope con saldo (paymentStatus pending|partial). */
  pendingPayments: number
}

/**
 * Totals con scope opcional sobre orders.
 * - totalRevenue = SUM(pagos registrados) de las órdenes del scope
 *   (o, si paidScope ='delivered', solo entregadas — usado para el conductor).
 * - pendingRevenue = SUM(amount) de órdenes del scope con pago pendiente/parcial.
 */
async function totalsFor(scope?: SQL, paidScope?: SQL): Promise<OrderTotals> {
  const baseToday = gte(orders.createdAt, startOfToday())

  const [todayRow, inProgRow, delivRow, cancRow, paidRow, pendingRow, pendingCountRow] =
    await Promise.all([
    db
      .select({ count: count() })
      .from(orders)
      .where(scope ? and(scope, baseToday) : baseToday),
    db
      .select({ count: count() })
      .from(orders)
      .where(scope ? and(scope, inArray(orders.orderStatus, [...ACTIVE_STATUSES])) : inArray(orders.orderStatus, [...ACTIVE_STATUSES])),
    db
      .select({ count: count() })
      .from(orders)
      .where(scope ? and(scope, eq(orders.orderStatus, 'delivered')) : eq(orders.orderStatus, 'delivered')),
    db
      .select({ count: count() })
      .from(orders)
      .where(scope ? and(scope, eq(orders.orderStatus, 'cancelled')) : eq(orders.orderStatus, 'cancelled')),
    // Dinero REAL cobrado: sumamos lo registrado en order_payments (no el
    // monto de la orden, que incluiría lo sin cobrar aún).
    db
      .select({ total: sql<string>`coalesce(sum(${orderPayments.amount}), 0)` })
      .from(orderPayments)
      .innerJoin(orders, eq(orders.id, orderPayments.orderId))
      .where(paidScope ?? scope),
    db
      .select({ total: sql<string>`coalesce(sum(${orders.amount}), 0)` })
      .from(orders)
      .where(scope ? and(scope, inArray(orders.paymentStatus, [...PENDING_STATUSES])) : inArray(orders.paymentStatus, [...PENDING_STATUSES])),
    db
      .select({ count: count() })
      .from(orders)
      .where(scope ? and(scope, inArray(orders.paymentStatus, [...PENDING_STATUSES])) : inArray(orders.paymentStatus, [...PENDING_STATUSES])),
  ])

  return {
    todayOrders: Number(todayRow?.[0]?.count ?? 0),
    inProgress: Number(inProgRow?.[0]?.count ?? 0),
    delivered: Number(delivRow?.[0]?.count ?? 0),
    cancelled: Number(cancRow?.[0]?.count ?? 0),
    totalRevenue: toNumber(paidRow?.[0]?.total),
    pendingRevenue: toNumber(pendingRow?.[0]?.total),
    pendingPayments: Number(pendingCountRow?.[0]?.count ?? 0),
  }
}

/** Órdenes recientes con shape Order[] (customer anidado para la tabla del dashboard). */
async function recentOrdersFor(scope?: SQL, limit = 5) {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      amount: orders.amount,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      createdAt: orders.createdAt,
      customerId: orders.customerId,
      customer: { id: customers.id, name: customers.name },
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(scope)
    .orderBy(desc(orders.createdAt))
    .limit(limit)

  return rows.map((r) => ({ ...r, amount: toNumber(r.amount) }))
}

/** Nombre/usuario por id para los rankings. Acepta null (ids de groupBy). */
async function namesFor(ids: ReadonlyArray<number | null | undefined>) {
  const unique = [
    ...new Set(ids.filter((i): i is number => typeof i === 'number' && Number.isInteger(i))),
  ]
  if (unique.length === 0) return new Map<number, string>()
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique))
  return new Map(rows.map((u) => [u.id, u.name]))
}

/* ─── GET / — dashboard superadmin ─── */

router.get('/', requireSuperadmin, async (c) => {
  const [totals, sellerRows, driverRows, [activeOperadores], [activeDrivers], [totalCustomers], recent] =
    await Promise.all([
      totalsFor(),
      // Top 5 operadores por ganancia generada (pagos cobrados a sus pedidos).
      db
        .select({
          sellerId: orders.sellerId,
          totalOrders: count(),
          totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
        })
        .from(orders)
        .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
        .groupBy(orders.sellerId)
        .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`))
        .limit(5),
      // Top 5 conductores: entregadas + dinero cobrado en las entregadas.
      db
        .select({
          driverId: orders.driverId,
          deliveredCount: sql<number>`count(*) filter (where ${orders.orderStatus} = 'delivered')`,
          totalDelivered: sql<string>`coalesce(sum(case when ${orders.orderStatus} = 'delivered' then ${orderPayments.amount} else 0 end), 0)`,
        })
        .from(orders)
        .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
        .where(sql`${orders.driverId} is not null`)
        .groupBy(orders.driverId)
        .orderBy(desc(sql`coalesce(sum(case when ${orders.orderStatus} = 'delivered' then ${orderPayments.amount} else 0 end), 0)`))
        .limit(5),
      db.select({ count: count() }).from(users).where(eq(users.role, 'operador')),
      db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.role, 'conductor'), eq(users.isActive, true))),
      db.select({ count: count() }).from(customers).where(eq(customers.isActive, true)),
      recentOrdersFor(),
    ])

  const sellerNames = await namesFor(sellerRows.map((r) => r.sellerId))
  const driverNames = await namesFor(driverRows.map((r) => r.driverId))

  return c.json({
    success: true,
    data: {
      totals,
      activeOperadores: Number(activeOperadores?.count ?? 0),
      activeDrivers: Number(activeDrivers?.count ?? 0),
      totalCustomers: Number(totalCustomers?.count ?? 0),
      topOperadores: sellerRows.map((r) => ({
        id: r.sellerId,
        name: sellerNames.get(r.sellerId) ?? `Operador ${r.sellerId}`,
        totalOrders: Number(r.totalOrders),
        totalAmount: toNumber(r.totalAmount),
      })),
      topDrivers: driverRows.map((r) => ({
        id: r.driverId,
        name: driverNames.get(r.driverId ?? -1) ?? `Conductor ${r.driverId ?? '-'}`,
        deliveredCount: Number(r.deliveredCount),
        totalDelivered: toNumber(r.totalDelivered),
      })),
      recentOrders: recent,
    },
  })
})

/* ─── GET /operador — dashboard del operador ─── */

router.get('/operador', requireOperador, async (c) => {
  const auth = c.get('user')
  const scope: SQL = eq(orders.sellerId, auth.id)

  const [totals, myOrdersRow, unassignedRow, custRows, recent] = await Promise.all([
    totalsFor(scope, scope),
    db
      .select({ count: count() })
      .from(orders)
      .where(scope)
      .then((r) => Number(r[0]?.count ?? 0)),
    // "Sin asignar": creadas por mí, sin conductor y todavía en Inicio
    // (decisión 1-A: card separada para el operador).
    db
      .select({ count: count() })
      .from(orders)
      .where(and(scope, eq(orders.orderStatus, 'created'), sql`${orders.driverId} is null`)),
    db
      .select({
        customerId: orders.customerId,
        customerName: customers.name,
        totalOrders: count(),
        totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
      })
      .from(orders)
      .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(scope)
      .groupBy(orders.customerId, customers.name)
      .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`))
      .limit(5),
    recentOrdersFor(scope),
  ])

  return c.json({
    success: true,
    data: {
      totals,
      myOrders: Number(myOrdersRow),
      // Órdenes tuyas sin conductor asignado (todavía en Inicio).
      unassigned: Number(unassignedRow?.[0]?.count ?? 0),
      topCustomers: custRows.map((r) => ({
        id: r.customerId,
        name: r.customerName ?? `Cliente ${r.customerId}`,
        totalOrders: Number(r.totalOrders),
        totalAmount: toNumber(r.totalAmount),
      })),
      recentOrders: recent,
    },
  })
})


/* ─── GET /cobranza — dashboard de cobranza ─── */

router.get('/cobranza', requireCobranza, async (c) => {
  // Cobranza ve todas las órdenes con paymentStatus pendiente/parcial + payment_pending = true
  const pendingScope = inArray(orders.paymentStatus, ['pending', 'partial'])
  const paymentPendingScope = and(pendingScope, eq(orders.paymentPending, true))

  const [totals, pendingRevenueRow, pendingOrdersRow, debtorRows, recent, paymentStatsRows] = await Promise.all([
    totalsFor(), // global totals
    // Ingresos pendientes totales (suma de amount donde paymentStatus pending/partial)
    db
      .select({ total: sql<string>`coalesce(sum(${orders.amount}), 0)` })
      .from(orders)
      .where(pendingScope),
    // Cantidad de órdenes pendientes
    db
      .select({ count: count() })
      .from(orders)
      .where(pendingScope),
    // Top deudores: clientes con mayor monto pendiente
    db
      .select({
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        pendingAmount: sql<string>`coalesce(sum(${orders.amount}), 0)`,
        pendingOrders: count(),
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(pendingScope)
      .groupBy(orders.customerId, customers.name, customers.phone, customers.email)
      .orderBy(desc(sql`coalesce(sum(${orders.amount}), 0)`))
      .limit(10),
    recentOrdersFor(),
    // Estadísticas de pagos por método
    db
      .select({
        method: paymentMethods.name,
        methodCode: paymentMethods.code,
        totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
        count: count(),
      })
      .from(orderPayments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, orderPayments.paymentMethodId))
      .groupBy(paymentMethods.name, paymentMethods.code)
      .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`)),
  ])

  const pendingRevenue = toNumber(pendingRevenueRow?.[0]?.total)
  const pendingOrders = Number(pendingOrdersRow?.[0]?.count ?? 0)

  return c.json({
    success: true,
    data: {
      totals,
      pendingRevenue,
      pendingOrders,
      topDebtors: debtorRows.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName ?? `Cliente ${r.customerId}`,
        customerPhone: r.customerPhone,
        customerEmail: r.customerEmail,
        pendingAmount: toNumber(r.pendingAmount),
        pendingOrders: Number(r.pendingOrders),
      })),
      recentOrders: recent,
      paymentStats: paymentStatsRows.map((r) => ({
        method: r.method,
        methodCode: r.methodCode,
        totalAmount: toNumber(r.totalAmount),
        count: Number(r.count),
      })),
    },
  })
})

/* ─── GET /driver — dashboard del conductor ─── */

router.get('/driver', requireRole('conductor'), async (c) => {
  const auth = c.get('user')
  const scope: SQL = eq(orders.driverId, auth.id)
  // Decisión 2-A: el ingreso del conductor = entregadas y pagadas que atendió.
  const paidScope = and(scope, eq(orders.orderStatus, 'delivered'))

  const [totals, recent] = await Promise.all([
    totalsFor(scope, paidScope),
    recentOrdersFor(scope),
  ])

  return c.json({
    success: true,
    data: {
      totals,
      recentOrders: recent,
    },
  })
})

/* ─── GET /user/:id — detalle de rendimiento de un miembro (solo superadmin) ───
 * Decisión 3-B: el superadmin ve la métrica individual navegando a
 * /admin/equipo/:id. Targets válidos: operador, cobranza o conductor.
 */

router.get('/user/:id', requireSuperadmin, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role }) 
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) {
    return c.json({ success: false, error: 'Miembro no encontrado' }, 404)
  }
  if (target.role === 'superadmin') {
    return c.json({ success: false, error: 'No aplica para el superadmin' }, 400)
  }
  if (target.role === 'cobranza') {
    return c.json({ success: false, error: 'Cobranza no tiene métrica individual por usuario' }, 400)
  }

  const scope: SQL =
    target.role === 'conductor' ? eq(orders.driverId, id) : eq(orders.sellerId, id)
  // Conductor: ingreso = sus entregadas y pagadas (2-A). Operador: todos sus pagos.
  const paidScope =
    target.role === 'conductor' ? and(scope, eq(orders.orderStatus, 'delivered')) : scope

  const [totals, unassignedRow, deliveredRow, topCustomers, recent] = await Promise.all([
    totalsFor(scope, paidScope),
    target.role === 'operador'
      ? db
          .select({ count: count() })
          .from(orders)
          .where(and(scope, eq(orders.orderStatus, 'created'), sql`${orders.driverId} is null`))
      : Promise.resolve([{ count: 0 }]),
    target.role === 'conductor'
      ? db
          .select({ count: count() })
          .from(orders)
          .where(and(scope, eq(orders.orderStatus, 'delivered')))
      : Promise.resolve([{ count: 0 }]),
    target.role === 'operador'
      ? db
          .select({
            customerId: orders.customerId,
            totalOrders: count(),
            totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
          })
          .from(orders)
          .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
          .where(scope)
          .groupBy(orders.customerId)
          .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`))
          .limit(5)
      : Promise.resolve([]),
    recentOrdersFor(scope, 10),
  ])

  const customerNames = await namesFor(topCustomers.map((r) => r.customerId))

  return c.json({
    success: true,
    data: {
      user: { id: target.id, name: target.name, role: target.role },
      totals,
      // Métricas específicas del rol (0 para el que no corresponde).
      unassigned: target.role === 'operador' ? Number(unassignedRow?.[0]?.count ?? 0) : 0,
      delivered: target.role === 'conductor' ? Number(deliveredRow?.[0]?.count ?? 0) : 0,
      topCustomers: topCustomers.map((r) => ({
        id: r.customerId,
        name: customerNames.get(r.customerId) ?? `Cliente ${r.customerId}`,
        totalOrders: Number(r.totalOrders),
        totalAmount: toNumber(r.totalAmount),
      })),
      recentOrders: recent,
    },
  })
})

/* ─── GET /revenue-series — series temporales de revenue (solo superadmin) ───
 * Query: ?periodo=semana|mes&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Default: últimos 8 semanas o 6 meses.
 * Devuelve: { periodo, series: [{ fecha, cobrado, porCobrar, total }, ...] }
 *
 * "Cobrado" = órdenes con paymentStatus='paid' (facturadas), bucket por deliveredAt/updatedAt
 * "Por cobrar" = órdenes con paymentStatus='pending'|'partial', bucket por createdAt
 */
router.get(
  '/revenue-series',
  requireSuperadmin,
  zValidator('query', z.object({
    periodo: z.enum(['semana', 'mes']).default('semana'),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })),
  async (c) => {
    const q = c.req.valid('query')
    const periodo = q.periodo
    const hasta = q.hasta ? parseLocalDate(q.hasta) : new Date()
    const desde = q.desde
      ? parseLocalDate(q.desde)
      : periodo === 'semana'
        ? new Date(hasta.getTime() - 7 * 8 * 24 * 60 * 60 * 1000) // 8 semanas
        : new Date(hasta.getFullYear(), hasta.getMonth() - 5, 1) // 6 meses

    // Generar buckets (lunes de cada semana / 1ro de cada mes)
    const buckets: Date[] = []
    const cursor = new Date(desde)
    if (periodo === 'semana') {
      const day = cursor.getDay()
      const diff = day === 0 ? -6 : 1 - day
      cursor.setDate(cursor.getDate() + diff)
      while (cursor <= hasta) {
        buckets.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 7)
      }
    } else {
      cursor.setDate(1)
      cursor.setHours(0, 0, 0, 0)
      while (cursor <= hasta) {
        buckets.push(new Date(cursor))
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    const periodInterval = periodo === 'semana' ? sql.raw("'week'") : sql.raw("'month'")
    const bucketFormat = periodo === 'semana'
      ? sql.raw("to_char(date_trunc('week', ts), 'IYYY-\"W\"IW')")
      : sql.raw("to_char(date_trunc('month', ts), 'YYYY-MM')")

    // "Cobrado": órdenes CON paymentStatus='paid' (facturadas), bucket por deliveredAt (o updatedAt si no hay deliveredAt)
    const paidDateExpr = sql`coalesce(${orders.deliveredAt}, ${orders.updatedAt})`
    const paidRows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc(${periodInterval}, ${paidDateExpr}), ${periodo === 'semana' ? sql.raw("'IYYY-\"W\"IW'") : sql.raw("'YYYY-MM'")})`,
        total: sql<string>`coalesce(sum(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(and(
        eq(orders.paymentStatus, 'paid'),
        gte(paidDateExpr, desde),
        lt(paidDateExpr, hasta),
      ))
      .groupBy(sql`date_trunc(${periodInterval}, ${paidDateExpr})`)

    // "Por cobrar": órdenes con paymentStatus pending|partial, bucket por createdAt
    const pendingRows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc(${periodInterval}, ${orders.createdAt}), ${periodo === 'semana' ? sql.raw("'IYYY-\"W\"IW'") : sql.raw("'YYYY-MM'")})`,
        total: sql<string>`coalesce(sum(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(and(
        inArray(orders.paymentStatus, ['pending', 'partial']),
        gte(orders.createdAt, desde),
        lt(orders.createdAt, hasta),
      ))
      .groupBy(sql`date_trunc(${periodInterval}, ${orders.createdAt})`)

    const paidMap = new Map(paidRows.map((r) => [r.bucket, toNumber(r.total)]))
    const pendingMap = new Map(pendingRows.map((r) => [r.bucket, toNumber(r.total)]))

    const formatBucket = (d: Date) => periodo === 'semana'
      ? `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, '0')}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const series = buckets.map((d) => {
      const key = formatBucket(d)
      const cobrado = paidMap.get(key) ?? 0
      const porCobrar = pendingMap.get(key) ?? 0
      return {
        fecha: key,
        label: periodo === 'semana'
          ? `Sem ${getWeekNumber(d)} (${formatDay(d)} - ${formatDay(new Date(d.getTime() + 6*86400000))})`
          : d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
        cobrado,
        porCobrar,
        total: cobrado + porCobrar,
      }
    })

    return c.json({ success: true, data: { periodo, series } })
  },
)

/* ─── GET /top-clients — top clientes por período (solo superadmin) ───
 * Query: ?periodo=semana|mes&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limite=10
 */
router.get(
  '/top-clients',
  requireSuperadmin,
  zValidator('query', z.object({
    periodo: z.enum(['semana', 'mes']).default('semana'),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limite: z.coerce.number().int().min(1).max(50).default(10),
  })),
  async (c) => {
    const q = c.req.valid('query')
    const periodo = q.periodo
    const hasta = q.hasta ? parseLocalDate(q.hasta) : new Date()
    const desde = q.desde
      ? parseLocalDate(q.desde)
      : periodo === 'semana'
        ? new Date(hasta.getTime() - 7 * 8 * 24 * 60 * 60 * 1000)
        : new Date(hasta.getFullYear(), hasta.getMonth() - 5, 1)

    const rows = await db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        totalOrders: count(),
        totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .where(and(
        gte(orders.createdAt, desde),
        lt(orders.createdAt, hasta),
      ))
      .groupBy(customers.id, customers.name)
      .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`))
      .limit(q.limite)

    return c.json({
      success: true,
      data: rows.map((r) => ({
        id: r.customerId,
        name: r.customerName,
        totalOrders: Number(r.totalOrders),
        totalAmount: toNumber(r.totalAmount),
      })),
    })
  },
)

export default router
