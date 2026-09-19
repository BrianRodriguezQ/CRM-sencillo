-- ===========================================================================
-- CRM Batista - Migracion 0007: RIF en clientes
-- Drizzle journal: 0007_customers_rif
--
-- Contexto: el CTO pidió agregar el RIF al panel de clientes. El vendedor
-- escribe el prefijo "J-" fijo y completa los números al lado (igual que el
-- patrón de cédula V-/E- que usa el equipo). Columna opcional: nada de lo
-- existente se rompe.
--
-- NOTA: PGlite no permite múltiples statements en una migración preparada,
-- así que la columna va dentro de un DO block (un único statement).
-- ===========================================================================

DO $$
BEGIN
  ALTER TABLE "customers" ADD COLUMN "rif" varchar(20);
END $$;