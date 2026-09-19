-- ===========================================================================
-- CRM Batista - Migracion 0004: audit_log.user_id pasa a ser opcional
-- Drizzle kit journal: 0004_audit_log_user_id_nullable
--
-- Contexto: un login fallido contra un email INEXISTENTE no dejaba rastro.
-- auth.ts llamaba a writeAuditLog con userId: 0 como valor centinela, pero
-- audit_log.user_id es FK a users(id) y era NOT NULL -> el INSERT violaba la
-- FK, fallaba, y el error se perdia en un console.error. Resultado: la fuerza
-- bruta contra emails que no existen era invisible en la auditoria.
--
-- Ahora la columna acepta NULL: ese evento se registra SIN usuario, porque
-- efectivamente no hay ningun usuario detras del intento.
-- ===========================================================================

ALTER TABLE "audit_log" ALTER COLUMN "user_id" DROP NOT NULL;
