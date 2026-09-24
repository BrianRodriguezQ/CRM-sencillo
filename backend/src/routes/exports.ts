/**
 * Exports — planillas Excel (.xlsx) de los reportes del CRM.
 *
 * Todos los endpoints exigen rol superadmin (el dueño del sistema exporta
 * los datos para respaldo/análisis; el resto de roles opera sobre las
 * pantallas).
 *
 * Generación: exceljs v4 → Workbook → writeBuffer() → Response binario con
 * el MISMO mecanismo que usa reports.ts para el PDF (bytes en `new Response`),
 * solo cambiando el Content-Type y el Content-Disposition.
 *
 * Rutas:
 *   GET /exports/clientes.xlsx        — cartera completa (grupos + sucursales)
 *   GET /exports/usuarios.xlsx        — equipo de trabajo
 *   GET /exports/conductores.xlsx     — conductores + su carga de órdenes
 *   GET /exports/pedidos.xlsx         — pedidos con saldo (pending|partial)
 *   GET /exports/notas-entrega.xlsx   — MISMA query que /reports/delivery-notes-data
 *   GET /exports/cobranza.xlsx        — deudores + stats por método + detalle
 *                                     de pedidos pendientes (3 hojas)
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, asc, desc, count, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import ExcelJS from 'exceljs'
import { db } from '../db/index.js'
import {
  users,
  customers,
  paymentMethods,
  orders,
  orderPayments,
  sessions,
} from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { buildDeliveryGroups } from './reports.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const sellerAlias = alias(users, 'seller')
const driverAlias = alias(users, 'driver')
const branchAlias = alias(customers, 'branch')
const parentAlias = alias(customers, 'parent')

const PENDING_STATUSES = ['pending', 'partial'] as const

/** Mapeo rol (código en DB) → label legible en la planilla. */
const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  operador: 'Operador',
  cobranza: 'Cobranza',
  conductor: 'Conductor',
}

const PAID_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
}

function toNumber(v: unknown): number {
  return Number.parseFloat(String(v ?? '0'))
}

function yesNo(v: unknown): string {
  return v ? 'Sí' : 'No'
}

function formatDay(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${formatDay(date)} ${hh}:${mi}`
}

/** Devuelve el xlsx como Response binario (mismo mecanismo que el PDF de reports.ts). */
async function sendWorkbook(
  wb: ExcelJS.Workbook,
  filename: string,
): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer()
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Crea una hoja con columnas definidas y encabezado en negrita (estándar del reporte). */
function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Partial<ExcelJS.Column>[],
  rows: Record<string, unknown>[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name)
  ws.columns = columns
  ws.addRows(rows)
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).alignment = { vertical: 'middle' }
  return ws
}

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/clientes.xlsx — cartera completa (grupos + sucursales)
 * ═══════════════════════════════════════════════════════════════════════ */

router.get('/clientes.xlsx', requireRole('superadmin'), async () => {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      rif: customers.rif,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      isGroup: customers.isGroup,
      parentId: customers.parentId,
      parentName: parentAlias.name,
      isActive: customers.isActive,
    })
    .from(customers)
    .leftJoin(parentAlias, eq(parentAlias.id, customers.parentId))
    .orderBy(asc(customers.name))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'
  addSheet(
    wb,
    'Clientes',
    [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Nombre', key: 'name', width: 32 },
      { header: 'RIF', key: 'rif', width: 16 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Dirección', key: 'address', width: 40 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Grupo Padre', key: 'grupoPadre', width: 30 },
      { header: '¿Activo?', key: 'activo', width: 10 },
    ],
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      rif: r.rif ?? '—',
      phone: r.phone ?? '—',
      email: r.email ?? '—',
      address: r.address ?? '—',
      tipo: r.isGroup ? 'Grupo' : r.parentId ? 'Sucursal' : 'Individual',
      grupoPadre: r.parentName ?? (r.isGroup ? '—' : '—'),
      activo: yesNo(r.isActive),
    })),
  )

  return sendWorkbook(wb, 'clientes.xlsx')
})

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/usuarios.xlsx — equipo de trabajo
 * ═══════════════════════════════════════════════════════════════════════ */

router.get('/usuarios.xlsx', requireRole('superadmin'), async () => {
  const [rows, sessionRows] = await Promise.all([
    db.select().from(users).orderBy(users.role, users.name),
    // Última sesión de cada miembro (D2 — tabla sessions con lastUsedAt).
    db
      .select({
        userId: sessions.userId,
        lastUsedAt: sql<Date>`max(${sessions.lastUsedAt})`,
      })
      .from(sessions)
      .groupBy(sessions.userId),
  ])

  const lastSessionByUser = new Map(sessionRows.map((s) => [s.userId, s.lastUsedAt]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'
  addSheet(
    wb,
    'Usuarios',
    [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Rol', key: 'rol', width: 14 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: '¿Activo?', key: 'activo', width: 10 },
      { header: 'Última sesión', key: 'ultimaSesion', width: 20 },
    ],
    rows.map((u) => ({
      id: u.id,
      name: u.lastName ? `${u.name} ${u.lastName}` : u.name,
      email: u.email,
      rol: ROLE_LABELS[u.role] ?? u.role,
      phone: u.phone ?? '—',
      activo: yesNo(u.isActive),
      ultimaSesion: formatDateTime(lastSessionByUser.get(u.id) ?? null),
    })),
  )

  return sendWorkbook(wb, 'usuarios.xlsx')
})

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/conductores.xlsx — conductores + carga de órdenes
 * ═══════════════════════════════════════════════════════════════════════ */

router.get('/conductores.xlsx', requireRole('superadmin'), async () => {
  const drivers = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.role, 'conductor'))
    .orderBy(users.name)

  // Órdenes activas (created/accepted/in_transit) y entregadas, en UNA query
  // con Filtros agregados (FILTER WHERE → real Postgres, PGlite incluido).
  const counts = drivers.length
    ? await db
        .select({
          driverId: orders.driverId,
          active: sql<number>`count(*) filter (where ${orders.orderStatus} in ('created','accepted','in_transit'))`,
          delivered: sql<number>`count(*) filter (where ${orders.orderStatus} = 'delivered')`,
        })
        .from(orders)
        .where(inArray(orders.driverId, drivers.map((d) => d.id)))
        .groupBy(orders.driverId)
    : []

  const countsByDriver = new Map(counts.map((c) => [c.driverId, c]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'
  addSheet(
    wb,
    'Conductores',
    [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: '¿Activo?', key: 'activo', width: 10 },
      { header: 'Órdenes activas', key: 'activas', width: 15 },
      { header: 'Órdenes entregadas', key: 'entregadas', width: 18 },
    ],
    drivers.map((d) => {
      const c = countsByDriver.get(d.id)
      return {
        id: d.id,
        name: d.name,
        phone: d.phone ?? '—',
        email: d.email ?? '—',
        activo: yesNo(d.isActive),
        activas: Number(c?.active ?? 0),
        entregadas: Number(c?.delivered ?? 0),
      }
    }),
  )

  return sendWorkbook(wb, 'conductores.xlsx')
})

/* ═══════════════════════════════════════════════════════════════════════
 * Pedidos con saldo (paymentStatus pending|partial) + el abonado real de
 * cada uno → base compartida para /pedidos.xlsx y la hoja "Detalle pedidos
 * pendientes" de /cobranza.xlsx (MISMO scope que el dashboard de cobranza,
 * cero drift).
 * ═══════════════════════════════════════════════════════════════════════ */

/** Últimos pedidos con saldo pendiente, con lo ya abonado (saldo = monto − pagado). */
async function pendingOrderRows() {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      amount: orders.amount,
      paymentStatus: orders.paymentStatus,
      paymentPending: orders.paymentPending,
      customerId: customers.id,
      customerName: customers.name,
      branchId: orders.branchId,
      branchName: branchAlias.name,
      paymentMethodName: paymentMethods.name,
      driverName: driverAlias.name,
      driverId: orders.driverId,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .leftJoin(driverAlias, eq(driverAlias.id, orders.driverId))
    .leftJoin(branchAlias, eq(branchAlias.id, orders.branchId))
    .where(inArray(orders.paymentStatus, [...PENDING_STATUSES]))
    .orderBy(desc(orders.createdAt))

  // Abonos registrados por orden (pagado) → saldo = monto − pagado.
  const paidRows = rows.length
    ? await db
        .select({
          orderId: orderPayments.orderId,
          total: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
        })
        .from(orderPayments)
        .where(inArray(orderPayments.orderId, rows.map((r) => r.id)))
        .groupBy(orderPayments.orderId)
    : []
  const paidByOrder = new Map(paidRows.map((p) => [p.orderId, toNumber(p.total)]))

  return rows.map((r) => ({ ...r, paid: paidByOrder.get(r.id) ?? 0 }))
}

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/pedidos.xlsx — pedidos con saldo (los que le interesan a
 * cobranza: paymentStatus pending|partial — mismo scope que el dashboard).
 * ═══════════════════════════════════════════════════════════════════════ */

router.get('/pedidos.xlsx', requireRole('superadmin'), async () => {
  const rows = await pendingOrderRows()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'
  addSheet(
    wb,
    'Pedidos pendientes',
    [
      { header: 'Nº orden', key: 'orderNumber', width: 18 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Sucursal', key: 'sucursal', width: 26 },
      { header: 'Método pago', key: 'metodo', width: 16 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Pagado', key: 'pagado', width: 12 },
      { header: 'Saldo', key: 'saldo', width: 12 },
      { header: 'Estado pago', key: 'estado', width: 12 },
      { header: 'Conductor', key: 'conductor', width: 24 },
      { header: '¿Pago pendiente?', key: 'pendiente', width: 15 },
    ],
    rows.map((r) => {
      const monto = toNumber(r.amount)
      return {
        orderNumber: r.orderNumber,
        fecha: formatDay(r.createdAt),
        cliente: r.customerName,
        sucursal: r.branchName ?? '—',
        metodo: r.paymentMethodName,
        monto,
        pagado: r.paid,
        saldo: Math.max(0, monto - r.paid),
        estado: PAID_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus,
        conductor: r.driverName ?? '—',
        pendiente: yesNo(r.paymentPending),
      }
    }),
  )

  return sendWorkbook(wb, 'pedidos-pendientes.xlsx')
})

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/notas-entrega.xlsx — el MISMO corte que el PDF de notas de
 * entrega (reutiliza buildDeliveryGroups de reports.ts; mismos query params
 * clienteId / branchId / periodo / fecha → misma query, cero drift).
 * ═══════════════════════════════════════════════════════════════════════ */

const deliveryQuerySchema = z.object({
  clienteId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  periodo: z.enum(['dia', 'semana', 'mes']).optional().default('dia'),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
    .optional(),
})

router.get(
  '/notas-entrega.xlsx',
  requireRole('superadmin'),
  zValidator('query', deliveryQuerySchema),
  async (c) => {
    const auth = c.get('user')
    const q = c.req.valid('query')

    const result = await buildDeliveryGroups({
      clienteId: q.clienteId,
      branchId: q.branchId,
      periodo: q.periodo,
      fecha: q.fecha,
      auth,
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'L&L System'

    const rows: Record<string, unknown>[] = []
    // Sucursal + dirección de entrega por orden (una query extra; no está en
    // el DeliveryRow compartido y no vale la pena tocar el shape del PDF).
    const orderIds = result.rows.map((r) => r.id)
    const deliveryInfo = orderIds.length
      ? await db
          .select({
            orderId: orders.id,
            branchName: branchAlias.name,
            branchAddress: branchAlias.address,
            deliveryAddress: orders.deliveryAddress,
            customerAddress: customers.address,
          })
          .from(orders)
          .leftJoin(branchAlias, eq(branchAlias.id, orders.branchId))
          .innerJoin(customers, eq(customers.id, orders.customerId))
          .where(inArray(orders.id, orderIds))
      : []
    const infoByOrder = new Map(deliveryInfo.map((i) => [i.orderId, i]))

    for (const group of result.clientGroups) {
      for (const order of group.orders) {
        const info = infoByOrder.get(order.id)
        const sucursal = info?.branchName ?? '—'
        // "Entrega dirigida a": la dirección física donde se entrega.
        const dirigidaA =
          info?.deliveryAddress || info?.branchAddress || info?.customerAddress || '—'
        const items = result.itemsByOrder.get(order.id) ?? []

        if (items.length === 0) {
          rows.push({
            orderNumber: order.orderNumber,
            cliente: group.name,
            sucursal,
            fecha: formatDay(order.deliveredAt),
            producto: 'Sin detalle de productos',
            cantidad: '',
            precioUnitario: '',
            subtotal: toNumber(order.amount),
            dirigidaA,
          })
          continue
        }

        for (const it of items) {
          const unit = toNumber(it.unitPrice)
          rows.push({
            orderNumber: order.orderNumber,
            cliente: group.name,
            sucursal,
            fecha: formatDay(order.deliveredAt),
            producto: it.productName,
            cantidad: it.quantity,
            precioUnitario: unit,
            subtotal: unit * it.quantity,
            dirigidaA,
          })
        }
      }
    }

    addSheet(
      wb,
      'Notas de entrega',
      [
        { header: 'Nº orden', key: 'orderNumber', width: 18 },
        { header: 'Cliente', key: 'cliente', width: 30 },
        { header: 'Sucursal', key: 'sucursal', width: 26 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Producto', key: 'producto', width: 32 },
        { header: 'Cantidad', key: 'cantidad', width: 10 },
        { header: 'Precio unitario', key: 'precioUnitario', width: 14 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'Entrega dirigida a', key: 'dirigidaA', width: 40 },
      ],
      rows,
    )

    const fechaTag = q.fecha ?? formatDay(new Date()).split('/').reverse().join('-')
    return sendWorkbook(wb, `notas-entrega-${q.periodo}-${fechaTag}.xlsx`)
  },
)

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/cobranza.xlsx — cuentas por cobrar (3 hojas):
 *   - Deudores: clientes con saldo pendiente + contacto completo
 *     (teléfono, email, RIF, dirección, tipo) — scope de topDebtors
 *   - Detalle pedidos pendientes: CADA pedido con saldo (comparte la query
 *     de /pedidos.xlsx vía pendingOrderRows)
 *   - Por método: lo cobrado por método de pago (paymentStats)
 * ═══════════════════════════════════════════════════════════════════════ */

router.get('/cobranza.xlsx', requireRole('superadmin'), async () => {
  const [debtorRows, statsRows, pendingRows] = await Promise.all([
    db
      .select({
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        customerRif: customers.rif,
        customerAddress: customers.address,
        isGroup: customers.isGroup,
        parentId: customers.parentId,
        pendingAmount: sql<string>`coalesce(sum(${orders.amount}), 0)`,
        pendingOrders: count(),
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(inArray(orders.paymentStatus, [...PENDING_STATUSES]))
      .groupBy(
        orders.customerId,
        customers.name,
        customers.phone,
        customers.email,
        customers.rif,
        customers.address,
        customers.isGroup,
        customers.parentId,
      )
      .orderBy(desc(sql`coalesce(sum(${orders.amount}), 0)`)),
    db
      .select({
        method: paymentMethods.name,
        totalAmount: sql<string>`coalesce(sum(${orderPayments.amount}), 0)`,
        count: count(),
      })
      .from(orderPayments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, orderPayments.paymentMethodId))
      .groupBy(paymentMethods.name)
      .orderBy(desc(sql`coalesce(sum(${orderPayments.amount}), 0)`)),
    pendingOrderRows(),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'

  addSheet(
    wb,
    'Deudores',
    [
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'RIF', key: 'rif', width: 16 },
      { header: 'Dirección', key: 'direccion', width: 40 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Monto pendiente', key: 'pendiente', width: 16 },
      { header: 'Pedidos pendientes', key: 'pedidos', width: 18 },
    ],
    debtorRows.map((r) => ({
      cliente: r.customerName,
      telefono: r.customerPhone ?? '—',
      email: r.customerEmail ?? '—',
      rif: r.customerRif ?? '—',
      direccion: r.customerAddress ?? '—',
      // Mismo criterio que clientes.xlsx: Grupo / Sucursal / Individual.
      tipo: r.isGroup ? 'Grupo' : r.parentId ? 'Sucursal' : 'Individual',
      pendiente: toNumber(r.pendingAmount),
      pedidos: Number(r.pendingOrders),
    })),
  )

  addSheet(
    wb,
    'Detalle pedidos pendientes',
    [
      { header: 'Nº orden', key: 'orderNumber', width: 18 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Método pago', key: 'metodo', width: 16 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Pagado', key: 'pagado', width: 12 },
      { header: 'Saldo', key: 'saldo', width: 12 },
      { header: 'Conductor', key: 'conductor', width: 24 },
      { header: 'Estado', key: 'estado', width: 12 },
    ],
    pendingRows.map((r) => {
      const monto = toNumber(r.amount)
      return {
        orderNumber: r.orderNumber,
        fecha: formatDay(r.createdAt),
        cliente: r.customerName,
        metodo: r.paymentMethodName,
        monto,
        pagado: r.paid,
        saldo: Math.max(0, monto - r.paid),
        conductor: r.driverName ?? '—',
        estado: PAID_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus,
      }
    }),
  )

  addSheet(
    wb,
    'Por método',
    [
      { header: 'Método', key: 'metodo', width: 20 },
      { header: 'Monto cobrado', key: 'monto', width: 16 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
    ],
    statsRows.map((r) => ({
      metodo: r.method,
      monto: toNumber(r.totalAmount),
      cantidad: Number(r.count),
    })),
  )

  return sendWorkbook(wb, 'cobranza.xlsx')
})

export default router