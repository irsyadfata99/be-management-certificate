-- =============================================
-- Tables: certificates, certificate_prints, certificate_migrations, certificate_reservations, certificate_logs
-- Description: Certificate management system with migration and reservation support
-- Created: 2026-02-11
-- =============================================

-- ─── Main Certificates Table ─────────────────────────────────────────────

CREATE TABLE certificates (
    id                  SERIAL PRIMARY KEY,
    certificate_number  VARCHAR(20) UNIQUE NOT NULL,
    head_branch_id      INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    current_branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status              VARCHAR(20) NOT NULL DEFAULT 'in_stock',
    medal_included      BOOLEAN NOT NULL DEFAULT true,
    created_by          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "createdAt"         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_certificate_number CHECK (LENGTH(TRIM(certificate_number)) >= 6),
    CONSTRAINT check_status CHECK (status IN ('in_stock', 'reserved', 'printed', 'migrated'))
);

-- ─── Certificate Prints ──────────────────────────────────────────────────

CREATE TABLE certificate_prints (
    id              SERIAL PRIMARY KEY,
    certificate_id  INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    student_name    VARCHAR(150) NOT NULL,
    module_id       INTEGER NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    ptc_date        DATE NOT NULL,
    teacher_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id       INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    printed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_student_name CHECK (LENGTH(TRIM(student_name)) >= 2),
    CONSTRAINT uq_certificate_print UNIQUE (certificate_id)
);

-- ─── Certificate Migrations ──────────────────────────────────────────────

CREATE TABLE certificate_migrations (
    id              SERIAL PRIMARY KEY,
    certificate_id  INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    from_branch_id  INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id    INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    migrated_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    migrated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Certificate Reservations ────────────────────────────────────────────

CREATE TABLE certificate_reservations (
    id              SERIAL PRIMARY KEY,
    certificate_id  INTEGER NOT NULL REFERENCES certificates(id) ON DELETE RESTRICT,
    teacher_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reserved_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_reservation_status CHECK (status IN ('active', 'released', 'completed'))
);

-- ─── Certificate Logs ────────────────────────────────────────────────────

CREATE TABLE certificate_logs (
    id              SERIAL PRIMARY KEY,
    certificate_id  INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
    action_type     VARCHAR(50) NOT NULL,
    actor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role      VARCHAR(20) NOT NULL,
    from_branch_id  INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id    INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    metadata        JSONB,
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_action_type CHECK (action_type IN (
        'bulk_create', 'migrate', 'reserve', 'release', 'print'
    )),
    CONSTRAINT check_actor_role CHECK (actor_role IN ('superAdmin', 'admin', 'teacher'))
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Certificates
CREATE INDEX idx_certificates_head_branch     ON certificates(head_branch_id);
CREATE INDEX idx_certificates_current_branch  ON certificates(current_branch_id);
CREATE INDEX idx_certificates_status          ON certificates(status);
CREATE INDEX idx_certificates_created_by      ON certificates(created_by);
CREATE INDEX idx_certificates_number          ON certificates(certificate_number);

-- Prints
CREATE INDEX idx_certificate_prints_cert_id   ON certificate_prints(certificate_id);
CREATE INDEX idx_certificate_prints_teacher   ON certificate_prints(teacher_id);
CREATE INDEX idx_certificate_prints_branch    ON certificate_prints(branch_id);
CREATE INDEX idx_certificate_prints_module    ON certificate_prints(module_id);
CREATE INDEX idx_certificate_prints_date      ON certificate_prints(ptc_date);

-- Migrations
CREATE INDEX idx_certificate_migrations_cert  ON certificate_migrations(certificate_id);
CREATE INDEX idx_certificate_migrations_from  ON certificate_migrations(from_branch_id);
CREATE INDEX idx_certificate_migrations_to    ON certificate_migrations(to_branch_id);
CREATE INDEX idx_certificate_migrations_by    ON certificate_migrations(migrated_by);
CREATE INDEX idx_certificate_migrations_date  ON certificate_migrations(migrated_at);

-- Reservations
CREATE INDEX idx_certificate_reservations_cert     ON certificate_reservations(certificate_id);
CREATE INDEX idx_certificate_reservations_teacher  ON certificate_reservations(teacher_id);
CREATE INDEX idx_certificate_reservations_status   ON certificate_reservations(status);
CREATE INDEX idx_certificate_reservations_expires  ON certificate_reservations(expires_at);

-- Logs
CREATE INDEX idx_certificate_logs_cert_id     ON certificate_logs(certificate_id);
CREATE INDEX idx_certificate_logs_actor       ON certificate_logs(actor_id);
CREATE INDEX idx_certificate_logs_action      ON certificate_logs(action_type);
CREATE INDEX idx_certificate_logs_created     ON certificate_logs("createdAt");
CREATE INDEX idx_certificate_logs_from_branch ON certificate_logs(from_branch_id);
CREATE INDEX idx_certificate_logs_to_branch   ON certificate_logs(to_branch_id);

-- ─── Triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER set_timestamp_certificates
    BEFORE UPDATE ON certificates
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_certificate_reservations
    BEFORE UPDATE ON certificate_reservations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ─── Comments ─────────────────────────────────────────────────────────────

COMMENT ON TABLE certificates IS 'Certificate inventory with status tracking';
COMMENT ON COLUMN certificates.certificate_number IS 'Unique certificate number e.g. No. 000001';
COMMENT ON COLUMN certificates.head_branch_id IS 'Original head branch where certificate was created';
COMMENT ON COLUMN certificates.current_branch_id IS 'Current location of certificate';
COMMENT ON COLUMN certificates.status IS 'in_stock, reserved, printed, migrated';
COMMENT ON COLUMN certificates.medal_included IS 'Always true - 1 certificate = 1 medal';

COMMENT ON TABLE certificate_prints IS 'Record of printed certificates with student and module info';
COMMENT ON COLUMN certificate_prints.ptc_date IS 'PTC (Parent-Teacher Conference) date';

COMMENT ON TABLE certificate_migrations IS 'History of certificate migrations between branches';

COMMENT ON TABLE certificate_reservations IS 'Temporary reservations (24 hours) to prevent concurrent access';
COMMENT ON COLUMN certificate_reservations.expires_at IS 'Auto-calculated: reserved_at + 24 hours';
COMMENT ON COLUMN certificate_reservations.status IS 'active, released (expired/cancelled), completed (printed)';

COMMENT ON TABLE certificate_logs IS 'Unified logs for all certificate actions';
COMMENT ON COLUMN certificate_logs.action_type IS 'bulk_create, migrate, reserve, release, print';
COMMENT ON COLUMN certificate_logs.metadata IS 'Additional data in JSON format (e.g., range, count, student_name)';