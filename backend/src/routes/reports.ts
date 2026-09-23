/**
 * Reports — notas de entrega en PDF por cliente, sucursal y período.
 *
 * GET /reports/delivery-notes
 *   ?clienteId=<int>            (opcional) un cliente / grupo puntual (consolidado)
 *   ?branchId=<int>             (opcional) UNA sucursal específica (gana sobre clienteId)
 *   ?periodo=dia|semana|mes     (default: dia)
 *   ?fecha=YYYY-MM-DD           (default: hoy) — fecha base del período
 *
 * Genera un PDF con una NOTA DE ENTREGA por cliente: todos sus pedidos
 * ENTREGADOS dentro del período, con el detalle de productos de cada uno.
 *
 * GET /reports/delivery-notes-data  (mismos query params)
 * Devuelve los MISMOS datos en JSON para que el frontend muestre un PREVIEW
 * web de lo que se va a generar, antes de descargar el PDF.
 *
 * Acceso:
 *   - superadmin: todos los clientes
 *   - cobranza: todos (gestión de notas de entrega)
 *   - operador / conductor: sin acceso (las notas de entrega son de cobranza)
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, asc, eq, gte, lt, inArray, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import QRCode from 'qrcode'
import { db } from '../db/index.js'
import { users, customers, paymentMethods, orders, orderItems } from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { renderPdf, type PdfDocDefinition } from '../utils/pdf.js'
import { signQrToken } from '../utils/qr-token.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

const sellerAlias = alias(users, 'seller')
const driverAlias = alias(users, 'driver')

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'L&L System'

/**
 * URL pública de la app para el QR de la ficha digital (WP3).
 * En desarrollo Vite corre en :5173; en producción el frontend está servido
 * por el propio backend (o por el proxy) — configurable con APP_PUBLIC_URL.
 */
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'http://localhost:5173'

/** Genera un QR PNG (data URL) que apunta a la ficha digital de la orden. */
async function qrForOrder(orderId: number): Promise<string> {
  const token = signQrToken(orderId)
  return QRCode.toDataURL(`${APP_PUBLIC_URL}/entrega/${token}`, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160,
  })
}

const PERIODOS = ['dia', 'semana', 'mes'] as const
type Periodo = (typeof PERIODOS)[number]

/* ─── Helpers de fecha / formato ─── */

/** Parsea 'YYYY-MM-DD' a Date LOCAL a medianoche (evita el corrimiento UTC). */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Rango [desde, hasta) en hora local según el período pedido. */
function resolvePeriod(periodo: Periodo, fecha: Date): { desde: Date; hasta: Date } {
  const y = fecha.getFullYear()
  const m = fecha.getMonth()
  const d = fecha.getDate()

  if (periodo === 'dia') {
    return {
      desde: new Date(y, m, d, 0, 0, 0, 0),
      hasta: new Date(y, m, d + 1, 0, 0, 0, 0),
    }
  }

  if (periodo === 'semana') {
    // Semana calendario: lunes 00:00 → lunes siguiente 00:00.
    const diffToMonday = (fecha.getDay() + 6) % 7
    return {
      desde: new Date(y, m, d - diffToMonday, 0, 0, 0, 0),
      hasta: new Date(y, m, d - diffToMonday + 7, 0, 0, 0, 0),
    }
  }

  // mes: 1ro del mes → 1ro del mes siguiente (Date normaliza el mes 12).
  return {
    desde: new Date(y, m, 1, 0, 0, 0, 0),
    hasta: new Date(y, m + 1, 1, 0, 0, 0, 0),
  }
}

function formatDay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function formatDateTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${formatDay(d)} ${hh}:${mi}`
}

function periodLabel(periodo: Periodo, desde: Date, hasta: Date): string {
  if (periodo === 'dia') return `Día — ${formatDay(desde)}`
  if (periodo === 'semana') {
    const fin = new Date(hasta.getTime() - 24 * 60 * 60 * 1000) // domingo inclusive
    return `Semana — del ${formatDay(desde)} al ${formatDay(fin)}`
  }
  const monthName = desde.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return `Mes — ${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/* ─── Validación de query ─── */

const querySchema = z.object({
  clienteId: z.coerce.number().int().positive().optional(),
  // Sucursal específica (branch). Si viene junto con clienteId, gana branchId.
  branchId: z.coerce.number().int().positive().optional(),
  periodo: z.enum(PERIODOS).optional().default('dia'),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
    .optional(),
})

/* ═══════════════════════════════════════════════════════════════════════
 * Datos compartidos: PDF y preview web usan la MISMA query + agrupación.
 * ═══════════════════════════════════════════════════════════════════════ */

interface DeliveryItemDto {
  producto: string
  cantidad: number
  precioUnitario: number
}

interface DeliveryOrderDto {
  id: number
  numero: string
  entregadoEn: string | null
  vendedor: string | null
  conductor: string | null
  metodoPago: string | null
  total: number
  items: DeliveryItemDto[]
}

interface DeliveryGroupDto {
  cliente: { id: number; name: string; phone: string | null; email: string | null; address: string | null }
  ordenes: DeliveryOrderDto[]
  totalPeriodo: number
}

interface DeliveryDataDto {
  rango: { desde: string; hasta: string; label: string }
  emitidoEn: string
  totalPedidos: number
  totalGeneral: number
  grupos: DeliveryGroupDto[]
}

interface DeliveryRow {
  id: number
  orderNumber: string
  deliveredAt: Date | null
  amount: string | number | null
  paymentStatus: string
  customerId: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  customerAddress: string | null
  sellerName: string | null
  driverName: string | null
  paymentMethodName: string | null
}

interface DeliveryItemRow {
  orderId: number
  productName: string
  quantity: number
  unitPrice: string | number
}

interface ClientGroup {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  orders: DeliveryRow[]
}

export async function buildDeliveryGroups(params: {
  clienteId?: number
  branchId?: number
  periodo: Periodo
  fecha?: string
  auth: JWTPayload
}): Promise<{
  rows: DeliveryRow[]
  itemsByOrder: Map<number, DeliveryItemRow[]>
  clientGroups: ClientGroup[]
  desde: Date
  hasta: Date
  dto: DeliveryDataDto | null
}> {
  const { clienteId, branchId, periodo, fecha, auth } = params

  const fechaBase = fecha ? parseLocalDate(fecha) : new Date()
  const { desde, hasta } = resolvePeriod(periodo, fechaBase)

  // Scope por rol:
  // - superadmin: ve todo
  // - operador: si NO hay clienteId ni branchId, ve solo sus pedidos;
  //   si SÍ hay clienteId o branchId, ve todos los pedidos de esa entidad
  // - cobranza: ve todo (gestión de cobros y notas de entrega)
  // - conductor: sin acceso (manejado por middleware)
  const filters: SQL[] = [
    eq(orders.orderStatus, 'delivered'),
    gte(orders.deliveredAt, desde),
    lt(orders.deliveredAt, hasta),
  ]
  // Nota individual de sucursal: filtra por branchId (gana sobre clienteId)
  if (branchId) {
    filters.push(eq(orders.branchId, branchId))
  } else if (clienteId) {
    filters.push(eq(orders.customerId, clienteId))
  }
  // Solo aplicar filtro de operador si NO hay clienteId ni branchId específico
  // (si hay clienteId/branchId, operador ve todos los pedidos de esa entidad)
  // cobranza ve todo siempre
  if (!clienteId && !branchId && auth.role === 'operador') filters.push(eq(orders.sellerId, auth.id))

  const rows = (await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      deliveredAt: orders.deliveredAt,
      amount: orders.amount,
      paymentStatus: orders.paymentStatus,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      customerAddress: customers.address,
      sellerName: sellerAlias.name,
      driverName: driverAlias.name,
      paymentMethodName: paymentMethods.name,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .leftJoin(sellerAlias, eq(sellerAlias.id, orders.sellerId))
    .leftJoin(driverAlias, eq(driverAlias.id, orders.driverId))
    .where(and(...filters))
    .orderBy(asc(customers.name), asc(orders.deliveredAt))) as DeliveryRow[]

  if (rows.length === 0) {
    return { rows, itemsByOrder: new Map(), clientGroups: [], desde, hasta, dto: null }
  }

  // Ítems de todas las órdenes del reporte (una sola query).
  const orderIds = rows.map((r) => r.id)
  const items = (await db
    .select({
      orderId: orderItems.orderId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.id))) as DeliveryItemRow[]

  const itemsByOrder = new Map<number, DeliveryItemRow[]>()
  for (const it of items) {
    const bucket = itemsByOrder.get(it.orderId)
    if (bucket) bucket.push(it)
    else itemsByOrder.set(it.orderId, [it])
  }

  // Agrupar por cliente.
  const groups = new Map<number, ClientGroup>()
  for (const r of rows) {
    let group = groups.get(r.customerId)
    if (!group) {
      group = {
        id: r.customerId,
        name: r.customerName,
        phone: r.customerPhone,
        email: r.customerEmail,
        address: r.customerAddress,
        orders: [],
      }
      groups.set(r.customerId, group)
    }
    group.orders.push(r)
  }
  const clientGroups = [...groups.values()]

  // DTO para el preview web.
  const grupos: DeliveryGroupDto[] = clientGroups.map((g) => {
    let totalPeriodo = 0
    const ordenes: DeliveryOrderDto[] = g.orders.map((r) => {
      const total = Number.parseFloat(String(r.amount ?? '0'))
      totalPeriodo += total
      const orderItemsRows = itemsByOrder.get(r.id) ?? []
      return {
        id: r.id,
        numero: r.orderNumber,
        entregadoEn: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        vendedor: r.sellerName ?? null,
        conductor: r.driverName ?? null,
        metodoPago: r.paymentMethodName ?? null,
        total,
        items: orderItemsRows.map((it) => ({
          producto: it.productName,
          cantidad: it.quantity,
          precioUnitario: Number.parseFloat(String(it.unitPrice ?? '0')),
        })),
      }
    })
    return {
      cliente: { id: g.id, name: g.name, phone: g.phone, email: g.email, address: g.address },
      ordenes,
      totalPeriodo,
    }
  })

  const totalGeneral = grupos.reduce((sum, g) => sum + g.totalPeriodo, 0)

  const dto: DeliveryDataDto = {
    rango: { desde: desde.toISOString(), hasta: hasta.toISOString(), label: periodLabel(periodo, desde, hasta) },
    emitidoEn: new Date().toISOString(),
    totalPedidos: rows.length,
    totalGeneral,
    grupos,
  }

  return { rows, itemsByOrder, clientGroups, desde, hasta, dto }
}

function noDataMessage(clienteId?: number): string {
  return clienteId
    ? 'El cliente no tiene pedidos entregados en el período seleccionado'
    : 'No hay pedidos entregados en el período seleccionado'
}

/* ─── GET /reports/delivery-notes — PDF ─── */

router.get(
  '/delivery-notes',
  requireRole('superadmin', 'cobranza'),
  zValidator('query', querySchema),
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

    if (result.dto === null) {
      // "No hay entregas en el período" NO es un error: la petición estuvo bien,
      // simplemente no hay nada que generar. 200 + JSON con el aviso, y el
      // cliente detecta que no es un PDF (Content-Type) y avisa en tono neutro.
      return c.json({ success: true, data: null, message: noDataMessage(q.clienteId ?? q.branchId) })
    }

    const { rows, itemsByOrder, clientGroups, desde, hasta } = result

    /* ─── Armado del documento ─── */

    const hCell = (text: string, alignment = 'left') => ({
      text,
      bold: true,
      fontSize: 8,
      color: '#374151',
      alignment,
    })

    const content: unknown[] = [
      { text: 'NOTA DE ENTREGA', fontSize: 17, bold: true, color: '#111827' },
      {
        text: `${BUSINESS_NAME} — ${periodLabel(q.periodo, desde, hasta)}`,
        fontSize: 10.5,
        color: '#374151',
        margin: [0, 3, 0, 0],
      },
      {
        text: `Emitido: ${formatDateTime(new Date())} · Pedidos entregados: ${rows.length}`,
        fontSize: 8,
        color: '#6b7280',
        margin: [0, 2, 0, 0],
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#d1d5db' },
        ],
        margin: [0, 10, 0, 14],
      },
    ]

    for (let idx = 0; idx < clientGroups.length; idx++) {
      const group = clientGroups[idx]
      // Encabezado del cliente
      content.push({ text: group.name, fontSize: 13, bold: true, color: '#111827' })

      const contactBits: string[] = []
      if (group.phone) contactBits.push(`Tel: ${group.phone}`)
      if (group.email) contactBits.push(group.email)
      if (group.address) contactBits.push(group.address)

      content.push({
        text: contactBits.length ? contactBits.join('  ·  ') : 'Sin datos de contacto',
        fontSize: 8.5,
        color: '#6b7280',
        margin: [0, 2, 0, 8],
      })

      // Filas de pedidos
      const body: unknown[][] = [
        [
          hCell('Nº Orden'),
          hCell('Entregado'),
          hCell('operador'),
          hCell('Conductor'),
          hCell('Contenido'),
          hCell('Total', 'right'),
          hCell('QR', 'center'),
        ],
      ]

      let groupTotal = 0

      for (const order of group.orders) {
        const amount = Number.parseFloat(String(order.amount ?? '0'))
        groupTotal += amount

        const orderItemRows = itemsByOrder.get(order.id) ?? []
        const itemLines =
          orderItemRows.length > 0
            ? orderItemRows.map((it) => ({
                text: `${it.quantity}× ${it.productName} — ${money(
                  Number.parseFloat(String(it.unitPrice ?? '0')) * it.quantity,
                )}`,
                fontSize: 8,
                color: '#374151',
              }))
            : [{ text: 'Sin detalle de productos', fontSize: 8, color: '#9ca3af', italics: true }]

        // WP3: QR de la ficha digital — escanearlo valida la entrega contra el
        // sistema (respaldo vivo + anti-estafa de notas apócrifas).
        const qr = await qrForOrder(order.id)

        body.push([
          { text: order.orderNumber, fontSize: 8.5, color: '#111827' },
          {
            stack: [
              { text: formatDay(order.deliveredAt ?? new Date()), fontSize: 8.5, color: '#111827' },
              {
                text: `${order.paymentMethodName ?? '—'}`,
                fontSize: 7,
                color: '#9ca3af',
              },
            ],
          },
          { text: order.sellerName ?? '—', fontSize: 8.5, color: '#374151' },
          { text: order.driverName ?? '—', fontSize: 8.5, color: '#374151' },
          { stack: itemLines, margin: [0, 1, 0, 1] },
          { text: money(amount), fontSize: 8.5, bold: true, alignment: 'right', color: '#111827' },
          { image: qr, width: 34, height: 34, alignment: 'center' },
        ])
      }

      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', '*', 'auto', 30],
          body,
        },
        layout: 'lightHorizontalLines',
      })

      content.push({
        text: 'Escaneá el código QR de cada pedido para validar su ficha digital.',
        fontSize: 7,
        color: '#9ca3af',
        margin: [0, 4, 0, 0],
      })

      content.push({
        text: `Total del período: ${money(groupTotal)}`,
        fontSize: 10,
        bold: true,
        alignment: 'right',
        color: '#111827',
        margin: [0, 6, 0, 0],
      })

      // Separación entre clientes (no en el último).
      if (idx < clientGroups.length - 1) {
        content.push({ text: '', pageBreak: 'after' })
      }
    }

    const doc: PdfDocDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 45, 40, 55],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1f2937' },
      content,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: BUSINESS_NAME,
            fontSize: 7.5,
            color: '#9ca3af',
            margin: [40, 0, 0, 0],
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            fontSize: 7.5,
            color: '#9ca3af',
            alignment: 'right',
            margin: [0, 0, 40, 0],
          },
        ],
      }),
      info: {
        title: `Notas de entrega — ${periodLabel(q.periodo, desde, hasta)}`,
        author: BUSINESS_NAME,
        creator: BUSINESS_NAME,
      },
    }

    const pdf = await renderPdf(doc)

    const fechaBase = q.fecha ? parseLocalDate(q.fecha) : new Date()
    const fechaTag = q.fecha ?? formatDay(fechaBase).split('/').reverse().join('-')
    const fileBase = q.clienteId
      ? `nota-entrega-${slugify(clientGroups[0].name)}-${q.periodo}-${fechaTag}`
      : `notas-entrega-${q.periodo}-${fechaTag}`

    // Buffer → Uint8Array para el BodyInit de Hono.
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  },
)

/* ─── GET /reports/delivery-notes-data — JSON para preview web ─── */

router.get(
  '/delivery-notes-data',
  requireRole('superadmin', 'cobranza'),
  zValidator('query', querySchema),
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

    if (result.dto === null) {
      return c.json({ success: true, data: null, message: noDataMessage(q.clienteId ?? q.branchId) })
    }

return c.json({ success: true, data: result.dto })
  }
)

/* ─── GET /reports/delivery-note/:id — PDF individual por orden ───
 * Genera una NOTA DE ENTREGA individual para UN pedido (con su QR).
 * Acceso: superadmin y cobranza (gestión de cobros y notas de entrega).
 */
router.get(
  '/delivery-note/:id',
  requireRole('superadmin', 'cobranza'),
  async (c) => {
    const auth = c.get('user')
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400)
    }

    // Traer la orden con todo lo necesario.
    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.orderStatus,
        deliveredAt: orders.deliveredAt,
        amount: orders.amount,
        paymentStatus: orders.paymentStatus,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        customerAddress: customers.address,
        sellerId: orders.sellerId,
        sellerName: sellerAlias.name,
        driverId: orders.driverId,
        driverName: driverAlias.name,
        paymentMethodId: orders.paymentMethodId,
        paymentMethodName: paymentMethods.name,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
      .leftJoin(sellerAlias, eq(sellerAlias.id, orders.sellerId))
      .leftJoin(driverAlias, eq(driverAlias.id, orders.driverId))
      .where(eq(orders.id, id))
      .limit(1)

    if (!order) return c.json({ success: false, error: 'Orden no encontrada' }, 404)

    // Scope check
    if (auth.role === 'operador' && order.sellerId !== auth.id) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }
    if (auth.role === 'conductor' && order.driverId !== auth.id) {
      return c.json({ success: false, error: 'Orden no encontrada' }, 404)
    }
    if (order.orderStatus !== 'delivered') {
      return c.json({ success: false, error: 'Solo se pueden generar notas de pedidos entregados' }, 400)
    }

    // Ítems de la orden.
    const items = (await db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.id))) as DeliveryItemRow[]

    const qr = await qrForOrder(order.id)
    const total = Number.parseFloat(String(order.amount ?? '0'))
    const desde = new Date()
    const hasta = new Date()

    /* ─── Armado del documento (una sola orden) ─── */
    const hCell = (text: string, alignment = 'left') => ({
      text,
      bold: true,
      fontSize: 8,
      color: '#374151',
      alignment,
    })

    const content: unknown[] = [
      { text: 'NOTA DE ENTREGA', fontSize: 17, bold: true, color: '#111827' },
      { text: BUSINESS_NAME, fontSize: 10.5, color: '#374151', margin: [0, 3, 0, 0] },
      {
        text: `Emitido: ${formatDateTime(new Date())} · Pedido: ${order.orderNumber}`,
        fontSize: 8,
        color: '#6b7280',
        margin: [0, 2, 0, 0],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#d1d5db' }],
        margin: [0, 10, 0, 14],
      },
    ]

    // Encabezado del cliente
    content.push({ text: order.customerName ?? 'Cliente no registrado', fontSize: 13, bold: true, color: '#111827' })

    const contactBits: string[] = []
    if (order.customerPhone) contactBits.push(`Tel: ${order.customerPhone}`)
    if (order.customerEmail) contactBits.push(order.customerEmail)
    if (order.customerAddress) contactBits.push(order.customerAddress)

    content.push({
      text: contactBits.length ? contactBits.join('  ·  ') : 'Sin datos de contacto',
      fontSize: 8.5,
      color: '#6b7280',
      margin: [0, 2, 0, 8],
    })

    // Tabla de la única orden
    const orderItemRows = items.length > 0
      ? items.map((it) => ({
          text: `${it.quantity}× ${it.productName} — $${(Number.parseFloat(String(it.unitPrice ?? '0')) * it.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          fontSize: 8,
          color: '#374151',
        }))
      : [{ text: 'Sin detalle de productos', fontSize: 8, color: '#9ca3af', italics: true }]

    const body: unknown[][] = [
      [hCell('Nº Orden'), hCell('Entregado'), hCell('operador'), hCell('Conductor'), hCell('Contenido'), hCell('Total', 'right'), hCell('QR', 'center')],
      [
        { text: order.orderNumber, fontSize: 8.5, color: '#111827' },
        {
          stack: [
            { text: order.deliveredAt ? formatDay(order.deliveredAt) : '—', fontSize: 8.5, color: '#111827' },
            { text: order.paymentMethodName ?? '—', fontSize: 7, color: '#9ca3af' },
          ],
        },
        { text: order.sellerName ?? '—', fontSize: 8.5, color: '#374151' },
        { text: order.driverName ?? '—', fontSize: 8.5, color: '#374151' },
        { stack: orderItemRows, margin: [0, 1, 0, 1] },
        { text: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, fontSize: 8.5, bold: true, alignment: 'right', color: '#111827' },
        { image: qr, width: 34, height: 34, alignment: 'center' },
      ],
    ]

    content.push({
      table: {
        headerRows: 1,
        widths: ['auto', 'auto', 'auto', 'auto', '*', 'auto', 30],
        body,
      },
      layout: 'lightHorizontalLines',
    })

    content.push({
      text: 'Escaneá el código QR para validar la ficha digital de esta entrega.',
      fontSize: 7,
      color: '#9ca3af',
      margin: [0, 4, 0, 0],
    })

    content.push({
      text: `Total: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      fontSize: 10,
      bold: true,
      alignment: 'right',
      color: '#111827',
      margin: [0, 6, 0, 0],
    })

    const doc: PdfDocDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 45, 40, 55],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1f2937' },
      content,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: BUSINESS_NAME, fontSize: 7.5, color: '#9ca3af', margin: [40, 0, 0, 0] },
          { text: `Página ${currentPage} de ${pageCount}`, fontSize: 7.5, color: '#9ca3af', alignment: 'right', margin: [0, 0, 40, 0] },
        ],
      }),
      info: {
        title: `Nota de entrega — ${order.orderNumber}`,
        author: BUSINESS_NAME,
        creator: BUSINESS_NAME,
      },
    }

    const pdf = await renderPdf(doc)
    const fileBase = `nota-entrega-${order.orderNumber}`

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  },
)

export default router
