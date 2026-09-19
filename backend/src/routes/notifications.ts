/**
 * Notifications — in-app. El conductor recibe la notificación al ser asignado
 * a una orden y cuando le comunican algo. Solo lectura/actualización de las
 * propias (userId = token). El listado trae las no leídas primero.
 *
 * Contrato con el frontend:
 *   GET    /                   → { items, unreadCount, total, page, limit, totalPages }
 *   GET    /unread-count       → { unreadCount }
 *   PUT    /:id/read           → marca UNA como leída
 *   PUT    /read-all           → marca TODAS como leídas
 *   DELETE /:id                → borra UNA propia (hard delete: son eventos efímeros)
 */
import { Hono } from 'hono'
import { eq, and, desc, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { authMiddleware } from '../middleware/auth.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

/** GET / — notificaciones del usuario, no leídas primero. Filtros: page, limit, unread. */
router.get('/', async (c) => {
  const auth = c.get('user')
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20))
  const unreadOnly = c.req.query('unread') === 'true'
  const offset = (page - 1) * limit

  const filters = [eq(notifications.userId, auth.id)]
  if (unreadOnly) filters.push(eq(notifications.isRead, false))
  const where = filters.length ? and(...filters) : undefined

  const [rows, [totalRow], [unreadRow]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(notifications.isRead, desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(notifications).where(where),
    db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, auth.id), eq(notifications.isRead, false))),
  ])

  const total = Number(totalRow?.count ?? 0)

  return c.json({
    success: true,
    data: {
      items: rows,
      unreadCount: Number(unreadRow?.count ?? 0),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  })
})

/** GET /unread-count — contador de no leídas (ligero, para el badge). */
router.get('/unread-count', async (c) => {
  const auth = c.get('user')

  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, auth.id), eq(notifications.isRead, false)))

  return c.json({ success: true, data: { unreadCount: Number(row?.count ?? 0) } })
})

/** PUT /read-all — marca TODAS las propias como leídas. */
router.put('/read-all', async (c) => {
  const auth = c.get('user')

  const rows = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, auth.id), eq(notifications.isRead, false)))
    .returning({ id: notifications.id })

  return c.json({ success: true, data: { updated: rows.length } })
})

/** PUT /:id/read — marca UNA propia como leída. */
router.put('/:id/read', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, auth.id)))
    .limit(1)
  if (!existing) return c.json({ success: false, error: 'Notificación no encontrada' }, 404)

  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id))

  return c.json({ success: true })
})

export default router
