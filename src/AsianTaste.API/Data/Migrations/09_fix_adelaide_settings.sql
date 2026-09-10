-- Migration 09: Adelaide localisation + operating hours
-- Corrects US placeholder settings to Asian Taste's real Adelaide values, and
-- adds a proper operating-hours table (the previous settings had no hours model).
--
-- Idempotent: safe to re-run on an existing database.

-- ============================================
-- 1. Correct restaurant settings for Adelaide, SA
-- ============================================
-- Prices are GST-INCLUSIVE in Australia, so tax_rate is stored as the GST rate
-- (0.10) for reporting/back-calculation only. It must NOT be added on top of
-- menu prices at checkout.

INSERT INTO restaurant_settings (key, value, description, category) VALUES
    ('restaurant_name', 'Asian Taste Vietnamese Cuisine', 'Restaurant display name', 'general'),
    ('phone', '', 'Contact phone number', 'general'),
    ('email', 'orders@asiantaste.com.au', 'Contact email address', 'general'),
    ('address', '329 Henley Beach Rd, Brooklyn Park SA 5032', 'Restaurant physical address', 'general'),
    ('suburb', 'Brooklyn Park', 'Suburb', 'general'),
    ('state', 'SA', 'Australian state', 'general'),
    ('postcode', '5032', 'Postcode', 'general'),
    ('country', 'AU', 'ISO country code', 'general'),
    ('pickup_minutes', '15', 'Default estimated pickup time in minutes', 'general'),
    ('order_confirmation_message', 'Thank you for your order! We will have it ready soon.', 'Message shown on order confirmation', 'general'),
    ('timezone', 'Australia/Adelaide', 'Restaurant timezone for order scheduling (IANA)', 'general'),
    ('currency_code', 'AUD', 'ISO 4217 currency code', 'general'),
    ('currency_symbol', '$', 'Currency symbol for display', 'general'),
    ('currency_locale', 'en-AU', 'Locale used to format currency', 'general'),
    ('tax_rate', '0.10', 'Australian GST rate (prices are GST-inclusive; do not add on top)', 'general'),
    ('prices_include_tax', 'true', 'Whether displayed menu prices already include GST', 'general'),
    ('tax_label', 'GST (included)', 'Label shown for the tax line on receipts', 'general'),
    ('enable_online_orders', 'true', 'Enable online ordering', 'general'),
    ('enable_pickup', 'true', 'Enable pickup ordering', 'general'),
    ('enable_delivery', 'false', 'Enable delivery ordering (delivery not offered at launch)', 'general'),
    ('max_days_ahead', '7', 'Maximum days ahead for future orders', 'general')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Remove any stale US-style keys that are no longer used.
DELETE FROM restaurant_settings
WHERE key IN ('tax_rate_inclusive', 'state_code');

-- ============================================
-- 2. Operating hours
-- ============================================
-- Trading hours (Asia/Adelaide local time):
--   Sunday            10:00 - 20:50
--   Monday - Tuesday  10:00 - 14:30
--   Wednesday-Saturday 10:00 - 20:50
-- day_of_week uses ISO-8601 numbering: 1 = Monday ... 7 = Sunday.

CREATE TABLE IF NOT EXISTS operating_hours (
    id SERIAL PRIMARY KEY,
    day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week BETWEEN 1 AND 7),
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operating_hours_day ON operating_hours(day_of_week);

INSERT INTO operating_hours (day_of_week, open_time, close_time, is_closed) VALUES
    (1, '10:00', '14:30', FALSE),  -- Monday
    (2, '10:00', '14:30', FALSE),  -- Tuesday
    (3, '10:00', '20:50', FALSE),  -- Wednesday
    (4, '10:00', '20:50', FALSE),  -- Thursday
    (5, '10:00', '20:50', FALSE),  -- Friday
    (6, '10:00', '20:50', FALSE),  -- Saturday
    (7, '10:00', '20:50', FALSE)   -- Sunday
ON CONFLICT (day_of_week) DO UPDATE SET
    open_time = EXCLUDED.open_time,
    close_time = EXCLUDED.close_time,
    is_closed = EXCLUDED.is_closed,
    updated_at = CURRENT_TIMESTAMP;
