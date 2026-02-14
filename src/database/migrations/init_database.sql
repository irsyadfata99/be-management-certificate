-- =============================================
-- MIGRATION: Create All Tables for Test Database
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: branches
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_head_branch BOOLEAN DEFAULT true,
    parent_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: users
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superAdmin', 'admin', 'teacher')),
    full_name VARCHAR(100),
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: divisions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS divisions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: sub_divisions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sub_divisions (
    id SERIAL PRIMARY KEY,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(division_id, name)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: modules
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    sub_div_id INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: teacher_branches
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS teacher_branches (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, branch_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: teacher_divisions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS teacher_divisions (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, division_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificates
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    head_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    current_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status VARCHAR(20) DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'printed', 'migrated')),
    medal_included BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: students
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificate_prints
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificate_prints (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    certificate_number VARCHAR(50) NOT NULL,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    ptc_date DATE NOT NULL,
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(certificate_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificate_reservations
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificate_reservations (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'released', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(certificate_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificate_migrations
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificate_migrations (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    from_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    migrated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificate_logs
-- NOTE: "createdAt" pakai camelCase karena CertificateLogModel query pakai
--       cl."createdAt" — satu-satunya exception dari snake_case
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificate_logs (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(20),
    from_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: certificate_pdfs
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificate_pdfs (
    id SERIAL PRIMARY KEY,
    print_id INTEGER NOT NULL REFERENCES certificate_prints(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(500) NOT NULL,
    filesize INTEGER,
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(print_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: refresh_tokens
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: login_attempts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: database_backups
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS database_backups (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(500) NOT NULL,
    filesize BIGINT,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_parent_id ON branches(parent_id);

CREATE INDEX IF NOT EXISTS idx_certificates_number ON certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_head_branch_id ON certificates(head_branch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_current_branch_id ON certificates(current_branch_id);

CREATE INDEX IF NOT EXISTS idx_certificate_prints_student_id ON certificate_prints(student_id);
CREATE INDEX IF NOT EXISTS idx_certificate_prints_teacher_id ON certificate_prints(teacher_id);
CREATE INDEX IF NOT EXISTS idx_certificate_prints_branch_id ON certificate_prints(branch_id);

CREATE INDEX IF NOT EXISTS idx_certificate_reservations_teacher_id ON certificate_reservations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_certificate_reservations_expires_at ON certificate_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_certificate_reservations_status ON certificate_reservations(status);

CREATE INDEX IF NOT EXISTS idx_certificate_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificate_logs_action_type ON certificate_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_certificate_logs_created_at ON certificate_logs("createdAt");

CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked_until ON login_attempts(blocked_until);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED SUPERADMIN
-- Password: admin123
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO users (username, password, role, full_name)
VALUES (
    'gem',
    '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
    'superAdmin',
    'Test SuperAdmin'
)
ON CONFLICT (username) DO NOTHING;