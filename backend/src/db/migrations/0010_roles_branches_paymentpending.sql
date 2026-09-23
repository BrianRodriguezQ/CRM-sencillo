-- ===========================================================================
-- L&L System CRM - Migracion 0010: nuevos roles, sucursales, paymentPending
-- Drizzle journal: 0010_roles_branches_paymentpending
--
-- Cambios:
--   1. Roles: superadmin | operador | cobranza | conductor (vendedor -> operador)
--   2. Customers: is_group, parent_id (para sucursales/franquicias)
--   3. Orders: branch_id, payment_pending (conductor no cobra, cobranza gestiona)
--
-- NOTA: PGlite no permite múltiples statements en una migración preparada,
-- así que todo va dentro de un único DO block (un solo statement).
-- ===========================================================================

DO $$
BEGIN
  -- 1. Customers: agregar is_group y parent_id para sucursales/franquicias
  ALTER TABLE "customers"
    ADD COLUMN IF NOT EXISTS "is_group" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "parent_id" integer REFERENCES "customers"("id") ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS "idx_customers_parent_id" ON "customers" ("parent_id");
  CREATE INDEX IF NOT EXISTS "idx_customers_is_group" ON "customers" ("is_group");

  -- 2. Orders: agregar branch_id (sucursal) y payment_pending
  ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "branch_id" integer REFERENCES "customers"("id") ON DELETE SET NULL;

  ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "payment_pending" boolean NOT NULL DEFAULT false;

  CREATE INDEX IF NOT EXISTS "idx_orders_branch_id" ON "orders" ("branch_id");
  CREATE INDEX IF NOT EXISTS "idx_orders_payment_pending" ON "orders" ("payment_pending");

  -- 3. Migrar roles existentes: vendedor -> operador
  UPDATE "users" SET "role" = 'operador' WHERE "role" = 'vendedor';

END $$;