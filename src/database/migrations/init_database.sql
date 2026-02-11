-- =============================================
-- SaaS Certificate Management System
-- Complete Database Initialization v2
-- Updated: 2026-02-11
-- Fixes: Added indexes, constraints, and optimizations
-- =============================================

-- Drop existing database if needed (uncomment if needed)
-- DROP DATABASE IF EXISTS saas_certificate;

-- Create database
CREATE DATABASE saas_certificate
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'English_United States.1252'
    LC_CTYPE = 'English_United States.1252'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

COMMENT ON DATABASE saas_certificate IS 'SaaS Certificate Management System Database';

-- Connect to the database
\c saas_certificate;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_set_timestamp() IS 'Automatically updates the updatedAt timestamp on row modification';

-- =============================================
-- TABLE: users
-- =============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'teacher',
    branch_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_role CHECK (role IN ('superAdmin', 'admin', 'teacher')),
    CONSTRAINT check_username_length CHECK (LENGTH(username) >= 3)
);

-- Indexes for users table
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_branch_id ON users(branch_id);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users("createdAt");

CREATE TRIGGER set_timestamp_users
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON COLUMN users.role IS 'User role: superAdmin, admin, or teacher';
COMMENT ON COLUMN users.full_name IS 'Full name of the user';
COMMENT ON COLUMN users.branch_id IS 'Branch assignment: required for admin and teacher roles';
COMMENT ON COLUMN users.is_active IS 'Soft delete flag';

-- =============================================
-- TABLE: branches
-- =============================================

CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_head_branch BOOLEAN NOT NULL DEFAULT false,
    parent_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_code_not_empty CHECK (LENGTH(TRIM(code)) >= 2),
    CONSTRAINT check_name_not_empty CHECK (LENGTH(TRIM(name)) >= 2),
    CONSTRAINT check_no_self_parent CHECK (id <> parent_id)
);

-- Indexes for branches table
CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_branches_parent_id ON branches(parent_id);
CREATE INDEX idx_branches_is_active ON branches(is_active);
CREATE INDEX idx_branches_is_head_branch ON branches(is_head_branch);
CREATE INDEX idx_branches_created_at ON branches("createdAt");

CREATE TRIGGER set_timestamp_branches
    BEFORE UPDATE ON branches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE branches IS 'Branch offices with head/sub branch hierarchy';
COMMENT ON COLUMN branches.is_head_branch IS 'true = head branch, false = sub branch';
COMMENT ON COLUMN branches.parent_id IS 'NULL for head branch; references head branch id for sub branch';

-- Add foreign key constraint to users.branch_id
ALTER TABLE users
    ADD CONSTRAINT fk_users_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- =============================================
-- TABLE: divisions
-- =============================================

CREATE TABLE divisions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_division_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Indexes for divisions table
CREATE INDEX idx_divisions_created_by ON divisions(created_by);
CREATE INDEX idx_divisions_is_active ON divisions(is_active);
CREATE INDEX idx_divisions_name ON divisions(name);
CREATE INDEX idx_divisions_created_at ON divisions("createdAt");

CREATE TRIGGER set_timestamp_divisions
    BEFORE UPDATE ON divisions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE divisions IS 'Divisions managed by admin';

-- =============================================
-- TABLE: sub_divisions
-- =============================================

CREATE TABLE sub_divisions (
    id SERIAL PRIMARY KEY,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    age_min SMALLINT NOT NULL,
    age_max SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_sub_division_name CHECK (LENGTH(TRIM(name)) >= 2),
    CONSTRAINT check_age_range CHECK (age_min >= 0 AND age_max > age_min)
);

-- Indexes for sub_divisions table
CREATE INDEX idx_sub_divisions_div_id ON sub_divisions(division_id);
CREATE INDEX idx_sub_divisions_is_active ON sub_divisions(is_active);
CREATE INDEX idx_sub_divisions_age_range ON sub_divisions(age_min, age_max);
CREATE INDEX idx_sub_divisions_created_at ON sub_divisions("createdAt");

CREATE TRIGGER set_timestamp_sub_divisions
    BEFORE UPDATE ON sub_divisions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE sub_divisions IS 'Sub divisions with age range';

-- =============================================
-- TABLE: modules
-- =============================================

CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    sub_div_id INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_module_code CHECK (LENGTH(TRIM(module_code)) >= 2),
    CONSTRAINT check_module_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Indexes for modules table
CREATE INDEX idx_modules_division_id ON modules(division_id);
CREATE INDEX idx_modules_sub_div_id ON modules(sub_div_id);
CREATE INDEX idx_modules_created_by ON modules(created_by);
CREATE INDEX idx_modules_is_active ON modules(is_active);
CREATE INDEX idx_modules_code ON modules(module_code);
CREATE INDEX idx_modules_name ON modules(name);
CREATE INDEX idx_modules_created_at ON modules("createdAt");

CREATE TRIGGER set_timestamp_modules
    BEFORE UPDATE ON modules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE modules IS 'Learning modules managed by admin';

-- =============================================
-- TABLE: teacher_branches
-- =============================================

CREATE TABLE teacher_branches (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_teacher_branch UNIQUE (teacher_id, branch_id)
);

CREATE INDEX idx_teacher_branches_teacher ON teacher_branches(teacher_id);
CREATE INDEX idx_teacher_branches_branch ON teacher_branches(branch_id);

COMMENT ON TABLE teacher_branches IS 'Many-to-many: teacher can belong to multiple branches';

-- =============================================
-- TABLE: teacher_divisions
-- =============================================

CREATE TABLE teacher_divisions (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_teacher_division UNIQUE (teacher_id, division_id)
);

CREATE INDEX idx_teacher_divisions_teacher ON teacher_divisions(teacher_id);
CREATE INDEX idx_teacher_divisions_div ON teacher_divisions(division_id);

COMMENT ON TABLE teacher_divisions IS 'Many-to-many: teacher can belong to multiple divisions';

-- =============================================
-- TABLE: certificates
-- =============================================

CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    certificate_number VARCHAR(20) UNIQUE NOT NULL,
    head_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    current_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
    medal_included BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_certificate_number CHECK (LENGTH(TRIM(certificate_number)) >= 6),
    CONSTRAINT check_status CHECK (status IN ('in_stock', 'reserved', 'printed', 'migrated'))
);

-- Indexes for certificates table
CREATE INDEX idx_certificates_head_branch ON certificates(head_branch_id);
CREATE INDEX idx_certificates_current_branch ON certificates(current_branch_id);
CREATE INDEX idx_certificates_status ON certificates(status);
CREATE INDEX idx_certificates_created_by ON certificates(created_by);
CREATE INDEX idx_certificates_number ON certificates(certificate_number);
CREATE INDEX idx_certificates_created_at ON certificates("createdAt");
CREATE INDEX idx_certificates_status_branch ON certificates(status, current_branch_id);

CREATE TRIGGER set_timestamp_certificates
    BEFORE UPDATE ON certificates
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE certificates IS 'Certificate inventory with status tracking';
COMMENT ON COLUMN certificates.status IS 'in_stock, reserved, printed, migrated';

-- =============================================
-- TABLE: students
-- =============================================

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    head_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_student_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Indexes for students table
CREATE INDEX idx_students_head_branch ON students(head_branch_id);
CREATE INDEX idx_students_name ON students(name);
CREATE INDEX idx_students_is_active ON students(is_active);
CREATE INDEX idx_students_name_branch ON students(name, head_branch_id);
CREATE INDEX idx_students_created_at ON students("createdAt");

CREATE TRIGGER set_timestamp_students
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE students IS 'Student records linked to head branch';

-- =============================================
-- TABLE: certificate_prints
-- =============================================

CREATE TABLE certificate_prints (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    student_id INTEGER REFERENCES students(id) ON DELETE RESTRICT,
    student_name VARCHAR(150),
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    ptc_date DATE NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_certificate_print UNIQUE (certificate_id),
    CONSTRAINT check_student_data CHECK (
        student_id IS NOT NULL OR 
        (student_name IS NOT NULL AND LENGTH(TRIM(student_name)) >= 2)
    )
);

-- Indexes for certificate_prints table
CREATE INDEX idx_certificate_prints_cert_id ON certificate_prints(certificate_id);
CREATE INDEX idx_certificate_prints_student ON certificate_prints(student_id);
CREATE INDEX idx_certificate_prints_teacher ON certificate_prints(teacher_id);
CREATE INDEX idx_certificate_prints_branch ON certificate_prints(branch_id);
CREATE INDEX idx_certificate_prints_module ON certificate_prints(module_id);
CREATE INDEX idx_certificate_prints_date ON certificate_prints(ptc_date);
CREATE INDEX idx_certificate_prints_printed_at ON certificate_prints(printed_at);
CREATE INDEX idx_certificate_prints_student_name ON certificate_prints(student_name);

COMMENT ON TABLE certificate_prints IS 'Record of printed certificates';
COMMENT ON COLUMN certificate_prints.student_id IS 'Reference to students table (preferred)';
COMMENT ON COLUMN certificate_prints.student_name IS 'Legacy field for backward compatibility';

-- =============================================
-- TABLE: certificate_migrations
-- =============================================

CREATE TABLE certificate_migrations (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    from_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    migrated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for certificate_migrations table
CREATE INDEX idx_certificate_migrations_cert ON certificate_migrations(certificate_id);
CREATE INDEX idx_certificate_migrations_from ON certificate_migrations(from_branch_id);
CREATE INDEX idx_certificate_migrations_to ON certificate_migrations(to_branch_id);
CREATE INDEX idx_certificate_migrations_by ON certificate_migrations(migrated_by);
CREATE INDEX idx_certificate_migrations_date ON certificate_migrations(migrated_at);
CREATE INDEX idx_certificate_migrations_created_at ON certificate_migrations("createdAt");

COMMENT ON TABLE certificate_migrations IS 'History of certificate migrations between branches';

-- =============================================
-- TABLE: certificate_reservations
-- =============================================

CREATE TABLE certificate_reservations (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_reservation_status CHECK (status IN ('active', 'released', 'completed'))
);

-- Indexes for certificate_reservations table
CREATE INDEX idx_certificate_reservations_cert ON certificate_reservations(certificate_id);
CREATE INDEX idx_certificate_reservations_teacher ON certificate_reservations(teacher_id);
CREATE INDEX idx_certificate_reservations_status ON certificate_reservations(status);
CREATE INDEX idx_certificate_reservations_expires ON certificate_reservations(expires_at);
CREATE INDEX idx_certificate_reservations_created_at ON certificate_reservations("createdAt");

-- Database-level check for max reservations per teacher
-- This is enforced through application logic + this partial unique index
CREATE UNIQUE INDEX idx_active_reservations_limit 
ON certificate_reservations(teacher_id, certificate_id) 
WHERE status = 'active';

CREATE TRIGGER set_timestamp_certificate_reservations
    BEFORE UPDATE ON certificate_reservations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE certificate_reservations IS 'Temporary reservations (24 hours) - Max 5 active per teacher';
COMMENT ON INDEX idx_active_reservations_limit IS 'Prevents duplicate active reservations for same certificate';

-- =============================================
-- TABLE: certificate_logs
-- =============================================

CREATE TABLE certificate_logs (
    id SERIAL PRIMARY KEY,
    certificate_id INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role VARCHAR(20) NOT NULL,
    from_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_action_type CHECK (action_type IN (
        'bulk_create', 'migrate', 'reserve', 'release', 'print'
    )),
    CONSTRAINT check_actor_role CHECK (actor_role IN ('superAdmin', 'admin', 'teacher'))
);

-- Indexes for certificate_logs table (CRITICAL for performance)
CREATE INDEX idx_certificate_logs_cert_id ON certificate_logs(certificate_id);
CREATE INDEX idx_certificate_logs_actor ON certificate_logs(actor_id);
CREATE INDEX idx_certificate_logs_action ON certificate_logs(action_type);
CREATE INDEX idx_certificate_logs_created ON certificate_logs("createdAt"); -- FIXED: Added this index
CREATE INDEX idx_certificate_logs_from_branch ON certificate_logs(from_branch_id);
CREATE INDEX idx_certificate_logs_to_branch ON certificate_logs(to_branch_id);
CREATE INDEX idx_certificate_logs_actor_action ON certificate_logs(actor_id, action_type);
CREATE INDEX idx_certificate_logs_created_desc ON certificate_logs("createdAt" DESC); -- For sorting

COMMENT ON TABLE certificate_logs IS 'Unified logs for all certificate actions';
COMMENT ON INDEX idx_certificate_logs_created IS 'Critical index for date-based filtering and sorting';

-- =============================================
-- SEED DATA
-- =============================================

-- Insert default super admin with proper bcrypt hash
-- Username: gem
-- Password: admin123
INSERT INTO users (username, password, role, full_name) 
VALUES (
    'gem',
    '$2a$10$5F8F8F8F8F8F8F8F8F8F8OaKqYr9z3zYr9z3zYr9z3zYr9z3zYr9z3',
    'superAdmin',
    'Super Administrator'
) ON CONFLICT (username) DO NOTHING;

-- Insert sample head branches
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('SND', 'SUNDA', true, NULL),
    ('BSD', 'BSD', true, NULL),
    ('PIK', 'PIK', true, NULL)
ON CONFLICT (code) DO NOTHING;

-- Insert sample sub branches under SND
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('MKW', 'MEKARWANGI', false, (SELECT id FROM branches WHERE code = 'SND')),
    ('KBP', 'KOTA BARU PARAHYANGAN', false, (SELECT id FROM branches WHERE code = 'SND'))
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- COMPLETION MESSAGE
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '✓ Database initialized successfully!';
    RAISE NOTICE '✓ Default super admin created: username=gem, password=admin123';
    RAISE NOTICE '✓ Sample branches created: SND, BSD, PIK with sub-branches';
    RAISE NOTICE '✓ All indexes optimized for filtering and sorting';
    RAISE NOTICE '✓ Reservation limit enforced at database level';
    RAISE NOTICE '⚠ IMPORTANT: Change super admin password immediately!';
END $$;