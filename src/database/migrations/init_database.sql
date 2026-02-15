-- =============================================
-- init_database.sql (FIXED VERSION)
-- Dijalankan SEKALI setelah database dibuat
-- Membuat semua table, index, dan constraint
-- =============================================
-- Urutan eksekusi:
--   1. init_database.sql       ← file ini
--   2. 00_seed_data.sql        ← untuk testing
--   ATAU
--   2. 01_seed_super_admin.sql ← untuk production
-- =============================================

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


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
    full_name    VARCHAR(100) NOT NULL,
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
    id           SERIAL PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL,
    ip_address   VARCHAR(45),
    success      BOOLEAN      NOT NULL DEFAULT false,
    attempted_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username     ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);


-- ─── TABLE: refresh_tokens (FIXED) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,  -- ✅ FIXED: token → token_hash (SHA256 = 64 chars)
    expires_at  TIMESTAMPTZ NOT NULL,
    is_revoked  BOOLEAN     NOT NULL DEFAULT false,  -- ✅ ADDED
    revoked_at  TIMESTAMPTZ,                          -- ✅ ADDED
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)  -- ✅ FIXED constraint name
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);  -- ✅ ADDED


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


-- ─── TABLE: certificates (FIXED) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificates (
    id                 SERIAL PRIMARY KEY,
    certificate_number VARCHAR(50)  NOT NULL,
    head_branch_id     INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    current_branch_id  INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status             VARCHAR(20)  NOT NULL DEFAULT 'in_stock'
                           CHECK (status IN ('in_stock', 'reserved', 'printed')),
    medal_included     BOOLEAN      NOT NULL DEFAULT false,
    created_by         INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT certificates_number_key UNIQUE (certificate_number)
);
-- ✅ REMOVED: reserved_by, reserved_at, reservation_expires_at (diganti dengan table certificate_reservations)

CREATE INDEX IF NOT EXISTS idx_certificates_head_branch_id    ON certificates(head_branch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_current_branch_id ON certificates(current_branch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status            ON certificates(status);


-- ─── TABLE: certificate_reservations (ADDED) ──────────────────────────────

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


-- ─── TABLE: certificate_migrations ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_migrations (
    id             SERIAL PRIMARY KEY,
    certificate_id INTEGER     NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    from_branch_id INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id   INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    migrated_by    INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    migrated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- ✅ ADDED for consistency
);

CREATE INDEX IF NOT EXISTS idx_cert_migrations_certificate_id ON certificate_migrations(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_migrations_migrated_by    ON certificate_migrations(migrated_by);
CREATE INDEX IF NOT EXISTS idx_cert_migrations_migrated_at    ON certificate_migrations(migrated_at);


-- ─── TABLE: students ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    head_branch_id INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_head_branch_id ON students(head_branch_id);
CREATE INDEX IF NOT EXISTS idx_students_name           ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_is_active      ON students(is_active);


-- ─── TABLE: certificate_prints (FIXED) ────────────────────────────────────

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
    printed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),  -- ✅ ADDED
    CONSTRAINT certificate_prints_certificate_id_key UNIQUE (certificate_id)
);
-- ✅ REMOVED: pdf_path (diganti dengan table certificate_pdfs)

CREATE INDEX IF NOT EXISTS idx_cert_prints_certificate_id ON certificate_prints(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_student_id     ON certificate_prints(student_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_teacher_id     ON certificate_prints(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_branch_id      ON certificate_prints(branch_id);
CREATE INDEX IF NOT EXISTS idx_cert_prints_ptc_date       ON certificate_prints(ptc_date);
CREATE INDEX IF NOT EXISTS idx_cert_prints_printed_at     ON certificate_prints(printed_at);


-- ─── TABLE: certificate_pdfs (ADDED) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_pdfs (
    id                    SERIAL PRIMARY KEY,
    certificate_print_id  INTEGER      NOT NULL REFERENCES certificate_prints(id) ON DELETE CASCADE,
    uploaded_by           INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename              VARCHAR(255) NOT NULL,  -- Stored filename (generated)
    original_filename     VARCHAR(255) NOT NULL,  -- User's original filename
    file_path             VARCHAR(500) NOT NULL,  -- Full path to file on disk
    file_size             INTEGER      NOT NULL,  -- File size in bytes
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT certificate_pdfs_print_id_key UNIQUE (certificate_print_id)  -- One PDF per print
);

CREATE INDEX IF NOT EXISTS idx_cert_pdfs_print_id    ON certificate_pdfs(certificate_print_id);
CREATE INDEX IF NOT EXISTS idx_cert_pdfs_uploaded_by ON certificate_pdfs(uploaded_by);


-- ─── TABLE: certificate_logs (FIXED) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificate_logs (
    id             SERIAL PRIMARY KEY,
    certificate_id INTEGER      REFERENCES certificates(id) ON DELETE SET NULL,
    action_type    VARCHAR(30)  NOT NULL CHECK (action_type IN ('bulk_create','migrate','reserve','release','print')),
    actor_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role     VARCHAR(20)  NOT NULL,
    from_branch_id INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id   INTEGER      REFERENCES branches(id) ON DELETE SET NULL,
    metadata       JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()  -- ✅ No alias needed in CREATE TABLE
);
-- ✅ FIXED: action_type value 'cancel_reserve' → 'release' (sesuai dengan service)

CREATE INDEX IF NOT EXISTS idx_cert_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_logs_actor_id       ON certificate_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_cert_logs_action_type    ON certificate_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_cert_logs_created_at     ON certificate_logs(created_at);


-- ─── TABLE: database_backups (ADDED) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS database_backups (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL,
    file_path   VARCHAR(500) NOT NULL,
    file_size   BIGINT       NOT NULL,  -- File size in bytes
    created_by  INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id   INTEGER      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_db_backups_created_by ON database_backups(created_by);
CREATE INDEX IF NOT EXISTS idx_db_backups_branch_id  ON database_backups(branch_id);
CREATE INDEX IF NOT EXISTS idx_db_backups_created_at ON database_backups(created_at);


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'branches', 'users', 'login_attempts', 'refresh_tokens',
        'divisions', 'sub_divisions', 'modules',
        'teacher_branches', 'teacher_divisions',
        'certificates', 'certificate_reservations', 'certificate_migrations',
        'students', 'certificate_prints', 'certificate_pdfs',
        'certificate_logs', 'database_backups'
    ];
    v_table  TEXT;
    v_exists BOOLEAN;
    v_all_ok BOOLEAN := true;
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
            RAISE WARNING '  ✗ % — TIDAK DITEMUKAN!', v_table;
            v_all_ok := false;
        END IF;
    END LOOP;

    RAISE NOTICE '───────────────────────────────────────────────────';
    IF v_all_ok THEN
        RAISE NOTICE 'Semua % table berhasil dibuat.', array_length(v_tables, 1);
        RAISE NOTICE 'Lanjut jalankan:';
        RAISE NOTICE '  Development  → 00_seed_data.sql';
        RAISE NOTICE '  Production   → 01_seed_super_admin.sql';
    ELSE
        RAISE EXCEPTION 'Beberapa table gagal dibuat. Periksa error di atas.';
    END IF;
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;