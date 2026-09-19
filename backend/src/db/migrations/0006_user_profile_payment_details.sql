-- ===========================================================================
-- CRM Batista - Migracion 0006: perfil de usuario ampliado + datos de pago
-- Drizzle journal: 0006_user_profile_payment_details
--
-- Contexto: el CTO pidió ampliar el perfil de usuario (apellido, cédula V/E,
-- dirección corta) y darles a los métodos de pago un campo de texto libre para
-- los datos del pago (CBU, alias, nro de cuenta) que cada usuario llena a su
-- gusto. Son columnas opcionales: nada de lo existente se rompe.
--
-- NOTA: PGlite no permite múltiples statements en una migración preparada,
-- así que las 4 columnas van dentro de un DO block (un único statement).
-- ===========================================================================

DO $$
BEGIN
  ALTER TABLE "users" ADD COLUMN "last_name" varchar(255);
  ALTER TABLE "users" ADD COLUMN "cedula" varchar(20);
  ALTER TABLE "users" ADD COLUMN "address" varchar(255);
  ALTER TABLE "payment_methods" ADD COLUMN "payment_details" text;
END $$;