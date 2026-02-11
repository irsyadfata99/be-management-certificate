-- =============================================
-- Table: users
-- Description: User management table with role-based access control
-- Created: 2026-02-11
-- =============================================

-- Drop table if exists (optional - uncomment if needed)
-- DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT check_role CHECK (role IN ('superAdmin', 'admin', 'user')),
    CONSTRAINT check_username_length CHECK (LENGTH(username) >= 3)
);

-- Create indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- Add trigger for automatic updatedAt
CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Add comments
COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON COLUMN users.id IS 'Primary key - auto incrementing';
COMMENT ON COLUMN users.username IS 'Unique username for login (minimum 3 characters)';
COMMENT ON COLUMN users.password IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role: superAdmin, admin, or user';
COMMENT ON COLUMN users."createdAt" IS 'Timestamp when user was created';
COMMENT ON COLUMN users."updatedAt" IS 'Timestamp when user was last updated';