-- Migration 0011: Branch fields for customers
-- contactPerson, isBillingAddress, isDeliveryAddress

DO $$
BEGIN
  ALTER TABLE "customers"
    ADD COLUMN IF NOT EXISTS "contact_person" varchar(255),
    ADD COLUMN IF NOT EXISTS "is_billing_address" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "is_delivery_address" boolean NOT NULL DEFAULT false;
END $$;