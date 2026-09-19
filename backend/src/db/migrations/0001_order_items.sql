-- ══════════════════════════════════════════════════════════════════════════
-- CRM Batista — Migración 0001: order_items (contenido estructurado del pedido)
-- Drizzle kit journal: 0001_order_items
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL,
  "product_name" varchar(255) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price" numeric(12, 2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_order_id" ON "order_items" ("order_id");