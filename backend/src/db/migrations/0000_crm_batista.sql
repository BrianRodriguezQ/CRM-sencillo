-- ══════════════════════════════════════════════════════════════════════════
-- CRM Batista — Migración baseline (consolidada).
-- Drizzle kit journal: 0000_crm_batista
-- ══════════════════════════════════════════════════════════════════════════

-- 1. USUARIOS
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(50),
  "avatar_url" varchar(500),
  "role" varchar(20) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "totp_secret_enc" text,
  "totp_enabled" integer NOT NULL DEFAULT 0,
  "recovery_codes" text,
  "must_change_password" integer NOT NULL DEFAULT 0,
  "email_verified_at" timestamp with time zone,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role");
--> statement-breakpoint

-- 2. CLIENTES
CREATE TABLE IF NOT EXISTS "customers" (
  "id" serial PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "phone" varchar(50),
  "email" varchar(255),
  "address" text,
  "notes" text,
  "created_by" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "customers_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customers_created_by" ON "customers" ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customers_phone" ON "customers" ("phone");
--> statement-breakpoint

-- 3. MÉTODOS DE PAGO
CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "code" varchar(30) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_code_unique" ON "payment_methods" ("code");
--> statement-breakpoint

-- 4. ÓRDENES
CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY,
  "order_number" varchar(20) NOT NULL,
  "customer_id" integer NOT NULL,
  "seller_id" integer NOT NULL,
  "driver_id" integer,
  "payment_method_id" integer NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "payment_status" varchar(20) NOT NULL DEFAULT 'pending',
  "order_status" varchar(20) NOT NULL DEFAULT 'created',
  "delivery_address" text,
  "notes" text,
  "delivered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "orders_order_number_unique" UNIQUE ("order_number"),
  CONSTRAINT "orders_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict,
  CONSTRAINT "orders_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "orders_driver_id_fk" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE set null,
  CONSTRAINT "orders_payment_method_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_customer_id" ON "orders" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_seller_id" ON "orders" ("seller_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_driver_id" ON "orders" ("driver_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_payment_method_id" ON "orders" ("payment_method_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_order_status" ON "orders" ("order_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_payment_status" ON "orders" ("payment_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_created_at" ON "orders" ("created_at");
--> statement-breakpoint

-- 5. HISTORIAL DE ESTADOS
CREATE TABLE IF NOT EXISTS "order_status_history" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "changed_by" integer NOT NULL,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "order_status_history_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade,
  CONSTRAINT "order_status_history_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_status_history_order_id" ON "order_status_history" ("order_id");
--> statement-breakpoint

-- 6. COMUNICACIONES
CREATE TABLE IF NOT EXISTS "order_communications" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL,
  "sender_id" integer NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "order_communications_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade,
  CONSTRAINT "order_communications_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_communications_order_id" ON "order_communications" ("order_id");
--> statement-breakpoint

-- 7. NOTIFICACIONES
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "data" jsonb DEFAULT '{}',
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread" ON "notifications" ("user_id", "is_read", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications" ("created_at");
--> statement-breakpoint

-- 8. AUDITORÍA
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "action" varchar(50) NOT NULL,
  "metadata" jsonb DEFAULT '{}',
  "ip_address" varchar(45),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "audit_log_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_user_id" ON "audit_log" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_created_at" ON "audit_log" ("created_at");
--> statement-breakpoint

-- 9. SETTINGS
CREATE TABLE IF NOT EXISTS "settings" (
  "id" serial PRIMARY KEY,
  "key" varchar(255) NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_key_unique" ON "settings" ("key");
--> statement-breakpoint

-- 10. AVATARS DE USUARIO
CREATE TABLE IF NOT EXISTS "user_avatars" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "url" varchar(500) NOT NULL,
  "is_active" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_avatars_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_avatars_user_id" ON "user_avatars" ("user_id");
--> statement-breakpoint

-- 11. TOKENS DE RESET DE CONTRASEÑA
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "token" varchar(255) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "password_reset_tokens_token_unique" UNIQUE ("token"),
  CONSTRAINT "password_reset_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_token" ON "password_reset_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id");
--> statement-breakpoint

-- 12. TOKENS DE VERIFICACIÓN DE EMAIL
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE ("token_hash"),
  CONSTRAINT "email_verification_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verification_tokens_user_id" ON "email_verification_tokens" ("user_id");
--> statement-breakpoint

-- 13. SESIONES (refresh token rotation)
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "family_id" varchar(64) NOT NULL,
  "refresh_hash" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "user_agent" varchar(500),
  "ip" varchar(64),
  CONSTRAINT "sessions_refresh_hash_unique" UNIQUE ("refresh_hash"),
  CONSTRAINT "sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_family_id" ON "sessions" ("family_id");
--> statement-breakpoint

-- 14. HISTORIAL DE CONTRASEÑAS
CREATE TABLE IF NOT EXISTS "password_history" (
  "id" serial PRIMARY KEY,
  "password_sha256" varchar(64) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "password_history_password_sha256_unique" UNIQUE ("password_sha256")
);