/**
 * Users — equipo de trabajo (superadmin | vendedor | conductor).
 *
 * El superadmin gestiona el equipo: crea vendedores/conductores, edita,
 * activa/desactiva. Los vendedores solo leen la lista de conductores
 * disponibles para asignar una orden.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { eq, and, or, ilike, inArray, not, count, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, orders } from '../db/schema.js'
import { authMiddleware, requireRole, requireSuperadmin } from '../middleware/auth.js'
import { writeAuditLog, clientIp } from '../utils/audit-log.js'
import { stripHtml } from '../utils/sanitize.js'
import { passwordSchema } from '../utils/password-schema.js'
import { revokeAllUserSessions } from '../utils/sessions.js'
import { clearFailedAttempts } from '../utils/login-lockout.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware)

const ROLE_ENUM = ['vendedor', 'conductor'] as const

// Cédula venezolana: prefijo V- o E- (elector) + dígitos. El superadmin elige
// el prefijo y el miembro solo completa los números en el formulario.
const CEDULA_PATTERN = /^(V|E)-\d{6,9}$/

/** Normaliza una cédula para guardar: espacios → "", prefijo en mayúscula. */
function normalizeCedula(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return null
  // Tolerancia: "v12345678" sin guión → "V-12345678" (misma lógica que el RIF).
  if (/^[VE]\d{6,9}$/.test(trimmed)) {
    return `${trimmed[0]}-${trimmed.slice(1)}`
  }
  return trimmed
}

function serializeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    cedula: user.cedula,
    address: user.address,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    // Se expone para que el panel pueda mostrar quién todavía no cambió su
    // contraseña temporal. Antes el dato existía en la DB pero no viajaba.
    mustChangePassword: user.mustChangePassword === 1,
  }
}

/** GET / — equipo completo (solo superadmin). Filtros: role, isActive, search + paginación. */
router.get('/', requireSuperadmin, async (c) => {
  const role = c.req.query('role')
  const isActiveRaw = c.req.query('isActive')
  const isActive = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined
  const q = c.req.query('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
  const perPage = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('perPage') ?? '100', 10) || 100),
  )
  const offset = (page - 1) * perPage

  const filters = []
  if (role) filters.push(eq(users.role, role))
  if (isActive !== undefined) filters.push(eq(users.isActive, isActive))
  if (q) {
    const pattern = `%${q}%`
    filters.push(
      or(
        ilike(users.name, pattern),
        ilike(users.lastName, pattern),
        ilike(users.email, pattern),
        ilike(users.cedula, pattern),
        ilike(users.phone, pattern),
      ),
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(users.role, users.name)
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(users).where(where),
  ])

  const total = Number(totalRow?.count ?? 0)

  return c.json({
    success: true,
    data: {
      items: rows.map((u) => serializeUser(u)),
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  })
})

/** POST / — crear vendedor o conductor (solo superadmin). */
const createUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255),
  lastName: z.string().trim().max(255).optional().nullable(),
  cedula: z
    .preprocess(normalizeCedula, z.string().regex(CEDULA_PATTERN, 'Formato de cédula inválido (V- o E- + números)').nullable()),
  address: z.string().trim().max(255).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido'),
  ),
  password: passwordSchema,
  role: z.enum(ROLE_ENUM, { errorMap: () => ({ message: 'Rol inválido' }) }),
  phone: z.string().trim().max(50).optional().nullable(),
})

router.post('/', requireSuperadmin, zValidator('json', createUserSchema), async (c) => {
  const auth = c.get('user')
  try {
    const data = c.req.valid('json')

    const [existing] = await db.select().from(users).where(eq(users.email, data.email)).limit(1)
    if (existing) {
      return c.json({ success: false, error: 'El email ya está registrado' }, 409)
    }

    const passwordHash = await bcrypt.hash(data.password, 10)

    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        name: data.name,
        lastName: data.lastName ?? null,
        cedula: data.cedula ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        role: data.role,
        isActive: true,
        // La contraseña la escribe el superadmin → es TEMPORAL: el empleado
        // tiene que rotarla en el primer login (el login le devuelve un
        // challengeToken en vez de la sesión). Ver auth.ts /complete-password-change.
        mustChangePassword: 1,
      })
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: 'user.created',
      metadata: { targetEmail: user.email, role: user.role },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { user: serializeUser(user) } }, 201)
  } catch (error) {
    console.error('Create user error:', error)
    return c.json({ success: false, error: 'Error al crear el usuario' }, 500)
  }
})

/** GET /drivers — conductores activos + órdenes activas (superadmin o vendedor). */
router.get('/drivers', requireRole('superadmin', 'vendedor'), async (c) => {
  const drivers = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(and(eq(users.role, 'conductor'), eq(users.isActive, true)))
    .orderBy(users.name)

  const activeCounts = await db
    .select({ driverId: orders.driverId, count: count() })
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

  const activeByDriver = new Map(activeCounts.map((r) => [r.driverId, Number(r.count)]))

  const items = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    activeOrderCount: activeByDriver.get(d.id) ?? 0,
  }))

  return c.json({ success: true, data: { items, total: items.length } })
})

/** GET /sellers — vendedores + total de órdenes creadas (solo superadmin).
 *  Paginado (search, isActive, page, perPage) — mismo contrato que GET /.
 */
router.get('/sellers', requireSuperadmin, async (c) => {
  const isActiveRaw = c.req.query('isActive')
  const isActive = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined
  const q = c.req.query('search')?.trim() ?? ''
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
  const perPage = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('perPage') ?? '10', 10) || 10),
  )
  const offset = (page - 1) * perPage

  const filters: SQL[] = [eq(users.role, 'vendedor')]
  if (isActive !== undefined) filters.push(eq(users.isActive, isActive))
  if (q) {
    const pattern = `%${q}%`
    // or() tipa como SQL | undefined; con ≥1 condición siempre es SQL.
    filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(users.phone, pattern)) as SQL)
  }
  const where = filters.length ? and(...filters) : undefined

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email, isActive: users.isActive })
      .from(users)
      .where(where)
      .orderBy(users.name)
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(users).where(where),
  ])

  const sellersOnPage = rows.map((r) => r.id)

  const orderCounts =
    sellersOnPage.length > 0
      ? await db
          .select({ sellerId: orders.sellerId, count: count() })
          .from(orders)
          .where(inArray(orders.sellerId, sellersOnPage))
          .groupBy(orders.sellerId)
      : []

  const ordersBySeller = new Map(orderCounts.map((r) => [r.sellerId, Number(r.count)]))

  const total = Number(totalRow?.count ?? 0)

  const items = rows.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    isActive: s.isActive,
    orderCount: ordersBySeller.get(s.id) ?? 0,
  }))

  return c.json({
    success: true,
    data: { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  })
})

/** PATCH /:id — editar miembro del equipo (solo superadmin). */
const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255).optional(),
  lastName: z.string().trim().max(255).optional().nullable(),
  cedula: z
    .preprocess(normalizeCedula, z.string().regex(CEDULA_PATTERN, 'Formato de cédula inválido (V- o E- + números)').nullable())
    .optional(),
  address: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido').optional(),
  ),
  role: z.enum(ROLE_ENUM, { errorMap: () => ({ message: 'Rol inválido' }) }).optional(),
})

router.patch('/:id', requireSuperadmin, zValidator('json', updateUserSchema), async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const data = c.req.valid('json')

    const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!current) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)

    if (data.email && data.email !== current.email) {
      const [dup] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, data.email), not(eq(users.id, id))))
        .limit(1)
      if (dup) return c.json({ success: false, error: 'El email ya está registrado' }, 409)
    }

    const [user] = await db
      .update(users)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName ?? null } : {}),
        ...(data.cedula !== undefined ? { cedula: data.cedula ?? null } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: 'user.updated',
      metadata: { targetId: id, targetEmail: user.email },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { user: serializeUser(user) } })
  } catch (error) {
    console.error('Update user error:', error)
    return c.json({ success: false, error: 'Error al actualizar el usuario' }, 500)
  }
})

/**
 * POST /:id/reset-password — el superadmin le deja una contraseña TEMPORAL a un
 * miembro del equipo (solo superadmin).
 *
 * Reemplaza al viejo flujo de "olvidé mi contraseña" por email (eliminado: el
 * sistema no manda mails). La clave que escribe el admin es temporal y el
 * empleado está obligado a cambiarla en el primer login (`mustChangePassword = 1`).
 *
 * Además: revoca todas las sesiones activas (D2) y limpia el contador de
 * intentos fallidos — si no, alguien que venía bloqueado seguiría bloqueado
 * 15 minutos después de que el admin le cambió la clave.
 *
 * A propósito NO se bloquea el reseteo sobre otro superadmin: a diferencia de
 * `toggle-active` (que puede dejar el sistema sin ningún admin), esto es una
 * herramienta de recuperación y no puede dejar a nadie afuera.
 */
const resetPasswordSchema = z.object({
  password: passwordSchema,
})

router.post(
  '/:id/reset-password',
  requireSuperadmin,
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const auth = c.get('user')
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400)
    }

    try {
      const { password } = c.req.valid('json')

      const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
      if (!current) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)

      const passwordHash = await bcrypt.hash(password, 10)

      const [user] = await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning()

      // D2: al cambiar la clave se revocan todas las sesiones del usuario
      await revokeAllUserSessions(id)

      // El lockout es por email (utils/login-lockout.ts) → hay que limpiarlo
      clearFailedAttempts(current.email)

      await writeAuditLog({
        userId: auth.id,
        action: 'user.password_reset_by_admin',
        metadata: { targetId: id, targetEmail: current.email },
        ipAddress: clientIp(c),
      })

      return c.json({ success: true, data: { user: serializeUser(user) } })
    } catch (error) {
      console.error('Reset user password error:', error)
      return c.json({ success: false, error: 'Error al restablecer la contraseña' }, 500)
    }
  },
)

/** POST /:id/toggle-active — activar/desactivar (solo superadmin). */
router.post('/:id/toggle-active', requireSuperadmin, async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!current) return c.json({ success: false, error: 'Usuario no encontrado' }, 404)
    if (current.role === 'superadmin') {
      return c.json({ success: false, error: 'No podés desactivar al superadmin' }, 400)
    }
    if (id === auth.id) {
      return c.json({ success: false, error: 'No podés desactivar tu propia cuenta' }, 400)
    }

    const isActive = !current.isActive

    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()

    // D2: al desactivar se revocan todas las sesiones → el token muere aunque siga vigente
    if (!isActive) {
      await revokeAllUserSessions(id)
    }

    await writeAuditLog({
      userId: auth.id,
      action: 'user.toggle_active',
      metadata: { targetId: id, targetEmail: user.email, isActive },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { user: serializeUser(user) } })
  } catch (error) {
    console.error('Toggle user error:', error)
    return c.json({ success: false, error: 'Error al actualizar el usuario' }, 500)
  }
})

export default router
