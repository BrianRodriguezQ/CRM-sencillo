/**
 * Schema — L&L System CRM
 *
 * Dominio: delivery / ventas por agentes.
 *   - superadmin: acceso total
 *   - operador: toma pedidos, gestiona sus clientes y sucursales
 *   - cobranza: cobros, cuentas por cobrar, resumen financiero, notas de entrega
 *   - conductor: solo lectura, ve sus entregas asignadas
 *
 * Stack: Hono + Drizzle (pg-core) + PGlite (Postgres embebido → mismo schema
 * que producción. Migrar al entregar = cambiar connection string).
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  numeric,
  AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

/* ═══════════════════════════════════════════════════════════════════════
 * USUARIOS — 4 roles: superadmin | operador | cobranza | conductor
 * ═══════════════════════════════════════════════════════════════════════ */

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }),
    cedula: varchar('cedula', { length: 20 }),
    address: varchar('address', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    role: varchar('role', { length: 20 }).notNull(), // superadmin | operador | cobranza | conductor
    isActive: boolean('is_active').default(true).notNull(),
    // D1: 2FA TOTP
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabled: integer('totp_enabled').notNull().default(0),
    recoveryCodes: text('recovery_codes'),
    // D4: contraseña temporal pendiente de rotación en primer login
    mustChangePassword: integer('must_change_password').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_users_email').on(table.email), index('idx_users_role').on(table.role)],
)

export const usersRelations = relations(users, ({ many }) => ({
  soldOrders: many(orders, { relationName: 'sellerOrders' }),
  deliveredOrders: many(orders, { relationName: 'driverOrders' }),
  statusChanges: many(orderStatusHistory),
  communications: many(orderCommunications),
  notifications: many(notifications),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * CLIENTES — franquicias/grupos con sucursales (branches)
 * ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
 * CLIENTES — franquicias/grupos con sucursales (branches)
 * ═══════════════════════════════════════════════════════════════════════ */

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    // RIF venezolano con prefijo: "J-123456789" (lo completa el operador)
    rif: varchar('rif', { length: 20 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),          // Dirección principal (facturación por defecto)
    notes: text('notes'),
    // Operador que registró/alimentó al cliente
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    // Grupo/franquicia: si es true, este cliente agrupa sucursales (branches)
    isGroup: boolean('is_group').default(false).notNull(),
    // Referencia al grupo padre (para sucursales)
    parentId: integer('parent_id').references((): AnyPgColumn => customers.id, { onDelete: 'set null' }),
    // Marca la sucursal PRINCIPAL de un grupo (una por grupo, la primera).
    // La crea la migracion 0012 para los convertidos y el POST /customers con
    // branches para los nuevos. Aditiva: nada la lee obligatoriamente.
    isPrimary: boolean('is_primary').default(false).notNull(),
    // Campos de sucursal (solo para branches, isGroup=false con parentId set)
    contactPerson: varchar('contact_person', { length: 255 }),
    isBillingAddress: boolean('is_billing_address').default(false).notNull(),
    isDeliveryAddress: boolean('is_delivery_address').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_customers_created_by').on(table.createdBy),
    index('idx_customers_phone').on(table.phone),
    index('idx_customers_parent_id').on(table.parentId),
    index('idx_customers_is_group').on(table.isGroup),
  ],
)

export const customersRelations = relations(customers, ({ one, many }) => ({
  creator: one(users, {
    fields: [customers.createdBy],
    references: [users.id],
  }),
  parent: one(customers, {
    fields: [customers.parentId],
    references: [customers.id],
    relationName: 'branches',
  }),
  branches: many(customers, { relationName: 'branches' }),
  orders: many(orders),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * MÉTODOS DE PAGO — catálogo (efectivo, transferencia, tarjeta, zelle…)
 * ═══════════════════════════════════════════════════════════════════════ */

export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 30 }).unique().notNull(),
  paymentDetails: text('payment_details'),
  // Reglas de comprobante al registrar un pago con este método:
  //   requiresReference → exige número de referencia (o foto, según el método)
  //   requiresReceipt   → exige foto del comprobante
  // Regla operativa (CTO 2026-09): pago móvil = referencia Y/O foto (al menos
  // uno); tarjeta/transferencia/zelle = referencia; efectivo = ninguno (se
  // auto-registra al entregar).
  requiresReference: boolean('requires_reference').default(true).notNull(),
  requiresReceipt: boolean('requires_receipt').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const paymentMethodsRelations = relations(paymentMethods, ({ many }) => ({
  orders: many(orders),
  payments: many(orderPayments),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * ÓRDENES — núcleo del sistema.
 *
 * Cada orden va atada a: cliente (customerId) + vendedor (sellerId) +
 * conductor (driverId) + método de pago. Totalmente rastreable vía
 * order_status_history (cada cambio de estado queda registrado con quién,
 * cuándo y una nota opcional).
 * ═══════════════════════════════════════════════════════════════════════ */

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    // Número legible para humanos: ORD-0001, ORD-0002…
    orderNumber: varchar('order_number', { length: 20 }).notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Sucursal específica (branch) — opcional, si el cliente es grupo
    branchId: integer('branch_id').references(() => customers.id, { onDelete: 'set null' }),
    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    driverId: integer('driver_id').references(() => users.id, { onDelete: 'set null' }),
    paymentMethodId: integer('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('pending'), // pending | partial | paid | cancelled
    // Flag: true = "dejar pago pendiente" (conductor no cobra, cobranza lo gestiona luego)
    paymentPending: boolean('payment_pending').default(false).notNull(),
    orderStatus: varchar('order_status', { length: 20 }).notNull().default('created'), // created | accepted | in_transit | delivered | cancelled
    // Dirección de entrega (si aplica distinta a la del cliente/sucursal)
    deliveryAddress: text('delivery_address'),
    notes: text('notes'),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_customer_id').on(table.customerId),
    index('idx_orders_branch_id').on(table.branchId),
    index('idx_orders_seller_id').on(table.sellerId),
    index('idx_orders_driver_id').on(table.driverId),
    index('idx_orders_payment_method_id').on(table.paymentMethodId),
    index('idx_orders_order_status').on(table.orderStatus),
    index('idx_orders_payment_status').on(table.paymentStatus),
    index('idx_orders_payment_pending').on(table.paymentPending),
    index('idx_orders_created_at').on(table.createdAt),
  ],
)

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  branch: one(customers, {
    fields: [orders.branchId],
    references: [customers.id],
  }),
  seller: one(users, {
    fields: [orders.sellerId],
    references: [users.id],
    relationName: 'sellerOrders',
  }),
  driver: one(users, {
    fields: [orders.driverId],
    references: [users.id],
    relationName: 'driverOrders',
  }),
  paymentMethod: one(paymentMethods, {
    fields: [orders.paymentMethodId],
    references: [paymentMethods.id],
  }),
  statusHistory: many(orderStatusHistory),
  communications: many(orderCommunications),
  items: many(orderItems),
  payments: many(orderPayments),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * ÍTEMS DE ORDEN — contenido estructurado del pedido.
 *
 * El vendedor arma el pedido producto por producto (nombre, cantidad,
 * precio unitario). El total de la orden (orders.amount) se recalcula en
 * el backend como suma de líneas cuando vienen items.
 * ═══════════════════════════════════════════════════════════════════════ */

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productName: varchar('product_name', { length: 255 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_order_items_order_id').on(table.orderId)],
)

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * PAGOS DE ORDEN — abonos registrados contra una orden.
 *
 * Cierre de pedido (CTO 2026-09): una orden se ENTREGA solo cuando el saldo
 * es 0. Los pagos se registran acá (uno o varios por orden):
 *   - pago móvil: referencia y/o foto del comprobante (al menos uno)
 *   - tarjeta/transferencia/zelle: referencia
 *   - efectivo: se auto-registra al marcar la entrega (monto total)
 * El saldo = orders.amount − Σ(order_payments.amount). paymentStatus de la
 * orden se deriva de esta tabla (pending | partial | paid).
 * ═══════════════════════════════════════════════════════════════════════ */

export const orderPayments = pgTable(
  'order_payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Método REAL con el que se pagó (puede diferir del método elegido en la
    // orden: ej. orden por transferencia, abono parcial en efectivo).
    paymentMethodId: integer('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reference: varchar('reference', { length: 255 }),
    receiptUrl: varchar('receipt_url', { length: 500 }),
    note: text('note'),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    recordedBy: integer('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_payments_order_id').on(table.orderId),
    index('idx_order_payments_method_id').on(table.paymentMethodId),
  ],
)

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, {
    fields: [orderPayments.orderId],
    references: [orders.id],
  }),
  method: one(paymentMethods, {
    fields: [orderPayments.paymentMethodId],
    references: [paymentMethods.id],
  }),
  recorder: one(users, {
    fields: [orderPayments.recordedBy],
    references: [users.id],
    relationName: 'recordedPayments',
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * HISTORIAL DE ESTADOS — rastreabilidad total de cada orden.
 * Cada transición: estado nuevo, quién la hizo, cuándo, nota opcional.
 * ═══════════════════════════════════════════════════════════════════════ */

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull(),
    changedBy: integer('changed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_order_status_history_order_id').on(table.orderId)],
)

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
  changer: one(users, {
    fields: [orderStatusHistory.changedBy],
    references: [users.id],
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * COMUNICACIONES — chat vendedor ↔ conductor por orden.
 * El conductor "se mantiene en comunicación con el vendedor que le da la orden".
 * ═══════════════════════════════════════════════════════════════════════ */

export const orderCommunications = pgTable(
  'order_communications',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    message: text('message').notNull(),
    // WP2 (CTO 2026-09): adjunto opcional — imagen de evidencia en el chat.
    attachmentUrl: varchar('attachment_url', { length: 500 }),
    attachmentMime: varchar('attachment_mime', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_order_communications_order_id').on(table.orderId)],
)

export const orderCommunicationsRelations = relations(orderCommunications, ({ one }) => ({
  order: one(orders, {
    fields: [orderCommunications.orderId],
    references: [orders.id],
  }),
  sender: one(users, {
    fields: [orderCommunications.senderId],
    references: [users.id],
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * NOTIFICACIONES — in-app. El conductor "recibe la notificación" al ser
 * asignado a una orden y cuando el vendedor le comunica algo.
 * ═══════════════════════════════════════════════════════════════════════ */

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(), // order_assigned | order_status | order_message | system
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    data: jsonb('data').default({}),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_user_unread').on(table.userId, table.isRead, table.createdAt),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
)

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * AUDITORÍA — superadmin "acceso a todo": dejar rastro.
 * ═══════════════════════════════════════════════════════════════════════ */

export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id'),
    // Opcional a proposito: hay eventos sin usuario (ej. login fallido contra un
    // email inexistente). Antes se usaba userId: 0 como centinela, que violaba la
    // FK y hacia que el INSERT fallara en silencio. Ver migracion 0004.
    userId: integer('user_id').references(() => users.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 50 }).notNull(),
    metadata: jsonb('metadata').default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (_table) => [
    index('idx_audit_log_user_id').on(_table.userId),
    index('idx_audit_log_created_at').on(_table.createdAt),
  ],
)

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}))

/* ═══════════════════════════════════════════════════════════════════════
 * SETTINGS — key-value (nombre de empresa, moneda, etc.)
 * ═══════════════════════════════════════════════════════════════════════ */

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/* ═══════════════════════════════════════════════════════════════════════
 * INFRA AUTH — reutilizada del modelo fuente:
 * sesiones con refresh rotation, tokens de reset/verificación, historial
 * de contraseñas, avatares personales.
 * ═══════════════════════════════════════════════════════════════════════ */

export const userAvatars = pgTable(
  'user_avatars',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 500 }).notNull(),
    isActive: integer('is_active').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_user_avatars_user_id').on(table.userId)],
)

// ── D2 — Sesiones con refresh token rotation ──
export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: varchar('family_id', { length: 64 }).notNull(),
    refreshHash: varchar('refresh_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    userAgent: varchar('user_agent', { length: 500 }),
    ip: varchar('ip', { length: 64 }),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_family_id').on(table.familyId),
  ],
)

/* Relaciones de infra (compactas) */
export const userAvatarsRelations = relations(userAvatars, ({ one }) => ({
  user: one(users, { fields: [userAvatars.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))
