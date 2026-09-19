-- ===========================================================================
-- CRM Batista - Migracion 0003: eliminacion de la tabla de reset por email
-- Drizzle kit journal: 0003_drop_password_reset_tokens
--
-- Contexto: se elimino la feature de "olvide mi contrasena" por email (el
-- sistema no manda mails). Las rutas POST /auth/forgot-password y
-- POST /auth/reset-password ya no existen, y el reseteo de claves ahora lo
-- hace el superadmin desde POST /api/users/:id/reset-password, que deja una
-- contrasena TEMPORAL (must_change_password = 1) y revoca las sesiones.
--
-- La tabla password_reset_tokens quedo sin ningun lector ni escritor:
-- el token de un solo uso que guardaba ya no se emite ni se valida.
-- ===========================================================================

DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
