-- Migration: Add Payment and Lightspeed Sync Fields to Orders Table
-- Version: 05
-- Phase 2: Payment Core Services

-- Create payment_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM (
            'Pending',
            'Processing',
            'Succeeded',
            'Failed',
            'Refunded',
            'PartiallyRefunded',
            'RequiresAction',
            'Canceled'
        );
    END IF;
END
$$;

-- Create sync_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN
        CREATE TYPE sync_status AS ENUM (
            'NotSynced',
            'Pending',
            'Synced',
            'Failed',
            'InProgress'
        );
    END IF;
END
$$;

-- Add payment columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_status payment_status DEFAULT 'Pending',
ADD COLUMN IF NOT EXISTS external_payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Add Lightspeed sync columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS lightspeed_order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS lightspeed_sale_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS lightspeed_sync_status sync_status DEFAULT 'NotSynced',
ADD COLUMN IF NOT EXISTS synced_to_lightspeed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_lightspeed_sync_status ON orders(lightspeed_sync_status);
CREATE INDEX IF NOT EXISTS idx_orders_external_payment_id ON orders(external_payment_id) WHERE external_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_lightspeed_order_id ON orders(lightspeed_order_id) WHERE lightspeed_order_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN orders.payment_status IS 'Current status of payment processing';
COMMENT ON COLUMN orders.external_payment_id IS 'Payment gateway transaction ID (Stripe, Lightspeed, etc.)';
COMMENT ON COLUMN orders.external_transaction_id IS 'External sale/transaction ID for completed payments';
COMMENT ON COLUMN orders.paid_amount IS 'Amount actually paid (may differ from total for partial payments/refunds)';
COMMENT ON COLUMN orders.paid_at IS 'Timestamp when payment was completed';
COMMENT ON COLUMN orders.idempotency_key IS 'Unique key to prevent duplicate payment processing';
COMMENT ON COLUMN orders.lightspeed_order_id IS 'Order ID in Lightspeed POS system';
COMMENT ON COLUMN orders.lightspeed_sale_id IS 'Sale/transaction ID in Lightspeed POS system';
COMMENT ON COLUMN orders.lightspeed_sync_status IS 'Synchronization status with Lightspeed POS';
COMMENT ON COLUMN orders.synced_to_lightspeed_at IS 'Timestamp when order was synced to Lightspeed';
COMMENT ON COLUMN orders.sync_error IS 'Error message if sync to Lightspeed failed';
