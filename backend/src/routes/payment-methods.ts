/**
 * Payment Methods — catálogo de métodos de pago (efectivo, transferencia,
 * tarjeta, zelle…). Cualquier usuario autenticado lee los activos; el
 * superadmin administra el catálogo. El code es único (409 si colisiona).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, not, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { paymentMethods, orders } from '../db/schema.js'
import { authMiddleware, requireSuperadmin } from '../middleware/auth.js'
import { writeAuditLog, clientIp } from '../utils/audit-log.js'
import { stripHtml } from '../utils/sanitize.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

/** GET / — métodos de pago activos, ordenados por sortOrder. */
router.get('/', async (c) => {
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(paymentMethods.sortOrder)
  return c.json({ success: true, data: { items: rows, total: rows.length } })
})

/** POST / — crear método de pago (solo superadmin). */
const createMethodSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).trim() : v),
    z.string().min(1, 'El nombre es requerido').max(100),
  ),
  code: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).toLowerCase() : v),
    z.string().min(1, 'El código es requerido').max(30),
  ),
  // Datos libres del pago (CBU, alias, nro de cuenta…) — el CTO pidió que el
  // usuario los cargue como quiera, sin formato fijo.
  paymentDetails: z.string().trim().max(2000).optional().nullable(),
  // Regla de comprobante por método (modelo de pagos v2):
  //   requiresReference: el abono exige número de referencia escrito.
  //   requiresReceipt:   el abono exige foto del comprobante (o ref como alternativa).
  requiresReference: z.boolean().optional().default(true),
  requiresReceipt: z.boolean().optional().default(false),
})

router.post('/', requireSuperadmin, zValidator('json', createMethodSchema), async (c) => {
  const auth = c.get('user')
  try {
    const data = c.req.valid('json')

    const [existing] = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.code, data.code))
      .limit(1)
    if (existing) {
      return c.json({ success: false, error: 'Ya existe un método de pago con ese código' }, 409)
    }

    const [method] = await db
      .insert(paymentMethods)
      .values({
        name: data.name,
        code: data.code,
        paymentDetails: data.paymentDetails ?? null,
        requiresReference: data.requiresReference,
        requiresReceipt: data.requiresReceipt,
      })
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: 'payment_method.created',
      metadata: { methodId: method.id, code: method.code, name: method.name },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: method }, 201)
  } catch (error) {
    console.error('Create payment method error:', error)
    return c.json({ success: false, error: 'Error al crear el método de pago' }, 500)
  }
})

/** PATCH /:id — editar método de pago (solo superadmin). */
const updateMethodSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).trim() : v),
    z.string().min(1, 'El nombre es requerido').max(100).optional(),
  ),
  code: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).toLowerCase() : v),
    z.string().min(1, 'El código es requerido').max(30).optional(),
  ),
  paymentDetails: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  requiresReference: z.boolean().optional(),
  requiresReceipt: z.boolean().optional(),
})

router.patch('/:id', requireSuperadmin, zValidator('json', updateMethodSchema), async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const data = c.req.valid('json')

    const [current] = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .limit(1)
    if (!current) return c.json({ success: false, error: 'Método de pago no encontrado' }, 404)

    if (data.code && data.code !== undefined) {
      const [dup] = await db
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.code, data.code), not(eq(paymentMethods.id, id))))
        .limit(1)
      if (dup) {
        return c.json({ success: false, error: 'Ya existe un método de pago con ese código' }, 409)
      }
    }

    const [method] = await db
      .update(paymentMethods)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.paymentDetails !== undefined ? { paymentDetails: data.paymentDetails ?? null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.requiresReference !== undefined ? { requiresReference: data.requiresReference } : {}),
        ...(data.requiresReceipt !== undefined ? { requiresReceipt: data.requiresReceipt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(paymentMethods.id, id))
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: 'payment_method.updated',
      metadata: { methodId: id, code: method.code },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: method })
  } catch (error) {
    console.error('Update payment method error:', error)
    return c.json({ success: false, error: 'Error al actualizar el método de pago' }, 500)
  }
})

/** DELETE /:id — eliminar método de pago sin órdenes (solo superadmin). */
router.delete('/:id', requireSuperadmin, async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const [current] = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .limit(1)
    if (!current) return c.json({ success: false, error: 'Método de pago no encontrado' }, 404)

    const [orderRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.paymentMethodId, id))
      .limit(1)
    if (Number(orderRow?.count ?? 0) > 0) {
      return c.json(
        { success: false, error: 'No se puede eliminar: hay órdenes usando este método de pago' },
        400,
      )
    }

    await db.delete(paymentMethods).where(eq(paymentMethods.id, id))

    await writeAuditLog({
      userId: auth.id,
      action: 'payment_method.deleted',
      metadata: { methodId: id },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error('Delete payment method error:', error)
    return c.json({ success: false, error: 'Error al eliminar el método de pago' }, 500)
  }
})

export default router
