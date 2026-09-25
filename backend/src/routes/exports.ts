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
 *   GET /exports/cobranza.xlsx        — formato estilizado (PUNTO 8 del CTO):
 *                                     cuentas por grupo/franquicia (título por
 *                                     grupo + filas por sucursal) y entradas
 *                                     del mes con barras embebidas (2 hojas)
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, asc, desc, count, inArray, sql, gte, lt, isNotNull } from 'drizzle-orm'
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
import { buildDeliveryGroups, paymentLabel } from './reports.js'
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
            estadoPago: paymentLabel(String(order.paymentStatus ?? '')).text,
            saldo:
              order.paymentStatus === 'paid'
                ? 0
                : Math.max(0, toNumber(order.amount) - (result.paidByOrder.get(order.id) ?? 0)),
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
            estadoPago: paymentLabel(String(order.paymentStatus ?? '')).text,
            saldo:
              order.paymentStatus === 'paid'
                ? 0
                : Math.max(0, toNumber(order.amount) - (result.paidByOrder.get(order.id) ?? 0)),
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
        { header: 'Estado de pago', key: 'estadoPago', width: 14 },
        { header: 'Saldo', key: 'saldo', width: 12 },
        { header: 'Entrega dirigida a', key: 'dirigidaA', width: 40 },
      ],
      rows,
    )

    const fechaTag = q.fecha ?? formatDay(new Date()).split('/').reverse().join('-')
    return sendWorkbook(wb, `notas-entrega-${q.periodo}-${fechaTag}.xlsx`)
  },
)

/* ═══════════════════════════════════════════════════════════════════════
 * GET /exports/cobranza.xlsx — CUENTAS POR COBRAR en formato estilizado
 * (PUNTO 8 del CTO — reformulación del export de cobranza).
 *
 * Hoja 1 "Cuentas por grupo": cada grupo/franquicia con su TÍTULO (nombre
 * del grupo en negrita con fondo ámbar), debajo UNA FILA POR SUCURSAL con
 * los datos de cada cuenta dedicada (RIF, teléfono, email, dirección,
 * contacto) + monto pendiente y pedidos pendientes de ESA sucursal, y al
 * final el subtotal del grupo. Se incluyen TODOS los grupos aunque no
 * tengan deuda (0s): el usuario los necesita para llevar el registro de la
 * cartera completa.
 *
 * Monto pendiente por sucursal = SUM(orders.amount) de órdenes con saldo
 * (paymentStatus pending|partial) cuyo branchId = esa sucursal. Las órdenes
 * CONSOLIDADAS del grupo (customerId = grupo y branchId null) suman aparte
 * como fila "Consolidado del grupo". Mismo criterio que el dashboard de
 * cobranza (cero drift).
 *
 * Hoja 2 "Entradas del mes": desglose del MES CORRIENTE —
 *   - COBRADAS: pagos registrados (order_payments) del mes, por método de
 *     pago con monto y cantidad.
 *   - POR COBRAR: órdenes pendientes/parciales creadas en el mes, por
 *     cliente, con saldo vigente (monto − abonado) y la fecha de la orden.
 *   - GRÁFICAS: exceljs no genera gráficos nativos de forma confiable, así
 *     que las "respectivas gráficas" son visuales EMBEBIDOS: barras hechas
 *     con celdas coloreadas proporcionalmente al máximo del conjunto, por
 *     método de pago y por semana del mes (tanto cobrado como por cobrar).
 *   - Totales al pie: total cobrado, total por cobrar y la diferencia.
 * ═══════════════════════════════════════════════════════════════════════ */

/* ─── Estilos del reporte estilizado (Punto 8) ─── */

const MONEY_FMT = '#,##0.00'
const AMBER_BG = 'FFFFEDC2' // título general
const AMBER_BG_STRONG = 'FFFFD98E' // título de grupo
const AMBER_BG_HEADER = 'FFFFE0A3' // encabezados de tabla
const AMBER_TXT = 'FF7A4F01'
const AMBER_TXT_STRONG = 'FF5C3D00'
const NEUTRAL_BG = 'FFF6EFDF' // subtotales
const GREEN_BG = 'FFC6EFCE' // barras de cobrado
const GREEN_TXT = 'FF006100'
const RED_BG = 'FFFFC7CE' // barras de por cobrar
const RED_TXT = 'FF9C0006'
const MUTED_TXT = 'FF6B5B3E'
const BORDER_COLOR = 'FFD9C9A3'

const CELL_BORDER: ExcelJS.Borders = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
  // Ojo: ExcelJS exige `diagonal` en el tipo; no se ve salvo diagonalUp/Down.
  diagonal: { style: 'thin', color: { argb: BORDER_COLOR } },
}

/** Rango del mes corriente: [1ro 00:00, 1ro del mes siguiente). */
function monthRange(): { desde: Date; hasta: Date } {
  const now = new Date()
  return {
    desde: new Date(now.getFullYear(), now.getMonth(), 1),
    hasta: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  }
}

/** Semanas 1..5 del mes con su rango de días (etiquetas de las barras). */
function weeksOfMonth(desde: Date): { week: number; label: string }[] {
  const daysInMonth = new Date(desde.getFullYear(), desde.getMonth() + 1, 0).getDate()
  const shortMonth = desde.toLocaleDateString('es-VE', { month: 'short' })
  const buckets: { week: number; label: string }[] = []
  for (let w = 1; w <= 5; w++) {
    const d1 = (w - 1) * 7 + 1
    const d2 = Math.min(w * 7, daysInMonth)
    buckets.push({
      week: w,
      label:
        d1 > daysInMonth
          ? `Semana ${w} (sin días)`
          : `Semana ${w} (${String(d1).padStart(2, '0')}–${String(d2).padStart(2, '0')} ${shortMonth})`,
    })
  }
  return buckets
}

/**
 * Pinta una "barra" proporcional al máximo del conjunto usando celdas
 * coloreadas (visual embebido: exceljs no genera gráficos nativos).
 * El ancho es la cantidad de celdas contiguas rellenadas (1..barCols).
 */
function drawCellBar(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  value: number,
  max: number,
  bgColor: string,
  startCol: number,
  barCols: number,
): void {
  const filled = value > 0 ? Math.max(1, Math.ceil((value / Math.max(1, max)) * barCols)) : 0
  for (let i = 0; i < barCols; i++) {
    const cell = ws.getRow(rowNum).getCell(startCol + i)
    if (i < filled) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = CELL_BORDER
  }
}

/** Estilo base de una fila de datos: borde + alineación + opciones (negrita/fondo/itálica). */
function styleDataRow(row: ExcelJS.Row, cols: number, opts?: { bold?: boolean; bg?: string; italic?: boolean }): void {
  for (let i = 1; i <= cols; i++) {
    const cell = row.getCell(i)
    cell.border = CELL_BORDER
    cell.alignment = { vertical: 'middle', wrapText: true }
    if (opts?.bold || opts?.italic) cell.font = { bold: opts?.bold ?? false, italic: opts?.italic ?? false }
    if (opts?.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
  }
}

/** Formato moneda (numFmt '#,##0.00') + alineación derecha. */
function styleMoney(cell: ExcelJS.Cell): void {
  cell.numFmt = MONEY_FMT
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
}

/** Fila título de sección (merge a lo ancho + fondo ámbar). Devuelve la próxima fila. */
function addSectionTitle(ws: ExcelJS.Worksheet, r: number, text: string, cols: number): number {
  const row = ws.addRow([text])
  ws.mergeCells(r, 1, r, cols)
  row.height = 20
  const c = row.getCell(1)
  c.font = { bold: true, size: 12, color: { argb: AMBER_TXT_STRONG } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG_HEADER } }
  c.alignment = { vertical: 'middle' }
  c.border = CELL_BORDER
  return r + 1
}

/** Fila de encabezado de tabla con fondo ámbar (moneyCols = columnas con formato moneda). */
function addHeaderRow(
  ws: ExcelJS.Worksheet,
  labels: string[],
  colCount: number,
  moneyCols: number[] = [],
  centerCols: number[] = [],
): ExcelJS.Row {
  const row = ws.addRow(labels)
  row.height = 18
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i)
    cell.font = { bold: true, color: { argb: AMBER_TXT_STRONG } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG_HEADER } }
    cell.border = CELL_BORDER
    cell.alignment = {
      vertical: 'middle',
      horizontal: moneyCols.includes(i) ? 'right' : centerCols.includes(i) ? 'center' : 'left',
    }
    if (moneyCols.includes(i)) cell.numFmt = MONEY_FMT
  }
  return row
}

/* ─── Shapes de datos ─── */

/** Una cuenta dedicada (sucursal) o el consolidado del grupo. */
interface BranchCuenta {
  label: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
  contact: string | null
  pendingAmount: number
  pendingOrders: number
}

interface GrupoCuenta {
  id: number
  name: string
  branches: BranchCuenta[]
  consolidated: BranchCuenta | null
  subtotalAmount: number
  subtotalOrders: number
}

interface MesPaymentMethodRow {
  name: string
  amount: number
  count: number
}

interface MesPendingOrderRow {
  orderNumber: string
  createdAt: Date
  customerId: number
  customerName: string
  branchName: string | null
  methodName: string
  amount: number
  paid: number
  saldo: number
}

interface MesClienteCuenta {
  name: string
  rows: MesPendingOrderRow[]
  monto: number
  pagado: number
  saldo: number
}

interface MesWeekBucket {
  week: number
  label: string
  total: number
}

interface EntradasMesData {
  monthLabel: string
  cobradasPorMetodo: MesPaymentMethodRow[]
  totalCobrado: number
  totalCobradoCount: number
  porCobrarClientes: MesClienteCuenta[]
  totalPorCobrarMonto: number
  totalPorCobrarPagado: number
  totalPorCobrarSaldo: number
  cobradoPorSemana: MesWeekBucket[]
  porCobrarPorSemana: MesWeekBucket[]
}

/** Hoja 1 — "Cuentas por grupo": títulos por grupo + filas por sucursal + subtotales. */
function buildCuentasPorGrupoSheet(wb: ExcelJS.Workbook, grupos: GrupoCuenta[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Cuentas por grupo')
  const COLS = 8
  const widths = [28, 18, 18, 28, 36, 22, 16, 14]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
  // Congelá título + subtítulo + encabezado para navegar parado en la planilla.
  ws.views = [{ state: 'frozen', ySplit: 3 }]

  let r = 1

  const title = ws.addRow(['CUENTAS POR GRUPO'])
  ws.mergeCells(r, 1, r, COLS)
  title.height = 26
  title.getCell(1).font = { bold: true, size: 14, color: { argb: AMBER_TXT } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG } }
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
  r++

  const sub = ws.addRow([
    `Registro de franquicias y sus sucursales — Generado ${formatDay(new Date())} · Moneda: USD · ` +
      'Monto pendiente = deuda de órdenes con saldo (mismo corte que el dashboard de cobranza). ' +
      'Se incluyen todos los grupos, tengan o no deuda: son las cuentas del registro.',
  ])
  ws.mergeCells(r, 1, r, COLS)
  sub.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_TXT } }
  sub.getCell(1).alignment = { vertical: 'middle', wrapText: true }
  sub.height = 26
  r++

  const header = ws.addRow([
    'Sucursal',
    'RIF',
    'Teléfono',
    'Email',
    'Dirección',
    'Contacto',
    'Monto pendiente',
    'Pedidos pendientes',
  ])
  header.height = 18
  for (let i = 1; i <= COLS; i++) {
    const cell = header.getCell(i)
    cell.font = { bold: true, color: { argb: AMBER_TXT_STRONG } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG_HEADER } }
    cell.border = CELL_BORDER
    cell.alignment = {
      vertical: 'middle',
      horizontal: i === 7 ? 'right' : i === 8 ? 'center' : 'left',
    }
  }
  header.getCell(7).numFmt = MONEY_FMT
  r++

  let totalAmount = 0
  let totalOrders = 0

  for (const g of grupos) {
    // ── TÍTULO del grupo (la "cuenta") ──
    const sedes = g.branches.length === 1 ? '1 sucursal' : `${g.branches.length} sucursales`
    const t = ws.addRow([g.branches.length ? `${g.name}  —  ${sedes}` : g.name])
    ws.mergeCells(r, 1, r, COLS)
    t.height = 20
    const tc = t.getCell(1)
    tc.font = { bold: true, size: 12, color: { argb: AMBER_TXT } }
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG_STRONG } }
    tc.alignment = { vertical: 'middle' }
    tc.border = CELL_BORDER
    r++

    const rowsToShow: BranchCuenta[] =
      g.branches.length > 0
        ? g.branches
        : [
            {
              label: 'Sin sucursales registradas',
              rif: null,
              phone: null,
              email: null,
              address: null,
              contact: null,
              pendingAmount: 0,
              pendingOrders: 0,
            },
          ]

    for (const c of rowsToShow) {
      const row = ws.addRow([
        c.label,
        c.rif ?? '—',
        c.phone ?? '—',
        c.email ?? '—',
        c.address ?? '—',
        c.contact ?? '—',
        c.pendingAmount,
        c.pendingOrders,
      ])
      styleDataRow(row, COLS)
      styleMoney(row.getCell(7))
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }
      r++
    }

    // ── Consolidado del grupo (órdenes CONSOLIDADAS, sin branchId) ──
    if (g.consolidated && (g.consolidated.pendingAmount > 0 || g.consolidated.pendingOrders > 0)) {
      const c = g.consolidated
      const row = ws.addRow(['Consolidado del grupo', '—', '—', '—', '—', '—', c.pendingAmount, c.pendingOrders])
      styleDataRow(row, COLS, { bg: NEUTRAL_BG, italic: true })
      styleMoney(row.getCell(7))
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }
      r++
    }

    // ── Subtotal del grupo ──
    const subRow = ws.addRow(['Subtotal', '—', '—', '—', '—', '—', g.subtotalAmount, g.subtotalOrders])
    styleDataRow(subRow, COLS, { bold: true, bg: NEUTRAL_BG })
    styleMoney(subRow.getCell(7))
    subRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }
    r++

    // Separador visual entre grupos
    ws.addRow([])
    r++

    totalAmount += g.subtotalAmount
    totalOrders += g.subtotalOrders
  }

  // ── TOTAL GENERAL de la cartera ──
  const total = ws.addRow(['TOTAL GENERAL', '', '', '', '', '', totalAmount, totalOrders])
  styleDataRow(total, COLS, { bold: true, bg: AMBER_BG_HEADER })
  styleMoney(total.getCell(7))
  total.getCell(1).font = { bold: true, size: 12, color: { argb: AMBER_TXT_STRONG } }
  total.getCell(7).font = { bold: true, size: 12, color: { argb: AMBER_TXT_STRONG } }
  total.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }
  total.getCell(8).font = { bold: true, size: 12, color: { argb: AMBER_TXT_STRONG } }
  total.height = 22
  r++

  return ws
}

/** Hoja 2 — "Entradas del mes": cobradas por método + por cobrar por cliente + barras + totales. */
function buildEntradasDelMesSheet(wb: ExcelJS.Workbook, d: EntradasMesData): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Entradas del mes')
  const COLS = 8
  const widths = [24, 20, 20, 16, 16, 14, 12, 14]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  let r = 1

  // ── Título ──
  const title = ws.addRow(['ENTRADAS DEL MES'])
  ws.mergeCells(r, 1, r, COLS)
  title.height = 26
  title.getCell(1).font = { bold: true, size: 14, color: { argb: AMBER_TXT } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG } }
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
  r++

  const sub = ws.addRow([
    `${d.monthLabel} — Cobrado = pagos registrados en el mes (fecha del pago). Por cobrar = órdenes con saldo ` +
      'creadas en el mes (saldo = monto − abonado). Barras: celdas coloreadas proporcionales al máximo (visual ' +
      'embebido; exceljs no genera gráficos nativos).',
  ])
  ws.mergeCells(r, 1, r, COLS)
  sub.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_TXT } }
  sub.getCell(1).alignment = { vertical: 'middle', wrapText: true }
  sub.height = 28
  r++

  // ── COBRADAS ──
  r = addSectionTitle(ws, r, 'COBRADAS — pagos registrados en el mes', COLS)
  addHeaderRow(ws, ['Método', 'Monto cobrado', 'Pagos', '', '', '', '', ''], COLS, [2], [3])
  const maxCobrado = Math.max(0, ...d.cobradasPorMetodo.map((m) => m.amount))
  r++
  for (const m of d.cobradasPorMetodo) {
    const row = ws.addRow([m.name, m.amount, m.count, '', '', '', '', ''])
    styleDataRow(row, COLS)
    styleMoney(row.getCell(2))
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }
    drawCellBar(ws, r, m.amount, maxCobrado, GREEN_BG, 4, 5)
    r++
  }
  const subCob = ws.addRow(['Total cobrado', d.totalCobrado, d.totalCobradoCount, '', '', '', '', ''])
  styleDataRow(subCob, COLS, { bold: true, bg: NEUTRAL_BG })
  styleMoney(subCob.getCell(2))
  subCob.getCell(2).font = { bold: true, color: { argb: GREEN_TXT } }
  subCob.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }
  r++
  ws.addRow([])
  r++

  // ── POR COBRAR ──
  r = addSectionTitle(ws, r, 'POR COBRAR — órdenes con saldo creadas en el mes', COLS)
  addHeaderRow(ws, ['Cliente', 'Nº orden', 'Fecha', 'Sucursal', 'Método', 'Monto', 'Pagado', 'Saldo'], COLS, [6, 7, 8], [3])
  r++
  for (const cliente of d.porCobrarClientes) {
    for (const o of cliente.rows) {
      const row = ws.addRow([
        o.customerName,
        o.orderNumber,
        formatDay(o.createdAt),
        o.branchName ?? '—',
        o.methodName,
        o.amount,
        o.paid,
        o.saldo,
      ])
      styleDataRow(row, COLS)
      styleMoney(row.getCell(6))
      styleMoney(row.getCell(7))
      styleMoney(row.getCell(8))
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }
      r++
    }
    const sc = ws.addRow([`Subtotal — ${cliente.name}`, '', '', '', '', cliente.monto, cliente.pagado, cliente.saldo])
    ws.mergeCells(r, 1, r, 3)
    styleDataRow(sc, COLS, { bold: true, bg: NEUTRAL_BG })
    styleMoney(sc.getCell(6))
    styleMoney(sc.getCell(7))
    styleMoney(sc.getCell(8))
    r++
  }
  const tp = ws.addRow(['TOTAL POR COBRAR', '', '', '', '', d.totalPorCobrarMonto, d.totalPorCobrarPagado, d.totalPorCobrarSaldo])
  ws.mergeCells(r, 1, r, 3)
  styleDataRow(tp, COLS, { bold: true, bg: AMBER_BG_HEADER })
  styleMoney(tp.getCell(6))
  styleMoney(tp.getCell(7))
  styleMoney(tp.getCell(8))
  for (const col of [1, 6, 7, 8]) tp.getCell(col).font = { bold: true, size: 12, color: { argb: AMBER_TXT_STRONG } }
  tp.height = 22
  r++
  ws.addRow([])
  r++

  // ── GRÁFICAS (visuales embebidos) ──
  r = addSectionTitle(ws, r, 'GRÁFICAS — visuales embebidos (celdas coloreadas proporcionales)', COLS)
  const nota = ws.addRow([
    'Barra = ancho proporcional al máximo de su conjunto. Verde = cobrado, rojo = por cobrar.',
  ])
  ws.mergeCells(r, 1, r, COLS)
  nota.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_TXT } }
  nota.getCell(1).alignment = { vertical: 'middle', wrapText: true }
  nota.height = 16
  r++

  // Cobrado por método
  addHeaderRow(ws, ['Método', 'Monto cobrado', '', '', '', '', '', ''], COLS, [2])
  r++
  for (const m of d.cobradasPorMetodo) {
    const row = ws.addRow([m.name, m.amount, '', '', '', '', '', ''])
    styleDataRow(row, COLS)
    styleMoney(row.getCell(2))
    drawCellBar(ws, r, m.amount, maxCobrado, GREEN_BG, 3, 6)
    r++
  }
  ws.addRow([])
  r++

  // Cobrado por semana del mes
  addHeaderRow(ws, ['Semana', 'Rango de días', 'Monto', '', '', '', '', ''], COLS, [3])
  const maxSemCobrado = Math.max(0, ...d.cobradoPorSemana.map((b) => b.total))
  r++
  for (const wk of d.cobradoPorSemana) {
    const row = ws.addRow([`Semana ${wk.week}`, wk.label, wk.total, '', '', '', '', ''])
    styleDataRow(row, COLS)
    styleMoney(row.getCell(3))
    drawCellBar(ws, r, wk.total, maxSemCobrado, GREEN_BG, 4, 5)
    r++
  }
  ws.addRow([])
  r++

  // Por cobrar por semana del mes
  addHeaderRow(ws, ['Semana', 'Rango de días', 'Saldo', '', '', '', '', ''], COLS, [3])
  const maxSemPorCobrar = Math.max(0, ...d.porCobrarPorSemana.map((b) => b.total))
  r++
  for (const wk of d.porCobrarPorSemana) {
    const row = ws.addRow([`Semana ${wk.week}`, wk.label, wk.total, '', '', '', '', ''])
    styleDataRow(row, COLS)
    styleMoney(row.getCell(3))
    drawCellBar(ws, r, wk.total, maxSemPorCobrar, RED_BG, 4, 5)
    r++
  }
  ws.addRow([])
  r++

  // ── TOTALES DEL MES ──
  r = addSectionTitle(ws, r, 'TOTALES DEL MES', COLS)

  const totCob = ws.addRow(['Total cobrado (pagos del mes)', '', '', d.totalCobrado, '', '', '', ''])
  ws.mergeCells(r, 1, r, 3)
  styleDataRow(totCob, COLS, { bold: true, bg: GREEN_BG })
  styleMoney(totCob.getCell(4))
  totCob.getCell(4).font = { bold: true, color: { argb: GREEN_TXT } }
  r++

  const totPor = ws.addRow(['Total por cobrar (saldo de órdenes del mes)', '', '', d.totalPorCobrarSaldo, '', '', '', ''])
  ws.mergeCells(r, 1, r, 3)
  styleDataRow(totPor, COLS, { bold: true, bg: RED_BG })
  styleMoney(totPor.getCell(4))
  totPor.getCell(4).font = { bold: true, color: { argb: RED_TXT } }
  r++

  const diff = ws.addRow(['Diferencia (por cobrar − cobrado)', '', '', d.totalPorCobrarSaldo - d.totalCobrado, '', '', '', ''])
  ws.mergeCells(r, 1, r, 3)
  styleDataRow(diff, COLS, { bold: true, bg: NEUTRAL_BG })
  styleMoney(diff.getCell(4))
  r++

  const foot = ws.addRow([
    'Nota: "Cobrado" usa la fecha del pago (paid_at) y su método real; "Por cobrar" usa la fecha de creación de la orden y su saldo vigente (monto − abonado).',
  ])
  ws.mergeCells(r, 1, r, COLS)
  foot.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_TXT } }
  foot.getCell(1).alignment = { vertical: 'middle', wrapText: true }
  foot.height = 22

  return ws
}

router.get('/cobranza.xlsx', requireRole('superadmin'), async () => {
  const { desde, hasta } = monthRange()
  const monthLabel = desde.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })

  const [groups, branches, pendingByBranch, pendingByConsolidated, activeMethods, monthPayments, pendingRows] =
    await Promise.all([
      // Todos los grupos (is_group=true), activos, ordenados por nombre.
      db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.isGroup, true), eq(customers.isActive, true)))
        .orderBy(asc(customers.name)),
      // Sucursales activas de todos los grupos (parentId set).
      db
        .select({
          id: customers.id,
          parentId: customers.parentId,
          name: customers.name,
          rif: customers.rif,
          phone: customers.phone,
          email: customers.email,
          address: customers.address,
          contactPerson: customers.contactPerson,
        })
        .from(customers)
        .where(and(isNotNull(customers.parentId), eq(customers.isActive, true)))
        .orderBy(asc(customers.name)),
      // Deuda POR SUCURSAL: órdenes con saldo que apuntan a un branch puntual.
      db
        .select({
          branchId: orders.branchId,
          pendingAmount: sql<string>`coalesce(sum(${orders.amount}), 0)`,
          pendingOrders: count(),
        })
        .from(orders)
        .where(and(inArray(orders.paymentStatus, [...PENDING_STATUSES]), isNotNull(orders.branchId)))
        .groupBy(orders.branchId),
      // Deuda CONSOLIDADA del grupo: órdenes con saldo sin branchId (customerId = grupo).
      db
        .select({
          customerId: orders.customerId,
          pendingAmount: sql<string>`coalesce(sum(${orders.amount}), 0)`,
          pendingOrders: count(),
        })
        .from(orders)
        .where(and(inArray(orders.paymentStatus, [...PENDING_STATUSES]), sql`${orders.branchId} is null`))
        .groupBy(orders.customerId),
      // Métodos activos (para mostrar hasta los que no tuvieron movimientos: registro completo).
      db
        .select({ id: paymentMethods.id, name: paymentMethods.name, sortOrder: paymentMethods.sortOrder })
        .from(paymentMethods)
        .where(eq(paymentMethods.isActive, true))
        .orderBy(asc(paymentMethods.sortOrder)),
      // Pagos del mes corriente (raw: se agregan por método y por semana acá abajo).
      db
        .select({ amount: orderPayments.amount, paidAt: orderPayments.paidAt, methodName: paymentMethods.name })
        .from(orderPayments)
        .innerJoin(paymentMethods, eq(paymentMethods.id, orderPayments.paymentMethodId))
        .where(and(gte(orderPayments.paidAt, desde), lt(orderPayments.paidAt, hasta))),
      pendingOrderRows(),
    ])

  /* ─── Hoja 1: grupos con sus cuentas dedicadas + subtotales ─── */

  const pendingByBranchMap = new Map(pendingByBranch.map((p) => [p.branchId, p]))
  const pendingByConsolidatedMap = new Map(pendingByConsolidated.map((p) => [p.customerId, p]))

  const grupos: GrupoCuenta[] = groups.map((g) => {
    const branchesOfGroup = branches.filter((b) => b.parentId === g.id)
    const cuentas: BranchCuenta[] = branchesOfGroup.map((b) => {
      const p = pendingByBranchMap.get(b.id)
      return {
        label: b.name,
        rif: b.rif,
        phone: b.phone,
        email: b.email,
        address: b.address,
        contact: b.contactPerson,
        pendingAmount: toNumber(p?.pendingAmount),
        pendingOrders: Number(p?.pendingOrders ?? 0),
      }
    })
    const pc = pendingByConsolidatedMap.get(g.id)
    const consolidated: BranchCuenta | null =
      pc && (toNumber(pc.pendingAmount) > 0 || Number(pc.pendingOrders) > 0)
        ? {
            label: 'Consolidado del grupo',
            rif: null,
            phone: null,
            email: null,
            address: null,
            contact: null,
            pendingAmount: toNumber(pc.pendingAmount),
            pendingOrders: Number(pc.pendingOrders),
          }
        : null
    return {
      id: g.id,
      name: g.name,
      branches: cuentas,
      consolidated,
      subtotalAmount:
        cuentas.reduce((s, c) => s + c.pendingAmount, 0) + (consolidated?.pendingAmount ?? 0),
      subtotalOrders:
        cuentas.reduce((s, c) => s + c.pendingOrders, 0) + (consolidated?.pendingOrders ?? 0),
    }
  })

  /* ─── Hoja 2: entradas del mes corriente ─── */

  // Cobradas: agregación por método (incluye los activos sin movimientos, con 0s).
  const payByMethod = new Map<string, { amount: number; count: number }>()
  for (const p of monthPayments) {
    const cur = payByMethod.get(p.methodName) ?? { amount: 0, count: 0 }
    cur.amount += toNumber(p.amount)
    cur.count += 1
    payByMethod.set(p.methodName, cur)
  }
  const cobradasPorMetodo: MesPaymentMethodRow[] = activeMethods
    .map((m) => ({
      name: m.name,
      amount: payByMethod.get(m.name)?.amount ?? 0,
      count: payByMethod.get(m.name)?.count ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount)
  const totalCobrado = cobradasPorMetodo.reduce((s, m) => s + m.amount, 0)
  const totalCobradoCount = cobradasPorMetodo.reduce((s, m) => s + m.count, 0)

  // Cobrado por semana del mes (día del pago → semana 1..5).
  const semanas = weeksOfMonth(desde)
  const cobradoPorSemana: MesWeekBucket[] = semanas.map((s) => ({ week: s.week, label: s.label, total: 0 }))
  for (const p of monthPayments) {
    const week = Math.ceil((p.paidAt.getDate() ?? 0) / 7)
    const bucket = cobradoPorSemana.find((b) => b.week === week)
    if (bucket) bucket.total += toNumber(p.amount)
  }

  // Por cobrar: órdenes pendientes/parciales CREADAS en el mes, agrupadas por cliente.
  const monthPending = pendingRows.filter((r) => r.createdAt >= desde && r.createdAt < hasta)
  const pendingByClient = new Map<number, { name: string; rows: MesPendingOrderRow[] }>()
  for (const r of monthPending) {
    const amount = toNumber(r.amount)
    const entry: MesPendingOrderRow = {
      orderNumber: r.orderNumber,
      createdAt: r.createdAt,
      customerId: r.customerId,
      customerName: r.customerName,
      branchName: r.branchName,
      methodName: r.paymentMethodName,
      amount,
      paid: r.paid,
      saldo: Math.max(0, amount - r.paid),
    }
    const client = pendingByClient.get(r.customerId) ?? { name: r.customerName, rows: [] }
    client.rows.push(entry)
    pendingByClient.set(r.customerId, client)
  }
  const porCobrarClientes: MesClienteCuenta[] = [...pendingByClient.values()]
    .map((c) => ({
      name: c.name,
      rows: c.rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      monto: c.rows.reduce((s, o) => s + o.amount, 0),
      pagado: c.rows.reduce((s, o) => s + o.paid, 0),
      saldo: c.rows.reduce((s, o) => s + o.saldo, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const totalPorCobrarMonto = porCobrarClientes.reduce((s, c) => s + c.monto, 0)
  const totalPorCobrarPagado = porCobrarClientes.reduce((s, c) => s + c.pagado, 0)
  const totalPorCobrarSaldo = porCobrarClientes.reduce((s, c) => s + c.saldo, 0)

  // Por cobrar por semana (fecha de creación de la orden).
  const porCobrarPorSemana: MesWeekBucket[] = semanas.map((s) => ({ week: s.week, label: s.label, total: 0 }))
  for (const o of monthPending) {
    const week = Math.ceil((o.createdAt.getDate() ?? 0) / 7)
    const bucket = porCobrarPorSemana.find((b) => b.week === week)
    if (bucket) bucket.total += Math.max(0, toNumber(o.amount) - o.paid)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'L&L System'

  buildCuentasPorGrupoSheet(wb, grupos)
  buildEntradasDelMesSheet(wb, {
    monthLabel,
    cobradasPorMetodo,
    totalCobrado,
    totalCobradoCount,
    porCobrarClientes,
    totalPorCobrarMonto,
    totalPorCobrarPagado,
    totalPorCobrarSaldo,
    cobradoPorSemana,
    porCobrarPorSemana,
  })

  return sendWorkbook(wb, 'cobranza.xlsx')
})

export default router