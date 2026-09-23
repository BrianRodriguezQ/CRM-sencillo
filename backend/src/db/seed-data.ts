/**
 * Datos de ejemplo del L&L System CRM.
 *
 * Usado tanto por `npm run db:seed` (scripts/bulk) como por la ruta
 * POST /api/seed-dev (solo dev). Idempotente: si un email ya existe,
 * lo salta. Deja la base con:
 *   - 1 superadmin  (demo@nameemp.com / Demo1234!)
 *   - 2 operadores
 *   - 1 cobranza
 *   - 3 conductores
 *   - 5 clientes (algunos con sucursales)
 *   - 5 métodos de pago (efectivo, transferencia, tarjeta, pago móvil, zelle)
 *     con sus reglas de comprobante (requires_reference / requires_receipt)
 */
import bcrypt from 'bcryptjs'
import { eq, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, customers, paymentMethods } from './schema.js'

const SEED_PASSWORD = 'Demo1234!'

const SEED_ADMIN = { name: 'Superadmin Demo', email: 'demo@nameemp.com' }

const SEED_OPERADORES = [
  { name: 'Operador Uno', email: 'operador1@nameemp.com' },
  { name: 'Operadora Dos', email: 'operador2@nameemp.com' },
]

const SEED_COBRANZA = [
  { name: 'Cobranza Principal', email: 'cobranza@nameemp.com' },
]

const SEED_DRIVERS = [
  { name: 'Conductor Uno', email: 'conductor1@nameemp.com' },
  { name: 'Conductora Dos', email: 'conductor2@nameemp.com' },
  { name: 'Conductor Tres', email: 'conductor3@nameemp.com' },
]

// Clientes: algunos son grupos/franquicias con sucursales (branches)
const SEED_CUSTOMERS = [
  // Grupo/Franquicia con sucursales
  {
    name: 'Franquicia Café Central',
    rif: 'J-123456789',
    phone: '+58 412 111 1111',
    email: 'cafecentral@example.com',
    address: 'Av. Principal, Caracas (Casa Matriz)',
    notes: 'Grupo con 3 sucursales en Caracas',
    isGroup: true,
    isActive: true,
    branches: [
      {
        name: 'Sucursal Centro',
        rif: 'J-123456789-1',
        phone: '+58 412 111 1112',
        email: 'centro@cafecentral.com',
        address: 'Av. Urdaneta, Caracas',
        contactPerson: 'María González',
        isBillingAddress: true,
        isDeliveryAddress: true,
        isActive: true,
      },
      {
        name: 'Sucursal Chacao',
        rif: 'J-123456789-2',
        phone: '+58 412 111 1113',
        email: 'chacao@cafecentral.com',
        address: 'Av. Francisco de Miranda, Chacao',
        contactPerson: 'Carlos Ruiz',
        isBillingAddress: false,
        isDeliveryAddress: true,
        isActive: true,
      },
      {
        name: 'Sucursal Las Mercedes',
        rif: 'J-123456789-3',
        phone: '+58 412 111 1114',
        email: 'lasmercedes@cafecentral.com',
        address: 'Av. Las Mercedes, Baruta',
        contactPerson: 'Ana Torres',
        isBillingAddress: false,
        isDeliveryAddress: true,
        isActive: true,
      },
    ],
  },
  // Grupo/Franquicia con sucursales
  {
    name: 'Restaurantes El Fogón',
    rif: 'J-987654321',
    phone: '+58 414 222 2222',
    email: 'elfogon@example.com',
    address: 'Calle Central, Maracaibo (Casa Matriz)',
    notes: 'Cadena de restaurantes en Zulia',
    isGroup: true,
    isActive: true,
    branches: [
      {
        name: 'Sucursal Maracaibo Centro',
        rif: 'J-987654321-1',
        phone: '+58 414 222 2223',
        email: 'centro@elfogon.com',
        address: 'Av. 5 de Julio, Maracaibo',
        contactPerson: 'Juan Pérez',
        isBillingAddress: true,
        isDeliveryAddress: true,
        isActive: true,
      },
      {
        name: 'Sucursal San Francisco',
        rif: 'J-987654321-2',
        phone: '+58 414 222 2224',
        email: 'sanfrancisco@elfogon.com',
        address: 'Av. Universidad, San Francisco',
        contactPerson: 'Laura Vargas',
        isBillingAddress: false,
        isDeliveryAddress: true,
        isActive: true,
      },
    ],
  },
  // Clientes individuales (sin sucursales)
  {
    name: 'Distribuidora La Ceiba',
    rif: 'J-111222333',
    phone: '+58 424 333 3333',
    email: 'laceiba@example.com',
    address: 'Av. Libertador, Valencia',
    notes: 'Cliente individual sin sucursales',
    isGroup: false,
    isActive: true,
  },
  {
    name: 'Comercial Los Andes',
    rif: 'J-444555666',
    phone: '+58 412 444 4444',
    email: 'losandes@example.com',
    address: 'Calle Real, Barquisimeto',
    notes: 'Cliente individual sin sucursales',
    isGroup: false,
    isActive: true,
  },
  {
    name: 'Inversiones Mérida',
    rif: 'J-777888999',
    phone: '+58 416 555 5555',
    email: 'merida@example.com',
    address: 'Av. Bolívar, Mérida',
    notes: 'Cliente individual sin sucursales',
    isGroup: false,
    isActive: true,
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
  operadores: number
  cobranza: number
  drivers: number
  customers: number
  branches: number
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

  let operadores = 0
  for (const s of SEED_OPERADORES) {
    const r = await ensureUser({ ...s, role: 'operador' })
    if (r === 'created') operadores++
  }

  let cobranza = 0
  for (const c of SEED_COBRANZA) {
    const r = await ensureUser({ ...c, role: 'cobranza' })
    if (r === 'created') cobranza++
  }

  let drivers = 0
  for (const d of SEED_DRIVERS) {
    const r = await ensureUser({ ...d, role: 'conductor' })
    if (r === 'created') drivers++
  }

  let customerCount = 0
  let branchCount = 0
  if ((await countRows(customers)) === 0) {
    for (const c of SEED_CUSTOMERS) {
      const { branches, ...customerData } = c
      const [createdCustomer] = await db.insert(customers).values({
        ...customerData,
        isActive: true,
      }).returning({ id: customers.id })
      customerCount++

      if (branches && branches.length > 0) {
        for (const branch of branches) {
          await db.insert(customers).values({
            ...branch,
            isGroup: false,
            parentId: createdCustomer.id,
            isActive: true,
          })
          branchCount++
        }
      }
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

  return { admin, operadores, cobranza, drivers, customers: customerCount, branches: branchCount, paymentMethods: methods }
}
