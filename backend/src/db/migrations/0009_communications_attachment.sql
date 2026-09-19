-- ===========================================================================
-- CRM Batista - Migracion 0009: adjuntos en comunicaciones (WP2, CTO 2026-09)
-- Drizzle journal: 0009_communications_attachment
--
-- Contexto: el chat vendedor-despacho-conductor solo tenia texto. El CTO
-- aprobo imagenes como evidencia de entrega/estado (audios cancelados).
-- Se agregan dos columnas NULLABLES a order_communications:
--   attachment_url  → ruta servida por el backend (filesystem: uploads/communications/)
--   attachment_mime → image/png | image/jpeg | image/webp (para render seguro)
--
-- Un mensaje puede tener texto, imagen, o ambos. Sin adjunto = comportamiento
-- anterior intacto (mensajes viejos siguen funcionando).
--
-- NOTA: PGlite no permite multiples statements en una migracion preparada,
-- asi que todo va dentro de un unico DO block (un solo statement).
-- ===========================================================================

DO $$
BEGIN
  ALTER TABLE "order_communications"
    ADD COLUMN "attachment_url" varchar(500),
    ADD COLUMN "attachment_mime" varchar(50);
END $$;