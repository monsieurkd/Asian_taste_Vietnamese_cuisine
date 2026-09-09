-- ============================================
-- Lightspeed Integration Tables
-- Date: 2025-02-09
-- Phase 1: Authentication Setup
-- ============================================

-- Lightspeed OAuth Tokens
CREATE TABLE IF NOT EXISTS lightspeed_tokens (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    restaurant_id INT,
    token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer',
    scope TEXT
);

-- Index for active token lookups
CREATE INDEX IF NOT EXISTS idx_lightspeed_tokens_active ON lightspeed_tokens(is_active, restaurant_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lightspeed_tokens_account ON lightspeed_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_lightspeed_tokens_restaurant ON lightspeed_tokens(restaurant_id) WHERE restaurant_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE lightspeed_tokens IS 'Stores OAuth tokens for Lightspeed K-Series API integration. Sensitive data is encrypted at rest.';
COMMENT ON COLUMN lightspeed_tokens.access_token IS 'Encrypted OAuth access token for API calls';
COMMENT ON COLUMN lightspeed_tokens.refresh_token IS 'Encrypted OAuth refresh token for obtaining new access tokens';
COMMENT ON COLUMN lightspeed_tokens.expires_at IS 'Token expiration time (UTC)';
COMMENT ON COLUMN lightspeed_tokens.is_active IS 'Whether this token is currently active for use';
COMMENT ON COLUMN lightspeed_tokens.restaurant_id IS 'Optional: Associate with a specific restaurant location for multi-tenant setups';
