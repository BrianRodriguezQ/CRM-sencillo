/**
 * Datos de ejemplo del CRM Batista.
 *
 * Usado tanto por `npm run db:seed` (scripts/bulk) como por la ruta
 * POST /api/seed-dev (solo dev). Idempotente: si un email ya existe,
 * lo salta. Deja la base con:
 *   - 1 superadmin  (demo@nameemp.com / Demo1234!)
 *   - 2 vendedores
 *   - 3 conductores
 *   - 5 clientes
 *   - 5 métodos de pago (efectivo, transferencia, tarjeta, pago móvil, zelle)
 *     con sus reglas de comprobante (requires_reference / requires_receipt)
 */
import bcrypt from 'bcryptjs'
import { eq, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, customers, paymentMethods } from './schema.js'

const SEED_PASSWORD = 'Demo1234!'

const SEED_ADMIN = { name: 'Superadmin Demo', email: 'demo@nameemp.com' }

const SEED_SELLERS = [
  { name: 'Vendedor Uno', email: 'vendedor1@nameemp.com' },
  { name: 'Vendedora Dos', email: 'vendedor2@nameemp.com' },
]

const SEED_DRIVERS = [
  { name: 'Conductor Uno', email: 'conductor1@nameemp.com' },
  { name: 'Conductora Dos', email: 'conductor2@nameemp.com' },
  { name: 'Conductor Tres', email: 'conductor3@nameemp.com' },
]

const SEED_CUSTOMERS = [
  {
    name: 'Cliente Uno',
    phone: '+58 412 000 0001',
    email: 'cliente1@example.com',
    address: 'Av. Principal, Caracas',
  },
  {
    name: 'Cliente Dos',
    phone: '+58 414 000 0002',
    email: 'cliente2@example.com',
    address: 'Calle Central, Maracaibo',
  },
  {
    name: 'Cliente Tres',
    phone: '+58 424 000 0003',
    email: 'cliente3@example.com',
    address: 'Av. Libertador, Valencia',
  },
  {
    name: 'Cliente Cuatro',
    phone: '+58 412 000 0004',
    email: 'cliente4@example.com',
    address: 'Calle Real, Barquisimeto',
  },
  {
    name: 'Cliente Cinco',
    phone: '+58 416 000 0005',
    email: 'cliente5@example.com',
    address: 'Av. Bolívar, Mérida',
  },
]

const SEED_METHODS = [
  {
    name: 'Efectivo',
    code: 'efectivo',
    sortOrder: 1,
    requiresReference: false,
    requiresReceipt: false,
  },
  {
    name: 'Transferencia',
    code: 'transferencia',
    sortOrder: 2,
    requiresReference: true,
    requiresReceipt: false,
  },
  {
    name: 'Tarjeta',
    code: 'tarjeta',
    sortOrder: 3,
    requiresReference: true,
    requiresReceipt: false,
  },
  {
    name: 'Pago Móvil',
    code: 'pago_movil',
    sortOrder: 4,
    requiresReference: true,
    requiresReceipt: true,
  },
  {
    name: 'Zelle',
    code: 'zelle',
    sortOrder: 5,
    requiresReference: true,
    requiresReceipt: false,
  },
]

export interface SeedResult {
  admin: 'created' | 'exists'
  sellers: number
  drivers: number
  customers: number
  paymentMethods: number
}

/**
 * Crea el usuario con la contraseña semilla (idempotente).
 */
async function ensureUser(input: {
  name: string
  email: string
  role: string
}): Promise<'created' | 'exists'> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
  if (existing) return 'exists'

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)

  await db.insert(users).values({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    isActive: true,
    mustChangePassword: 0,
  })

  return 'created'
}

async function countRows(table: typeof customers): Promise<number> {
  const [row] = await db.select({ count: count() }).from(table)
  return Number(row?.count ?? 0)
}

export async function seedDemoData(): Promise<SeedResult> {
  const admin = await ensureUser({ ...SEED_ADMIN, role: 'superadmin' })

  let sellers = 0
  for (const s of SEED_SELLERS) {
    const r = await ensureUser({ ...s, role: 'vendedor' })
    if (r === 'created') sellers++
  }

  let drivers = 0
  for (const d of SEED_DRIVERS) {
    const r = await ensureUser({ ...d, role: 'conductor' })
    if (r === 'created') drivers++
  }

  let customerCount = 0
  if ((await countRows(customers)) === 0) {
    for (const c of SEED_CUSTOMERS) {
      await db.insert(customers).values({
        ...c,
        isActive: true,
      })
      customerCount++
    }
  }

  let methods = 0
  for (const m of SEED_METHODS) {
    const [existing] = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.code, m.code))
      .limit(1)
    if (existing) continue
    await db.insert(paymentMethods).values(m)
    methods++
  }

  return { admin, sellers, drivers, customers: customerCount, paymentMethods: methods }
}
