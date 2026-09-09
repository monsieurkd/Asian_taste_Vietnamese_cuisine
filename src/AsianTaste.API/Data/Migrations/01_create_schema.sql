-- ============================================
-- Asian Taste Database Schema
-- Date: 2026-01-31
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- Create order_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE order_type AS ENUM ('Pickup', 'DineIn');
    END IF;
END
$$;

-- Create order_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled');
    END IF;
END
$$;

-- Create payment_method enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('Card', 'Cash');
    END IF;
END
$$;

-- ============================================
-- TABLES
-- ============================================

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
    image_url VARCHAR(500),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    is_gluten_free BOOLEAN NOT NULL DEFAULT FALSE,
    is_vegetarian BOOLEAN NOT NULL DEFAULT FALSE,
    is_vegan BOOLEAN NOT NULL DEFAULT FALSE,
    spicy_level INT NOT NULL DEFAULT 0 CHECK (spicy_level BETWEEN 0 AND 5),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Modifier Groups
CREATE TABLE IF NOT EXISTS modifier_groups (
    id SERIAL PRIMARY KEY,
    menu_item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    min_select INT NOT NULL DEFAULT 1 CHECK (min_select >= 0),
    max_select INT NOT NULL DEFAULT 1 CHECK (max_select >= 1),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Modifiers
CREATE TABLE IF NOT EXISTS modifiers (
    id SERIAL PRIMARY KEY,
    modifier_group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price_adjustment DECIMAL(10, 2) NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_guest BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_order_at TIMESTAMP
);

-- Customer Payment Methods
CREATE TABLE IF NOT EXISTS customer_payment_methods (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payment_method_token VARCHAR(255) NOT NULL,
    card_last_four VARCHAR(4),
    card_brand VARCHAR(50),
    expiry_month INT,
    expiry_year INT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'Admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    last_login_at TIMESTAMP
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT REFERENCES customers(id),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    order_type order_type NOT NULL DEFAULT 'Pickup',
    requested_time TIMESTAMP NOT NULL DEFAULT NOW(),
    status order_status NOT NULL DEFAULT 'Pending',
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    payment_method payment_method NOT NULL DEFAULT 'Card',
    payment_intent_id VARCHAR(255),
    payment_failure_reason TEXT,
    square_payment_id VARCHAR(255),
    square_order_id VARCHAR(255),
    third_party_reference VARCHAR(255),
    lightspeed_sent_at TIMESTAMP,
    email_confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INT NOT NULL REFERENCES menu_items(id),
    menu_item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0),
    special_instructions TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Order Item Modifiers
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id INT NOT NULL REFERENCES modifiers(id),
    modifier_name VARCHAR(255) NOT NULL,
    price_adjustment DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Order Attempts (for tracking failed orders)
CREATE TABLE IF NOT EXISTS order_attempts (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    cart_snapshot JSONB NOT NULL,
    attempt_status VARCHAR(50) NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(is_available) WHERE is_available = TRUE;
CREATE INDEX IF NOT EXISTS idx_menu_items_is_popular ON menu_items(is_popular) WHERE is_popular = TRUE;
CREATE INDEX IF NOT EXISTS idx_menu_items_name ON menu_items USING GIN(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);

CREATE INDEX IF NOT EXISTS idx_payment_methods_customer ON customer_payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON customer_payment_methods(customer_id) WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_order_item_id ON order_item_modifiers(order_item_id);

CREATE INDEX IF NOT EXISTS idx_order_attempts_customer ON order_attempts(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_attempts_created_at ON order_attempts(created_at DESC);
