-- =============================================
-- Migration: 001_add_medal_stock.sql
-- Feature  : Medal Stock Management
-- =============================================
-- Perubahan:
--   1. DROP COLUMN certificates.medal_included
--   2. CREATE TABLE branch_medal_stock
--   3. CREATE TABLE medal_stock_logs
--   4. ALTER TABLE certificate_prints ADD COLUMN is_reprint
--   5. ALTER TABLE certificate_logs   UPDATE action_type constraint
-- =============================================

BEGIN;

-- ─── 1. DROP medal_included dari certificates ─────────────────────────────

ALTER TABLE certificates DROP COLUMN IF EXISTS medal_included;


-- ─── 2. CREATE TABLE branch_medal_stock ──────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_medal_stock (
    id         SERIAL PRIMARY KEY,
    branch_id  INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT branch_medal_stock_branch_id_key UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_medal_stock_branch_id ON branch_medal_stock(branch_id);


-- ─── 3. CREATE TABLE medal_stock_logs ────────────────────────────────────

CREATE TABLE IF NOT EXISTS medal_stock_logs (
    id           SERIAL PRIMARY KEY,
    branch_id    INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    action_type  VARCHAR(20) NOT NULL
                     CHECK (action_type IN ('add', 'migrate_in', 'migrate_out', 'consume')),
    quantity     INTEGER     NOT NULL CHECK (quantity > 0),
    actor_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reference_id INTEGER,    -- print_id jika action_type = 'consume'
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medal_logs_branch_id   ON medal_stock_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_medal_logs_actor_id    ON medal_stock_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_medal_logs_action_type ON medal_stock_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_medal_logs_created_at  ON medal_stock_logs(created_at);


-- ─── 4. ALTER certificate_prints: tambah is_reprint ──────────────────────

ALTER TABLE certificate_prints
    ADD COLUMN IF NOT EXISTS is_reprint BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cert_prints_is_reprint ON certificate_prints(is_reprint);


-- ─── 5. ALTER certificate_logs: update action_type constraint ────────────
-- Tambah 'reprint' ke allowed action_type

ALTER TABLE certificate_logs
    DROP CONSTRAINT IF EXISTS certificate_logs_action_type_check;

ALTER TABLE certificate_logs
    ADD CONSTRAINT certificate_logs_action_type_check
    CHECK (action_type IN ('bulk_create', 'migrate', 'reserve', 'release', 'print', 'reprint'));


-- ─── 6. INIT branch_medal_stock ──────────────────────────────────────────
-- Inisialisasi row untuk setiap branch yang sudah ada dengan quantity 0
-- (akan diisi oleh seed atau admin)

INSERT INTO branch_medal_stock (branch_id, quantity)
SELECT id, 0
FROM branches
ON CONFLICT (branch_id) DO NOTHING;


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_medal_stock_exists  BOOLEAN;
    v_medal_logs_exists   BOOLEAN;
    v_is_reprint_exists   BOOLEAN;
    v_medal_included_gone BOOLEAN;
    v_stock_rows          INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'branch_medal_stock'
    ) INTO v_medal_stock_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'medal_stock_logs'
    ) INTO v_medal_logs_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'certificate_prints'
          AND column_name  = 'is_reprint'
    ) INTO v_is_reprint_exists;

    SELECT NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'certificates'
          AND column_name  = 'medal_included'
    ) INTO v_medal_included_gone;

    SELECT COUNT(*) INTO v_stock_rows FROM branch_medal_stock;

    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '   MIGRATION 001_add_medal_stock — VERIFICATION   ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ branch_medal_stock created  : %', v_medal_stock_exists;
    RAISE NOTICE '  ✓ medal_stock_logs created     : %', v_medal_logs_exists;
    RAISE NOTICE '  ✓ is_reprint column added      : %', v_is_reprint_exists;
    RAISE NOTICE '  ✓ medal_included dropped       : %', v_medal_included_gone;
    RAISE NOTICE '  ✓ branch_medal_stock rows      : %', v_stock_rows;
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  Next step: jalankan seed update untuk set';
    RAISE NOTICE '  quantity medal sesuai stock certificate per branch';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;

COMMIT;