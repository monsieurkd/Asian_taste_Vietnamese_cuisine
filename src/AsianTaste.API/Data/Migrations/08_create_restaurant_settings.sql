-- Migration 08: Create restaurant_settings table
-- This migration stores configuration settings for the restaurant

-- Create restaurant_settings table
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by key
CREATE INDEX IF NOT EXISTS idx_restaurant_settings_key ON restaurant_settings(key);
CREATE INDEX IF NOT EXISTS idx_restaurant_settings_category ON restaurant_settings(category);

-- Seed default settings
INSERT INTO restaurant_settings (key, value, description, category) VALUES
    ('restaurant_name', 'Asian Taste Vietnamese Cuisine', 'Restaurant display name', 'general'),
    ('phone', '(555) 123-4567', 'Contact phone number', 'general'),
    ('email', 'contact@asiantaste.com', 'Contact email address', 'general'),
    ('address', '123 Main Street, City, State 12345', 'Restaurant physical address', 'general'),
    ('pickup_minutes', '15', 'Default estimated pickup time in minutes', 'general'),
    ('order_confirmation_message', 'Thank you for your order! We will have it ready soon.', 'Message shown on order confirmation', 'general'),
    ('timezone', 'America/New_York', 'Restaurant timezone for order scheduling', 'general'),
    ('currency_symbol', '$', 'Currency symbol for display', 'general'),
    ('tax_rate', '0.08', 'Tax rate as decimal (e.g., 0.08 = 8%)', 'general'),
    ('enable_online_orders', 'true', 'Enable online ordering', 'general'),
    ('max_days_ahead', '7', 'Maximum days ahead for future orders', 'general')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;
