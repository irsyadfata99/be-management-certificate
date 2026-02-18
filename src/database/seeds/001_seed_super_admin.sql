-- =============================================
-- Seed: Default Super Admin User
-- Username: gem
-- Password: admin123
-- Created: 2026-02-11
-- =============================================

-- Insert default super admin user
-- Password: #Admin123 (hashed with bcrypt, rounds=10)
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES (
    'gem',
    '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu',
    'superAdmin',
    'Super Administrator',
    NULL,
    true
)
ON CONFLICT (username) DO UPDATE
    SET password  = EXCLUDED.password,
        role      = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        is_active = EXCLUDED.is_active;