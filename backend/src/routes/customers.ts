/**
 * Customers — clientes a los que les vende el vendedor.
 *
 * Acceso: superadmin y vendedor. El DELETE es soft (is_active=false).
 * Busqueda paginada por nombre, teléfono, email o RIF (ILIKE).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, or, ilike, count, desc, asc, sql, isNull, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { customers, users } from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { writeAuditLog, clientIp } from '../utils/audit-log.js'
import { stripHtml } from '../utils/sanitize.js'
import type { JWTPayload } from '../utils/jwt.js'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

router.use('*', authMiddleware, requireRole('superadmin', 'operador', 'cobranza'))

const PAGE_SIZE_MAX = 100

// RIF venezolano: prefijo "J-" + dígitos (el vendedor solo completa números).
// 6 a 9 dígitos para no rechazar RIFs cortos vigentes.
const RIF_PATTERN = /^J-\d{6,9}$/

// RIF de sucursal: permite sufijo de rama (ej: J-123456789-1)
const BRANCH_RIF_PATTERN = /^J-\d{6,9}(-\d{1,4})?$/

/** Prepara un RIF para guardar: normaliza espacios, "" → null, mayúscula. */
function normalizeRif(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return null
  // Tolerancia: si el usuario manda "J12345678" sin guión, lo completamos.
  return trimmed.startsWith('J') && !trimmed.startsWith('J-') ? `J-${trimmed.slice(1)}` : trimmed
}

/**
 * Mensaje de error para el cliente: en DEV incluye el detalle real del error
 * (para que un fallo como una migración sin aplicar sea diagnóstico visible),
 * en producción devuelve solo el contexto (no se filtra SQL/stack interno).
 * Es el mismo criterio que aplica `app.onError` global.
 */
function serverErrorMessage(context: string, error: unknown): string {
  if (process.env.NODE_ENV === 'production') return context
  return error instanceof Error && error.message.trim() ? `${context}: ${error.message}` : context
}

function buildSearchWhere(q: string): SQL | undefined {
  if (!q) return undefined
  const pattern = `%${q}%`
  return or(
    ilike(customers.name, pattern),
    ilike(customers.phone, pattern),
    ilike(customers.email, pattern),
    ilike(customers.rif, pattern),
  )
}

/** GET / — lista paginada. Filtros: ?search=&isActive=&page=&perPage= (default isActive=true) */
/** GET / — listar clientes raíz (incluye grupos; excluye sucursales). */
router.get('/', async (c) => {
  const q = c.req.query('search')?.trim() ?? ''
  const isActiveRaw = c.req.query('isActive')
  const isActive = isActiveRaw === 'false' ? false : isActiveRaw === 'true' ? true : true
  const page = Math.max(1, Number(c.req.query('page') ?? 1))
  const perPage = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query('perPage') ?? 20)))
  const offset = (page - 1) * perPage

  const searchWhere = buildSearchWhere(q)
  // La lista principal muestra CLIENTES raíz (grupos y simples), NUNCA
  // sucursales (esas se gestionan dentro del grupo con /branches).
  const baseWhere = searchWhere
    ? and(eq(customers.isActive, isActive), isNull(customers.parentId), searchWhere)
    : and(eq(customers.isActive, isActive), isNull(customers.parentId))

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        rif: customers.rif,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        notes: customers.notes,
        createdBy: customers.createdBy,
        createdByName: users.name,
        isGroup: customers.isGroup,
        parentId: customers.parentId,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.createdBy))
      .where(baseWhere)
      .orderBy(desc(customers.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(customers).where(baseWhere),
  ])

  return c.json({
    success: true,
    data: {
      items: rows,
      total: Number(totalRow?.count ?? 0),
      page,
      perPage,
    },
  })
})

/** POST / — crear cliente (lo registra el operador actual). */
const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255),
  rif: z
    .preprocess(normalizeRif, z.string().regex(RIF_PATTERN, 'Formato de RIF inválido (J- + números)').nullable()),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido').optional().nullable(),
  ),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  // Grupo/franquicia: si true, este cliente agrupa sucursales
  isGroup: z.boolean().optional().default(false),
})

router.post('/', zValidator('json', createCustomerSchema), async (c) => {
  const auth = c.get('user')
  try {
    const data = c.req.valid('json')

    const [customer] = await db
      .insert(customers)
      .values({
        name: data.name,
        // z.preprocess ya devuelve null para vacío; nullable en zod lo permite.
        rif: data.rif ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        createdBy: auth.id,
        isGroup: data.isGroup ?? false,
        isActive: true,
      })
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: data.isGroup ? 'customer_group.created' : 'customer.created',
      metadata: { customerId: customer.id, name: customer.name },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { customer } }, 201)
  } catch (error) {
    console.error('Create customer error:', error)
    return c.json({ success: false, error: serverErrorMessage('Error al crear el cliente', error) }, 500)
  }
})

/** GET /groups — listar solo grupos/franquicias (isGroup=true). */
router.get('/groups', async (c) => {
  const q = c.req.query('search')?.trim() ?? ''
  const page = Math.max(1, Number(c.req.query('page') ?? 1))
  const perPage = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query('perPage') ?? 20)))
  const offset = (page - 1) * perPage

  const searchWhere = buildSearchWhere(q)
  const baseWhere = searchWhere
    ? and(eq(customers.isGroup, true), eq(customers.isActive, true), searchWhere)
    : and(eq(customers.isGroup, true), eq(customers.isActive, true))

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        rif: customers.rif,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        createdBy: customers.createdBy,
        createdByName: users.name,
        isGroup: customers.isGroup,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.createdBy))
      .where(baseWhere)
      .orderBy(desc(customers.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(customers).where(baseWhere),
  ])

  return c.json({
    success: true,
    data: {
      items: rows,
      total: Number(totalRow?.count ?? 0),
      page,
      perPage,
    },
  })
})

/** GET /:id — detalle del cliente. Si es grupo, incluye sus sucursales. */
router.get('/:id', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  const [row] = await db
    .select({
      id: customers.id,
      name: customers.name,
      rif: customers.rif,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      notes: customers.notes,
      createdBy: customers.createdBy,
      createdByName: users.name,
      isGroup: customers.isGroup,
      parentId: customers.parentId,
      contactPerson: customers.contactPerson,
      isBillingAddress: customers.isBillingAddress,
      isDeliveryAddress: customers.isDeliveryAddress,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.createdBy))
    .where(eq(customers.id, id))
    .limit(1)

  if (!row) return c.json({ success: false, error: 'Cliente no encontrado' }, 404)

  // Operador solo ve sus propios clientes (creados por él o sus órdenes)
  if (auth.role === 'operador' && row.createdBy !== auth.id) {
    return c.json({ success: false, error: 'Cliente no encontrado' }, 404)
  }

  // Si es grupo/franquicia, anidar las sucursales activas
  let branches: typeof row[] = []
  if (row.isGroup) {
    branches = (await db
      .select({
        id: customers.id,
        name: customers.name,
        rif: customers.rif,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        notes: customers.notes,
        createdBy: customers.createdBy,
        createdByName: users.name,
        isGroup: customers.isGroup,
        parentId: customers.parentId,
        contactPerson: customers.contactPerson,
        isBillingAddress: customers.isBillingAddress,
        isDeliveryAddress: customers.isDeliveryAddress,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.createdBy))
      .where(and(eq(customers.parentId, id), eq(customers.isActive, true)))
      .orderBy(asc(customers.name))) as typeof row[]
  }

  return c.json({ success: true, data: { customer: { ...row, branches } } })
})

/** PATCH /:id — editar cliente. */
const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255).optional(),
  rif: z
    .preprocess(normalizeRif, z.string().regex(RIF_PATTERN, 'Formato de RIF inválido (J- + números)').nullable())
    .optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido').optional().nullable(),
  ),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isGroup: z.boolean().optional(),
})

router.patch('/:id', zValidator('json', updateCustomerSchema), async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const data = c.req.valid('json')

    const [current] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.isActive, true)))
      .limit(1)
    if (!current) return c.json({ success: false, error: 'Cliente no encontrado' }, 404)

    const [customer] = await db
      .update(customers)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        // El prefijo de RIF corre dentro del preprocess; undefined = no tocar.
        ...(data.rif !== undefined ? { rif: data.rif ?? null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.email !== undefined ? { email: data.email ?? null } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        ...(data.isGroup !== undefined ? { isGroup: data.isGroup } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning()

    await writeAuditLog({
      userId: auth.id,
      action: 'customer.updated',
      metadata: { customerId: id, name: customer.name },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { customer } })
  } catch (error) {
    console.error('Update customer error:', error)
    return c.json({ success: false, error: serverErrorMessage('Error al actualizar el cliente', error) }, 500)
  }
})

/** DELETE /:id — baja lógica (is_active=false). */
router.delete('/:id', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const [current] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.isActive, true)))
      .limit(1)
    if (!current) return c.json({ success: false, error: 'Cliente no encontrado' }, 404)

    await db
      .update(customers)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(customers.id, id))

    await writeAuditLog({
      userId: auth.id,
      action: 'customer.deleted',
      metadata: { customerId: id, name: current.name },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('Delete customer error:', error)
    return c.json({ success: false, error: serverErrorMessage('Error al eliminar el cliente', error) }, 500)
  }
})

/** POST /:id/convert-to-group — convertir un cliente individual en grupo/franquicia.
 *  Queda como grupo RAÍZ (isGroup=true, parentId null); las sucursales se
 *  agregan después con POST /:groupId/branches (Punto 1 del mandato). */
router.post('/:id/convert-to-group', async (c) => {
  const auth = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400)
  }

  try {
    const [current] = await db
      .select({
        id: customers.id,
        name: customers.name,
        isGroup: customers.isGroup,
        parentId: customers.parentId,
        isActive: customers.isActive,
      })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1)
    if (!current || !current.isActive) {
      return c.json({ success: false, error: 'Cliente no encontrado' }, 404)
    }
    if (current.isGroup) {
      return c.json({ success: false, error: 'El cliente ya es un grupo/franquicia' }, 400)
    }
    if (current.parentId !== null) {
      return c.json({ success: false, error: 'No se puede convertir una sucursal en grupo' }, 400)
    }

    // Operación en transacción (patrón PGlite del proyecto, ver orders.ts):
    // un único UPDATE con Drizzle; nada de multi-statement SQL.
    const [customer] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(customers)
        .set({ isGroup: true, updatedAt: new Date() })
        .where(eq(customers.id, id))
        .returning()
      return [updated]
    })
    if (!customer) return c.json({ success: false, error: 'Cliente no encontrado' }, 404)

    await writeAuditLog({
      userId: auth.id,
      action: 'customer.convert_to_group',
      metadata: { customerId: id, name: current.name },
      ipAddress: clientIp(c),
    })

    return c.json({ success: true, data: { customer } })
  } catch (error) {
    console.error('Convert customer to group error:', error)
    return c.json(
      { success: false, error: serverErrorMessage('Error al convertir el cliente', error) },
      500,
    )
  }
})

/* ═══════════════════════════════════════════════════════════════════════
 * SUCURSALES (BRANCHES) — gestión de sucursales de grupos/franquicias
 * ═══════════════════════════════════════════════════════════════════════ */

const branchSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255),
  rif: z.preprocess(normalizeRif, z.string().regex(BRANCH_RIF_PATTERN, 'Formato de RIF inválido (J- + números)').nullable()).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? stripHtml(v).toLowerCase() : v),
    z.string().email('Email inválido').optional().nullable(),
  ),
  address: z.string().trim().optional().nullable(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  isBillingAddress: z.boolean().optional().default(false),
  isDeliveryAddress: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
})

/** GET /:groupId/branches — listar sucursales de un grupo/franquicia. */
router.get('/:groupId/branches', async (c) => {
  const auth = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return c.json({ success: false, error: 'ID de grupo inválido' }, 400)
  }

  const [group] = await db
    .select({ id: customers.id, isGroup: customers.isGroup })
    .from(customers)
    .where(eq(customers.id, groupId))
    .limit(1)

  if (!group) return c.json({ success: false, error: 'Grupo no encontrado' }, 404)
  if (!group.isGroup) return c.json({ success: false, error: 'El cliente no es un grupo/franquicia' }, 400)

  const branches = await db
    .select({
      id: customers.id,
      name: customers.name,
      rif: customers.rif,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      contactPerson: customers.contactPerson,
      isBillingAddress: customers.isBillingAddress,
      isDeliveryAddress: customers.isDeliveryAddress,
      parentId: customers.parentId,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(eq(customers.parentId, groupId))
    .orderBy(desc(customers.createdAt))

  return c.json({ success: true, data: { branches } })
})

/** POST /:groupId/branches — crear sucursal para un grupo/franquicia. */
router.post('/:groupId/branches', zValidator('json', branchSchema), async (c) => {
  const auth = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return c.json({ success: false, error: 'ID de grupo inválido' }, 400)
  }

  const [group] = await db
    .select({ id: customers.id, isGroup: customers.isGroup })
    .from(customers)
    .where(eq(customers.id, groupId))
    .limit(1)

  if (!group) return c.json({ success: false, error: 'Grupo no encontrado' }, 404)
  if (!group.isGroup) return c.json({ success: false, error: 'El cliente no es un grupo/franquicia' }, 400)

  const data = c.req.valid('json')

  const [branch] = await db
    .insert(customers)
    .values({
      name: data.name,
      rif: data.rif ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      contactPerson: data.contactPerson ?? null,
      isBillingAddress: data.isBillingAddress ?? false,
      isDeliveryAddress: data.isDeliveryAddress ?? false,
      isGroup: false,
      parentId: groupId,
      createdBy: auth.id,
      isActive: data.isActive ?? true,
    })
    .returning()

  await writeAuditLog({
    userId: auth.id,
    action: 'branch.created',
    metadata: { branchId: branch.id, name: branch.name, groupId },
    ipAddress: clientIp(c),
  })

  return c.json({ success: true, data: { branch } }, 201)
})

/** PATCH /branches/:branchId — editar sucursal. */
router.patch('/branches/:branchId', zValidator('json', branchSchema.partial()), async (c) => {
  const auth = c.get('user')
  const branchId = Number(c.req.param('branchId'))
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return c.json({ success: false, error: 'ID de sucursal inválido' }, 400)
  }

  const [current] = await db
    .select({ id: customers.id, parentId: customers.parentId, isGroup: customers.isGroup })
    .from(customers)
    .where(eq(customers.id, branchId))
    .limit(1)

  if (!current) return c.json({ success: false, error: 'Sucursal no encontrada' }, 404)
  if (current.isGroup) return c.json({ success: false, error: 'No es una sucursal válida' }, 400)

  const data = c.req.valid('json')

  const [branch] = await db
    .update(customers)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.rif !== undefined ? { rif: data.rif ?? null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
      ...(data.email !== undefined ? { email: data.email ?? null } : {}),
      ...(data.address !== undefined ? { address: data.address ?? null } : {}),
      ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson ?? null } : {}),
      ...(data.isBillingAddress !== undefined ? { isBillingAddress: data.isBillingAddress } : {}),
      ...(data.isDeliveryAddress !== undefined ? { isDeliveryAddress: data.isDeliveryAddress } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, branchId))
    .returning()

  await writeAuditLog({
    userId: auth.id,
    action: 'branch.updated',
    metadata: { branchId, name: branch.name },
    ipAddress: clientIp(c),
  })

  return c.json({ success: true, data: { branch } })
})

/** DELETE /branches/:branchId — baja lógica de sucursal. */
router.delete('/branches/:branchId', async (c) => {
  const auth = c.get('user')
  const branchId = Number(c.req.param('branchId'))
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return c.json({ success: false, error: 'ID de sucursal inválido' }, 400)
  }

  const [current] = await db
    .select({ id: customers.id, name: customers.name, isGroup: customers.isGroup })
    .from(customers)
    .where(and(eq(customers.id, branchId), eq(customers.isGroup, false)))
    .limit(1)

  if (!current) return c.json({ success: false, error: 'Sucursal no encontrada' }, 404)

  await db
    .update(customers)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(eq(customers.id, branchId))

  await writeAuditLog({
    userId: auth.id,
    action: 'branch.deleted',
    metadata: { branchId, name: current.name },
    ipAddress: clientIp(c),
  })

  return c.json({ success: true })
})

export default router
