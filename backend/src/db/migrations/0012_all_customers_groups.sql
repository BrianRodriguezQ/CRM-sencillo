-- ===========================================================================
-- L&L System CRM - Migracion 0012: todos los clientes como grupo con sede
-- Drizzle journal: 0012_all_customers_groups
--
-- Mandato CTO (2026-09), Puntos 3 y 4:
--   "Actualizá todos los clientes que tenemos al nuevo formato" y
--   "Clientes en una sola pestaña abarca todos los casos".
--
-- Cambios:
--   1. Columna `is_primary` en customers: marca la SUCURSAL PRINCIPAL de cada
--      grupo. Aditiva y documentada: la usa el POST /customers con branches y
--      queda como metadata para distinguir principal de secundarias.
--   2. Los clientes individuales (is_group=false AND parent_id IS NULL) se
--      convierten en GRUPO (is_group=true). No se toca su fila: las ordenes
--      existentes (orders.customer_id) y notas de entrega siguen apuntando
--      al mismo id.
--   3. Cada grupo SIN ninguna sucursal recibe su sucursal principal:
--      name = 'Sucursal principal' (valor fijo, claro y documentado), con
--      rif/phone/email/address/contact_person/is_billing_address/
--      is_delivery_address copiados del grupo. NOTA: notes queda en el grupo
--      (es del cliente, no de la sede).
--   4. Idempotente: el INSERT solo corre cuando el grupo NO tiene ninguna
--      sucursal (NOT EXISTS). Correr la migracion dos veces no crea duplicados.
--
-- NOTA: PGlite no permite multiples statements en una migracion preparada,
-- asi que todo va dentro de un unico DO block (patron de 0010/0011).
-- ===========================================================================

DO $$
BEGIN
  -- 1. Columna de sucursal principal (aditiva, default false)
  ALTER TABLE "customers"
    ADD COLUMN IF NOT EXISTS "is_primary" boolean NOT NULL DEFAULT false;

  -- 2. Convertir clientes individuales en grupos (raiz)
  UPDATE "customers"
    SET "is_group" = true
    WHERE "is_group" = false AND "parent_id" IS NULL;

  -- 3. Sucursal principal para cada grupo sin ninguna sucursal (idempotente)
  INSERT INTO "customers"
    ("name", "rif", "phone", "email", "address", "created_by",
     "is_group", "parent_id", "contact_person", "is_billing_address",
     "is_delivery_address", "is_active", "is_primary")
  SELECT
    'Sucursal principal', g."rif", g."phone", g."email", g."address", g."created_by",
    false, g."id", g."contact_person", g."is_billing_address",
    g."is_delivery_address", g."is_active", true
  FROM "customers" g
  WHERE g."is_group" = true
    AND g."parent_id" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "customers" b WHERE b."parent_id" = g."id"
    );
END $$;