-- ===========================================================================
-- CRM Batista - Migracion 0002: eliminacion de la verificacion por email
-- Drizzle kit journal: 0002_drop_email_verification
--
-- Contexto: la feature de verificacion por email se abandono. La UI
-- (VerifyEmail.tsx) ya fue eliminada y el backend nunca consumio la tabla
-- email_verification_tokens ni la columna users.email_verified_at:
-- no existia ni un solo lector ni escritor en todo el codigo.
-- ===========================================================================

DROP TABLE IF EXISTS "email_verification_tokens" CASCADE;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at";
