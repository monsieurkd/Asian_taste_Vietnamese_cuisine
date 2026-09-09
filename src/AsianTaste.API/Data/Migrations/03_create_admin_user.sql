-- ============================================
-- Default Admin User
-- Password: Admin123!
-- ============================================

INSERT INTO admin_users (username, password_hash, email, role, is_active)
VALUES (
    'admin',
    '$2a$10$xFAiwen5cOsYNSFPv2Mm3exWEa3H2UcOuLTD.1Y5XxF4iCQK5HlNW',
    'admin@asiantaste.ca',
    'Admin',
    TRUE
)
ON CONFLICT (username) DO NOTHING;
