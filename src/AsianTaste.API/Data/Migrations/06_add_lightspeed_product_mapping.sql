-- Migration: Add Lightspeed Product Mapping
-- Version: 06
-- Phase 3: Order Sync Integration
-- This migration adds fields to support syncing order items with Lightspeed products

-- Add Lightspeed product ID to order_items table
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS lightspeed_product_id INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN order_items.lightspeed_product_id IS 'Product ID in Lightspeed POS for order line item mapping';

-- Add Lightspeed product ID to menu_items table for future product sync
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS lightspeed_product_id INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN menu_items.lightspeed_product_id IS 'Product ID in Lightspeed POS for menu item sync';

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_order_items_lightspeed_product_id
ON order_items(lightspeed_product_id)
WHERE lightspeed_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_lightspeed_product_id
ON menu_items(lightspeed_product_id)
WHERE lightspeed_product_id IS NOT NULL;
