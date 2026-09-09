-- Migration: Create Webhook Event Log Table
-- Version: 07
-- Phase 4: Webhook Implementation

-- Create webhook_event_log table
CREATE TABLE IF NOT EXISTS webhook_event_log (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT,
    signature VARCHAR(255),
    source_ip VARCHAR(45),
    related_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    processing_success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    processing_attempts INTEGER NOT NULL DEFAULT 0,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_event_id ON webhook_event_log(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_event_type ON webhook_event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_received_at ON webhook_event_log(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_processing_success ON webhook_event_log(processing_success);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_related_order_id ON webhook_event_log(related_order_id) WHERE related_order_id IS NOT NULL;

-- Add composite index for finding failed events to retry
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_failed_retry ON webhook_event_log(processing_success, processing_attempts, received_at)
    WHERE processing_success = false AND processing_attempts < 5;

-- Add comments for documentation
COMMENT ON TABLE webhook_event_log IS 'Log of received webhook events from Lightspeed for idempotency and audit';
COMMENT ON COLUMN webhook_event_log.event_id IS 'Unique identifier from Lightspeed to prevent duplicate processing';
COMMENT ON COLUMN webhook_event_log.event_type IS 'Type of webhook event (e.g., payment.completed, order.updated)';
COMMENT ON COLUMN webhook_event_log.payload IS 'Raw JSON payload for audit/debugging purposes';
COMMENT ON COLUMN webhook_event_log.signature IS 'HMAC-SHA256 signature from webhook header for verification';
COMMENT ON COLUMN webhook_event_log.source_ip IS 'IP address of the webhook sender for security validation';
COMMENT ON COLUMN webhook_event_log.related_order_id IS 'Related order ID if the webhook pertains to a specific order';
COMMENT ON COLUMN webhook_event_log.processing_success IS 'Whether the event was processed successfully';
COMMENT ON COLUMN webhook_event_log.error_message IS 'Error message if processing failed';
COMMENT ON COLUMN webhook_event_log.processing_attempts IS 'Number of processing attempts (for retry logic)';
COMMENT ON COLUMN webhook_event_log.received_at IS 'Timestamp when the webhook was received';
COMMENT ON COLUMN webhook_event_log.processed_at IS 'Timestamp when the webhook was processed (null if pending/failed)';
