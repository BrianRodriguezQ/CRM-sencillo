/**
 * delivery-sheet — ficha digital pública de una entrega (WP3).
 *
 * El QR impreso en la Nota de Entrega apunta a `{APP_PUBLIC_URL}/entrega/{token}`.
 * Esta ruta de API valida el token HMAC y devuelve LOS MISMOS datos que la hoja
 * impresa (respaldo vivo + anti-estafa: solo documentos firmados resuelven).
 *
 * Seguridad:
 *   - SIN autenticación (es pública por diseño: la escanea el cliente).
 *   - Token HMAC firmado con JWT_SECRET (utils/qr-token.ts) → nadie fabrica
 *     tokens de órdenes inexistentes.
 *   - Devuelve SOLO los campos que ya están en la hoja papel: cliente,
 *     dirección, contenido, método de pago, montos, estado, fechas.
 *     NO expone números de teléfono internos ni datos de los vendedores
 *     (la hoja papel muestra vendedor, pero la ficha se limita a lo esencial).
 */

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { orders, customers, orderItems, paymentMethods, orderCommunications } from '../db/schema.js'
import { verifyQrToken } from '../utils/qr-token.js'

const router = new Hono()

router.get('/token/:token', async (c) => {
  const token = c.req.param('token')
  const orderId = verifyQrToken(token)
  if (orderId === null) {
    return c.json({ success: false, error: 'Este código QR no es válido' }, 400)
  }

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      amount: orders.amount,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      deliveryAddress: orders.deliveryAddress,
      notes: orders.notes,
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
      customerId: orders.customerId,
      paymentMethodId: orders.paymentMethodId,
      customerName: customers.name,
      customerAddress: customers.address,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) {
    return c.json({ success: false, error: 'Este código QR ya no corresponde a una entrega' }, 404)
  }

  const items = await db
    .select({
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.id)

  const [method] = await db
    .select({ id: paymentMethods.id, name: paymentMethods.name, code: paymentMethods.code })
    .from(paymentMethods)
    .where(eq(paymentMethods.id, order.paymentMethodId))
    .limit(1)

  // Dirección efectiva: la de la orden si viene; si no, la del cliente.
  const address = order.deliveryAddress || order.customerAddress || null

  return c.json({
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      address,
      items,
      amount: String(order.amount),
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      paymentMethod: method?.name ?? null,
      notes: order.notes,
      deliveredAt: order.deliveredAt,
      createdAt: order.createdAt,
    },
  })
})

export default router
