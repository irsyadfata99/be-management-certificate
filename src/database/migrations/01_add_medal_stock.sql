-- =============================================
-- Migration: 001_add_medal_stock.sql
-- Feature  : Medal Stock Management
-- =============================================
-- Perubahan:
--   1. CREATE TABLE branch_medal_stock
--   2. CREATE TABLE medal_stock_logs
--   3. ALTER TABLE certificate_prints ADD COLUMN is_reprint
--   4. ALTER TABLE certificate_logs   UPDATE action_type constraint
--
-- NOTE: kolom certificates.medal_included TIDAK di-drop.
--       Kolom tersebut masih dipakai oleh certificateModel.js.
--       Medal tracking kini independen via branch_medal_stock.
-- =============================================

BEGIN;


-- ─── 1. CREATE TABLE branch_medal_stock ──────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_medal_stock (
    id         SERIAL PRIMARY KEY,
    branch_id  INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT branch_medal_stock_branch_id_key UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_medal_stock_branch_id ON branch_medal_stock(branch_id);


-- ─── 2. CREATE TABLE medal_stock_logs ────────────────────────────────────

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


-- ─── 3. ALTER certificate_prints: tambah is_reprint ──────────────────────

ALTER TABLE certificate_prints
    ADD COLUMN IF NOT EXISTS is_reprint BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cert_prints_is_reprint ON certificate_prints(is_reprint);


-- ─── 4. ALTER certificate_logs: update action_type constraint ────────────

ALTER TABLE certificate_logs
    DROP CONSTRAINT IF EXISTS certificate_logs_action_type_check;

ALTER TABLE certificate_logs
    ADD CONSTRAINT certificate_logs_action_type_check
    CHECK (action_type IN ('bulk_create', 'migrate', 'reserve', 'release', 'print', 'reprint'));


-- ─── 5. INIT branch_medal_stock ──────────────────────────────────────────

INSERT INTO branch_medal_stock (branch_id, quantity)
SELECT id, 0
FROM branches
ON CONFLICT (branch_id) DO NOTHING;


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_medal_stock_exists BOOLEAN;
    v_medal_logs_exists  BOOLEAN;
    v_is_reprint_exists  BOOLEAN;
    v_stock_rows         INTEGER;
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

    SELECT COUNT(*) INTO v_stock_rows FROM branch_medal_stock;

    RAISE NOTICE '════════════════════════════════════════════════════';
    RAISE NOTICE '   MIGRATION 001_add_medal_stock — VERIFICATION    ';
    RAISE NOTICE '════════════════════════════════════════════════════';
    RAISE NOTICE '  branch_medal_stock created  : %', v_medal_stock_exists;
    RAISE NOTICE '  medal_stock_logs created     : %', v_medal_logs_exists;
    RAISE NOTICE '  is_reprint column added      : %', v_is_reprint_exists;
    RAISE NOTICE '  branch_medal_stock rows init : %', v_stock_rows;
    RAISE NOTICE '════════════════════════════════════════════════════';
    RAISE NOTICE '  medal_included di certificates TIDAK diubah.';
    RAISE NOTICE '  Medal tracking kini via branch_medal_stock.';
    RAISE NOTICE '════════════════════════════════════════════════════';
END $$;

COMMIT;