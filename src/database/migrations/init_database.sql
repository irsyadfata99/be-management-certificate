-- =============================================
-- init_database.sql
-- Production Database Initialization
-- Certificate Management System - Backend
-- =============================================
-- Run order:
--   1. init_database.sql     ← this file (run ONCE)
--   2. seed_development.sql  ← for development/testing only
-- =============================================
-- Superadmin credentials (CHANGE AFTER FIRST LOGIN):
--   Username : gem
--   Password : admin123
-- =============================================

-- ─── DROP TABLES (for clean re-initialization) ────────────────────────────

DROP TABLE IF EXISTS medal_stock_logs           CASCADE;
DROP TABLE IF EXISTS branch_medal_stock         CASCADE;
DROP TABLE IF EXISTS database_backups           CASCADE;
DROP TABLE IF EXISTS certificate_pdfs           CASCADE;
DROP TABLE IF EXISTS certificate_logs           CASCADE;
DROP TABLE IF EXISTS certificate_prints         CASCADE;
DROP TABLE IF EXISTS certificate_reservations   CASCADE;
DROP TABLE IF EXISTS certificate_migrations     CASCADE;
DROP TABLE IF EXISTS certificates               CASCADE;
DROP TABLE IF EXISTS students                   CASCADE;
DROP TABLE IF EXISTS teacher_divisions          CASCADE;
DROP TABLE IF EXISTS teacher_branches           CASCADE;
DROP TABLE IF EXISTS modules                    CASCADE;
DROP TABLE IF EXISTS sub_divisions              CASCADE;
DROP TABLE IF EXISTS divisions                  CASCADE;
DROP TABLE IF EXISTS refresh_tokens             CASCADE;
DROP TABLE IF EXISTS login_attempts             CASCADE;
DROP TABLE IF EXISTS users                      CASCADE;
DROP TABLE IF EXISTS branches                   CASCADE;

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- needed for ILIKE performance on students


-- ─── TABLE: branches ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
    id             SERIAL PRIMARY KEY,
    code           VARCHAR(10)  NOT NULL,
    name           VARCHAR(100) NOT NULL,
    is_head_branch BOOLEAN      NOT NULL DEFAULT false,
    parent_id      INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT branches_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_branches_parent_id ON branches(parent_id);
CREATE INDEX IF NOT EXISTS idx_branches_is_active  ON branches(is_active);


-- ─── TABLE: users ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL,
    password     VARCHAR(255) NOT NULL,
    role         VARCHAR(20)  NOT NULL CHECK (role IN ('superAdmin', 'admin', 'teacher')),
    full_name    VARCHAR(100) NOT NULL DEFAULT '',
    branch_id    INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT users_username_key UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);


-- ─── TABLE: login_attempts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(100) NOT NULL,
    attempt_count    INTEGER      NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_attempt_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    blocked_until    TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT login_attempts_username_key UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked_until ON login_attempts(blocked_until);


-- ─── TABLE: refresh_tokens ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    is_revoked  BOOLEAN     NOT NULL DEFAULT false,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);


-- ─── TABLE: divisions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS divisions (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    created_by INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT divisions_name_created_by_key UNIQUE (name, created_by)
);

CREATE INDEX IF NOT EXISTS idx_divisions_created_by ON divisions(created_by);
CREATE INDEX IF NOT EXISTS idx_divisions_is_active  ON divisions(is_active);


-- ─── TABLE: sub_divisions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_divisions (
    id          SERIAL PRIMARY KEY,
    division_id INTEGER      NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    age_min     SMALLINT,
    age_max     SMALLINT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT sub_divisions_division_name_key UNIQUE (division_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sub_divisions_division_id ON sub_divisions(division_id);


-- ─── TABLE: modules ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modules (
    id          SERIAL PRIMARY KEY,
    module_code VARCHAR(50)  NOT NULL,
    name        VARCHAR(150) NOT NULL,
    division_id INTEGER      NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    sub_div_id  INTEGER      REFERENCES sub_divisions(id) ON DELETE SET NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT modules_module_code_key UNIQUE (module_code)
);

CREATE INDEX IF NOT EXISTS idx_modules_division_id ON modules(division_id);
CREATE INDEX IF NOT EXISTS idx_modules_sub_div_id  ON modules(sub_div_id);
CREATE INDEX IF NOT EXISTS idx_modules_created_by  ON modules(created_by);


-- ─── TABLE: teacher_branches ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_branches (
    id         SERIAL PRIMARY KEY,
    teacher_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id  INTEGER     NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT teacher_branches_teacher_branch_key UNIQUE (teacher_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_branches_teacher_id ON teacher_branches(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_branches_branch_id  ON teacher_branches(branch_id);


-- ─── TABLE: teacher_divisions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_divisions (
    id          SERIAL PRIMARY KEY,
    teacher_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division_id INTEGER     NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT teacher_divisions_teacher_division_key UNIQUE (teacher_id, division_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_divisions_teacher_id  ON teacher_divisions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_divisions_division_id ON teacher_divisions(division_id);


-- ─── TABLE: certificates ──────────────────────────────────────────────────
-- FIX: Added 'migrated' to status CHECK — was missing from original schema
--      but referenced in getStockCount() query in certificateModel.js

CREATE TABLE IF NOT EXISTS certificates (
    id                 SERIAL PRIMARY KEY,
    certificate_number VARCHAR(50)  NOT NULL,
    head_branch_id     INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    current_branch_id  INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status             VARCHAR(20)  NOT NULL DEFAULT 'in_stock'
                           CHECK (status IN ('in_stock', 'reserved', 'printed', 'migrated')),
    medal_included     BOOLEAN      NOT NULL DEFAULT false,
    created_by         INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT certificates_number_key UNIQUE (certificate_number)
);

CREATE INDEX IF NOT EXISTS idx_certificates_head_branch_id    ON certificates(head_branch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_current_branch_id ON certificates(current_branch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status            ON certificates(status);


-- ─── TABLE: certificate_reservations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_reservations (
    id             SERIAL PRIMARY KEY,
    certificate_id INTEGER     NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    teacher_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reserved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'released')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_reservations_certificate_id ON certificate_reservations(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_reservations_teacher_id     ON certificate_reservations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cert_reservations_status         ON certificate_reservations(status);
CREATE INDEX IF NOT EXISTS idx_cert_reservations_expires_at     ON certificate_reservations(expires_at);


-- ─── TABLE: certificate_migrations ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_migrations (
    id             SERIAL PRIMARY KEY,
    certificate_id INTEGER     NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    from_branch_id INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id   INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    migrated_by    INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    migrated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_migrations_certificate_id ON certificate_migrations(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_migrations_migrated_by    ON certificate_migrations(migrated_by);
CREATE INDEX IF NOT EXISTS idx_cert_migrations_migrated_at    ON certificate_migrations(migrated_at);


-- ─── TABLE: students ──────────────────────────────────────────────────────
-- FIX: Added UNIQUE index on LOWER(name), head_branch_id
--      Required by studentModel.js ON CONFLICT (LOWER(name), head_branch_id)
--      Without this, createOrGetStudent() throws PostgreSQL error on every call

CREATE TABLE IF NOT EXISTS students (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    head_branch_id INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_head_branch_id ON students(head_branch_id);
CREATE INDEX IF NOT EXISTS idx_students_is_active      ON students(is_active);

-- CRITICAL: This functional unique index is required for ON CONFLICT to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_name_branch_unique
    ON students (LOWER(name), head_branch_id);

-- GIN index for ILIKE search performance (requires pg_trgm extension)
CREATE INDEX IF NOT EXISTS idx_students_name_trgm
    ON students USING GIN (name gin_trgm_ops);


-- ─── TABLE: certificate_prints ────────────────────────────────────────────
-- FIX: Added is_reprint column directly here (was only in migration 01)
--      Needed by CertificatePrintModel.create() and certificateTeacherService

CREATE TABLE IF NOT EXISTS certificate_prints (
    id                 SERIAL PRIMARY KEY,
    certificate_id     INTEGER      NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    certificate_number VARCHAR(50)  NOT NULL,
    student_id         INTEGER      REFERENCES students(id) ON DELETE SET NULL,
    student_name       VARCHAR(150) NOT NULL,
    module_id          INTEGER      REFERENCES modules(id) ON DELETE SET NULL,
    teacher_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id          INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    ptc_date           DATE         NOT NULL,
    is_reprint         BOOLEAN      NOT NULL DEFAULT false,
    printed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT certificate_prints_certificate_id_key UNIQUE (certificate_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_prints_certificate_id ON certificate_prints(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_student_id     ON certificate_prints(student_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_teacher_id     ON certificate_prints(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_branch_id      ON certificate_prints(branch_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_ptc_date       ON certificate_prints(ptc_date);
CREATE INDEX IF NOT EXISTS idx_cert_prints_printed_at     ON certificate_prints(printed_at);
CREATE INDEX IF NOT EXISTS idx_cert_prints_is_reprint     ON certificate_prints(is_reprint);


-- ─── TABLE: certificate_pdfs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_pdfs (
    id                   SERIAL PRIMARY KEY,
    certificate_print_id INTEGER      NOT NULL REFERENCES certificate_prints(id) ON DELETE CASCADE,
    uploaded_by          INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename             VARCHAR(255) NOT NULL,
    original_filename    VARCHAR(255) NOT NULL,
    file_path            VARCHAR(500) NOT NULL,
    file_size            INTEGER      NOT NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT certificate_pdfs_print_id_key UNIQUE (certificate_print_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_pdfs_print_id    ON certificate_pdfs(certificate_print_id);
CREATE INDEX IF NOT EXISTS idx_cert_pdfs_uploaded_by ON certificate_pdfs(uploaded_by);


-- ─── TABLE: certificate_logs ──────────────────────────────────────────────
-- FIX: Added 'reprint' to action_type CHECK
--      Was only added in migration 01, causing insert failures on fresh deploy

CREATE TABLE IF NOT EXISTS certificate_logs (
    id             SERIAL PRIMARY KEY,
    certificate_id INTEGER      REFERENCES certificates(id) ON DELETE SET NULL,
    action_type    VARCHAR(30)  NOT NULL
                       CHECK (action_type IN ('bulk_create', 'migrate', 'reserve', 'release', 'print', 'reprint')),
    actor_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role     VARCHAR(20)  NOT NULL,
    from_branch_id INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id   INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    metadata       JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_logs_actor_id       ON certificate_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_cert_logs_action_type    ON certificate_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_cert_logs_created_at     ON certificate_logs(created_at);


-- ─── TABLE: branch_medal_stock ────────────────────────────────────────────
-- FIX: Moved from migration 01 to init — required at startup by medal endpoints

CREATE TABLE IF NOT EXISTS branch_medal_stock (
    id         SERIAL PRIMARY KEY,
    branch_id  INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT branch_medal_stock_branch_id_key UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_medal_stock_branch_id ON branch_medal_stock(branch_id);


-- ─── TABLE: medal_stock_logs ──────────────────────────────────────────────
-- FIX: Moved from migration 01 to init — required at startup by medal endpoints

CREATE TABLE IF NOT EXISTS medal_stock_logs (
    id           SERIAL PRIMARY KEY,
    branch_id    INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    action_type  VARCHAR(20) NOT NULL
                     CHECK (action_type IN ('add', 'migrate_in', 'migrate_out', 'consume')),
    quantity     INTEGER     NOT NULL CHECK (quantity > 0),
    actor_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reference_id INTEGER,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medal_logs_branch_id   ON medal_stock_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_medal_logs_actor_id    ON medal_stock_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_medal_logs_action_type ON medal_stock_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_medal_logs_created_at  ON medal_stock_logs(created_at);


-- ─── TABLE: database_backups ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS database_backups (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL,
    file_path   VARCHAR(500) NOT NULL,
    file_size   BIGINT       NOT NULL,
    created_by  INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id   INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_db_backups_created_by ON database_backups(created_by);
CREATE INDEX IF NOT EXISTS idx_db_backups_branch_id  ON database_backups(branch_id);
CREATE INDEX IF NOT EXISTS idx_db_backups_created_at ON database_backups(created_at);


-- ─── SEED: SUPERADMIN ─────────────────────────────────────────────────────
-- Password: admin123 (bcrypt cost 10, Node.js compatible)
-- ⚠️  GANTI PASSWORD SETELAH LOGIN PERTAMA!

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


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'branches', 'users', 'login_attempts', 'refresh_tokens',
        'divisions', 'sub_divisions', 'modules',
        'teacher_branches', 'teacher_divisions',
        'certificates', 'certificate_reservations', 'certificate_migrations',
        'students', 'certificate_prints', 'certificate_pdfs',
        'certificate_logs', 'database_backups',
        'branch_medal_stock', 'medal_stock_logs'
    ];
    v_table  TEXT;
    v_exists BOOLEAN;
    v_all_ok BOOLEAN := true;
    v_super  RECORD;
    v_idx_students_unique BOOLEAN;
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '        DATABASE INITIALIZED SUCCESSFULLY          ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE 'TABLE STATUS:';
    FOREACH v_table IN ARRAY v_tables LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_table
        ) INTO v_exists;
        IF v_exists THEN
            RAISE NOTICE '  ✓ %', v_table;
        ELSE
            RAISE WARNING '  ✗ % — TABLE MISSING!', v_table;
            v_all_ok := false;
        END IF;
    END LOOP;

    -- Verify critical index for students ON CONFLICT
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'students'
          AND indexname  = 'idx_students_name_branch_unique'
    ) INTO v_idx_students_unique;

    IF NOT v_idx_students_unique THEN
        RAISE WARNING '  ✗ CRITICAL INDEX MISSING: idx_students_name_branch_unique';
        v_all_ok := false;
    ELSE
        RAISE NOTICE '  ✓ idx_students_name_branch_unique (required for ON CONFLICT)';
    END IF;

    SELECT id, username, role INTO v_super FROM users WHERE role = 'superAdmin' LIMIT 1;
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE 'SUPERADMIN:';
    RAISE NOTICE '  ID       : %', v_super.id;
    RAISE NOTICE '  Username : %', v_super.username;
    RAISE NOTICE '  Password : admin123 ← GANTI SETELAH LOGIN!';
    RAISE NOTICE '───────────────────────────────────────────────────';
    IF v_all_ok THEN
        RAISE NOTICE 'Semua % table berhasil dibuat.', array_length(v_tables, 1);
        RAISE NOTICE 'Untuk development → jalankan seed_development.sql';
    ELSE
        RAISE EXCEPTION 'Ada table atau index yang gagal dibuat. Periksa error di atas.';
    END IF;
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;