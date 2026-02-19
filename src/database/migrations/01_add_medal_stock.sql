-- =============================================
-- Migration: 001_add_medal_stock.sql
-- STATUS: DEPRECATED — SAFE TO SKIP
-- =============================================
-- Semua perubahan dari file ini telah dimerge
-- langsung ke init_database.sql:
--
--   ✓ CREATE TABLE branch_medal_stock
--   ✓ CREATE TABLE medal_stock_logs
--   ✓ ALTER TABLE certificate_prints ADD COLUMN is_reprint
--   ✓ certificate_logs action_type constraint (incl. 'reprint')
--
-- File ini hanya boleh dijalankan jika Anda masih
-- menggunakan init_database.sql LAMA (sebelum fix).
-- Jika sudah pakai init_database.sql yang baru,
-- JANGAN jalankan file ini — akan throw error karena
-- table/column sudah ada.
--
-- Untuk deployment fresh: cukup jalankan
--   1. init_database.sql
--   2. seed_development.sql (dev only)
-- =============================================

-- Uncomment di bawah ini HANYA jika masih pakai init_database.sql lama:

/*

BEGIN;

CREATE TABLE IF NOT EXISTS branch_medal_stock (
    id         SERIAL PRIMARY KEY,
    branch_id  INTEGER     NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT branch_medal_stock_branch_id_key UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_medal_stock_branch_id ON branch_medal_stock(branch_id);

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

ALTER TABLE certificate_prints
    ADD COLUMN IF NOT EXISTS is_reprint BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cert_prints_is_reprint ON certificate_prints(is_reprint);

ALTER TABLE certificate_logs
    DROP CONSTRAINT IF EXISTS certificate_logs_action_type_check;

ALTER TABLE certificate_logs
    ADD CONSTRAINT certificate_logs_action_type_check
    CHECK (action_type IN ('bulk_create', 'migrate', 'reserve', 'release', 'print', 'reprint'));

INSERT INTO branch_medal_stock (branch_id, quantity)
SELECT id, 0
FROM branches
ON CONFLICT (branch_id) DO NOTHING;

COMMIT;
