-- ===========================================================================
-- CRM Batista - Migracion 0008: pagos de orden + flags de comprobante
-- Drizzle journal: 0008_order_payments
--
-- Contexto (CTO 2026-09): el cierre de pedido exige comprobante de pago.
--   1. Tabla order_payments: abonos (uno o varios) contra una orden. El saldo
--      = orders.amount - SUM(order_payments.amount); paymentStatus se deriva
--      (pending | partial | paid).
--   2. payment_methods.requires_reference / requires_receipt: regla de
--      comprobante por método (pago móvil = referencia y/o foto; tarjeta /
--      transferencia / zelle = referencia; efectivo = ninguno, se auto-
--      registra al entregar).
--
-- NOTA: PGlite no permite múltiples statements en una migración preparada,
-- así que todo va dentro de un único DO block (un solo statement).
-- ===========================================================================

DO $$
BEGIN
  ALTER TABLE "payment_methods"
    ADD COLUMN "requires_reference" boolean NOT NULL DEFAULT true,
    ADD COLUMN "requires_receipt" boolean NOT NULL DEFAULT false;

  CREATE TABLE "order_payments" (
    "id" serial PRIMARY KEY NOT NULL,
    "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "payment_method_id" integer NOT NULL REFERENCES "payment_methods"("id") ON DELETE RESTRICT,
    "amount" numeric(12, 2) NOT NULL,
    "reference" varchar(255),
    "receipt_url" varchar(500),
    "note" text,
    "paid_at" timestamp DEFAULT now() NOT NULL,
    "recorded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );

  CREATE INDEX "idx_order_payments_order_id" ON "order_payments" ("order_id");
  CREATE INDEX "idx_order_payments_method_id" ON "order_payments" ("payment_method_id");

  UPDATE "payment_methods" SET "requires_reference" = false, "requires_receipt" = false WHERE "code" = 'efectivo';
  UPDATE "payment_methods" SET "requires_reference" = true,  "requires_receipt" = true  WHERE "code" = 'pago_movil';
  UPDATE "payment_methods" SET "requires_reference" = true,  "requires_receipt" = false WHERE "code" IN ('transferencia', 'tarjeta', 'zelle');
END $$;