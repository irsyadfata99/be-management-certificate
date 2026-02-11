-- =============================================
-- Migration: Update users table
-- Add branch_id column and teacher role
-- Created: 2026-02-11
-- =============================================

-- Add branch_id column to users
ALTER TABLE users
    ADD COLUMN branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;

-- Update role constraint to include teacher
ALTER TABLE users
    DROP CONSTRAINT check_role;

ALTER TABLE users
    ADD CONSTRAINT check_role CHECK (role IN ('superAdmin', 'admin', 'teacher'));

-- Index
CREATE INDEX idx_users_branch_id ON users(branch_id);
CREATE INDEX idx_users_role ON users(role);

COMMENT ON COLUMN users.branch_id IS 'Branch assignment: required for admin and teacher roles';